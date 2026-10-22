-- Mensagens de voz nas conversas: a equipe (canais, post, projeto, conversas
-- diretas) e o cliente no portal (canal do cliente e conversa direta) gravam
-- um áudio e enviam como mensagem.
--
--   * a mensagem continua uma linha de `messages`, com um texto ("🎤 Mensagem
--     de voz (0:12)") que serve à lista, aos avisos e ao código antigo;
--   * `message_audio` guarda o arquivo de cada uma (1 para 1, sai com ela);
--   * bucket privado `message-audio`, caminho "<quem gravou>/<uuid>": o app
--     manda o arquivo por uma URL assinada de envio e entrega o áudio por uma
--     URL assinada de leitura;
--   * quem lê o áudio é quem lê a mensagem: a equipe pelo RLS de `messages`;
--     o cliente pela mesma regra do portal (não interna, canal ou conversa
--     dele, post ou projeto que chegou a ele);
--   * as funções `send_audio_message` (equipe) e `portal_send_*_audio`
--     (cliente) gravam a mensagem e o áudio juntos.
-- Tudo aditivo: o código que já está na main continua funcionando.

-- Tabela ----------------------------------------------------------------------

create table public.message_audio (
  message_id uuid primary key references public.messages (id) on delete cascade,
  -- "<auth.uid() de quem gravou>/<uuid>" no bucket message-audio.
  storage_path text not null unique check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  mime_type text not null check (char_length(mime_type) between 1 and 100),
  -- Até 5 minutos.
  duration_ms integer not null check (duration_ms between 1 and 300000),
  size_bytes bigint not null check (size_bytes between 1 and 10485760),
  created_at timestamptz not null default now()
);
comment on table public.message_audio is
  'Áudio das mensagens de voz (arquivo no bucket message-audio). Quem lê a mensagem ouve o áudio.';

-- Portal: o cliente vê a mensagem ----------------------------------------------

-- A mesma regra das funções `portal_channel_messages`, `portal_direct_messages`
-- e do chat do post: não interna, no canal do cliente dele (com o post ou o
-- projeto já visíveis) ou na conversa direta dele.
create function private.portal_can_see_message(target_message uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.messages m
      join public.channels ch on ch.id = m.channel_id
     where m.id = target_message
       and not m.internal
       and (
         (ch.kind = 'client'
           and ch.id = private.portal_client_channel(ch.client_id)
           and private.portal_channel_message_visible(ch.client_id, m.post_id, m.project_id))
         or (ch.kind = 'direct'
           and ch.id = private.portal_direct_channel(ch.id))
       )
  );
$$;

revoke all on function private.portal_can_see_message(uuid) from public;
grant execute on function private.portal_can_see_message(uuid) to authenticated;

-- RLS -------------------------------------------------------------------------

alter table public.message_audio enable row level security;

-- A equipe vê o áudio das mensagens que vê (o RLS de `messages` vale dentro
-- do exists); o cliente, o das mensagens que o portal mostra a ele. Gravar é
-- só pelas funções abaixo; apagar, só junto com a mensagem.
create policy "quem vê a mensagem vê o áudio" on public.message_audio
  for select to authenticated
  using (
    exists (select 1 from public.messages m where m.id = message_id)
    or private.portal_can_see_message(message_id)
  );

-- Gravar ----------------------------------------------------------------------

-- Confere o arquivo enviado: no bucket, na pasta de quem grava, de áudio, até
-- 10 MB e ainda sem mensagem. Devolve o tipo e o tamanho que o Storage
-- registrou (não os que o navegador disse).
create function private.uploaded_audio(audio_path text)
returns table (mime_type text, size_bytes bigint)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  found_mime text;
  found_size bigint;
begin
  if audio_path is null or split_part(audio_path, '/', 1) <> (select auth.uid())::text then
    raise exception 'invalid_audio' using errcode = '22023';
  end if;
  select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint
    into found_mime, found_size
    from storage.objects o
   where o.bucket_id = 'message-audio'
     and o.name = audio_path;
  if found_mime is null or found_mime not like 'audio/%' or coalesce(found_size, 0) not between 1 and 10485760 then
    raise exception 'invalid_audio' using errcode = '22023';
  end if;
  if exists (select 1 from public.message_audio a where a.storage_path = audio_path) then
    raise exception 'invalid_audio' using errcode = '22023';
  end if;
  return query select found_mime, found_size;
end;
$$;

revoke all on function private.uploaded_audio(text) from public;

-- Texto da mensagem de voz: "🎤 Mensagem de voz (1:05)".
create function private.audio_message_body(duration_ms integer)
returns text
language sql
immutable
set search_path = ''
as $$
  select '🎤 Mensagem de voz (' || (duration_ms / 60000)::text || ':'
         || lpad(((duration_ms / 1000) % 60)::text, 2, '0') || ')';
$$;

revoke all on function private.audio_message_body(integer) from public;

-- A equipe envia uma mensagem de voz: as mesmas regras de escrever no canal
-- (RLS de `messages`: da equipe, como ela mesma, num canal que ela vê; os
-- triggers conferem arquivado, interna, post e projeto do mesmo cliente).
-- O conector do Claude não grava áudio.
create function public.send_audio_message(
  target_channel uuid,
  audio_path text,
  duration_ms integer,
  message_kind public.message_kind default 'text',
  target_post uuid default null,
  target_project uuid default null,
  is_internal boolean default false
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  audio record;
  created uuid;
begin
  if not (select private.is_team_member())
     or (select private.is_oauth_client())
     or target_channel is null
     or target_channel not in (select private.team_channel_ids()) then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;
  if message_kind is null or message_kind = 'system' then
    raise exception 'invalid_kind' using errcode = '22023';
  end if;
  if duration_ms is null or duration_ms not between 1 and 300000 then
    raise exception 'invalid_audio' using errcode = '22023';
  end if;
  select * into audio from private.uploaded_audio(audio_path);

  insert into public.messages (channel_id, author_id, kind, body, post_id, project_id, internal)
  values (
    target_channel, me, message_kind, private.audio_message_body(duration_ms),
    target_post, target_project, coalesce(is_internal, false)
  )
  returning id into created;
  insert into public.message_audio (message_id, storage_path, mime_type, duration_ms, size_bytes)
  values (created, audio_path, audio.mime_type, duration_ms, audio.size_bytes);
  return created;
end;
$$;

-- O cliente envia uma mensagem de voz no canal do cliente.
create function public.portal_send_channel_audio(target_client uuid, audio_path text, duration_ms integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_channel uuid := private.portal_client_channel(target_client);
  audio record;
  created uuid;
begin
  if found_channel is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;
  if duration_ms is null or duration_ms not between 1 and 300000 then
    raise exception 'invalid_audio' using errcode = '22023';
  end if;
  select * into audio from private.uploaded_audio(audio_path);

  insert into public.messages (channel_id, author_id, kind, body)
  values (found_channel, (select auth.uid()), 'text', private.audio_message_body(duration_ms))
  returning id into created;
  insert into public.message_audio (message_id, storage_path, mime_type, duration_ms, size_bytes)
  values (created, audio_path, audio.mime_type, duration_ms, audio.size_bytes);
  return created;
end;
$$;

-- A pessoa do cliente envia uma mensagem de voz na conversa direta.
create function public.portal_send_direct_audio(target_channel uuid, audio_path text, duration_ms integer)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_channel uuid := private.portal_direct_channel(target_channel);
  audio record;
  created uuid;
begin
  if found_channel is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;
  if duration_ms is null or duration_ms not between 1 and 300000 then
    raise exception 'invalid_audio' using errcode = '22023';
  end if;
  select * into audio from private.uploaded_audio(audio_path);

  insert into public.messages (channel_id, author_id, kind, body)
  values (found_channel, (select auth.uid()), 'text', private.audio_message_body(duration_ms))
  returning id into created;
  insert into public.message_audio (message_id, storage_path, mime_type, duration_ms, size_bytes)
  values (created, audio_path, audio.mime_type, duration_ms, audio.size_bytes);
  return created;
end;
$$;

revoke execute on function public.send_audio_message(uuid, text, integer, public.message_kind, uuid, uuid, boolean) from public, anon;
grant execute on function public.send_audio_message(uuid, text, integer, public.message_kind, uuid, uuid, boolean) to authenticated;
revoke execute on function public.portal_send_channel_audio(uuid, text, integer) from public, anon;
grant execute on function public.portal_send_channel_audio(uuid, text, integer) to authenticated;
revoke execute on function public.portal_send_direct_audio(uuid, text, integer) from public, anon;
grant execute on function public.portal_send_direct_audio(uuid, text, integer) to authenticated;

-- Arquivos ----------------------------------------------------------------------

-- Bucket privado, até 10 MB por áudio (5 minutos de voz ficam em ~1 MB).
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'message-audio', 'message-audio', false, 10485760,
  array['audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/x-m4a']
)
on conflict (id) do nothing;

-- Cada conta (equipe ou cliente) envia só na própria pasta.
create policy "cada um envia os próprios áudios" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'message-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
    and not (select private.is_oauth_client())
  );

-- Ouve quem vê a mensagem (pela linha de `message_audio`, com o RLS dela). A
-- pessoa também lê o próprio arquivo enviado e ainda sem mensagem.
create policy "quem vê a mensagem ouve o áudio" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'message-audio'
    and (
      (storage.foldername(name))[1] = (select auth.uid())::text
      or exists (select 1 from public.message_audio a where a.storage_path = name)
    )
  );

-- Apaga os próprios áudios (mensagem apagada ou envio desistido).
create policy "cada um apaga os próprios áudios" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'message-audio'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
