-- Boop Admin: Instagram dos clientes, parte 2/3 (publicar no horário).
--
-- Post do Instagram com imagem (estático, foto, carrossel ou story), com dia
-- e horário, aprovado e com "Publicar automaticamente" ligado sai sozinho na
-- conta conectada do cliente. Reels e vídeo ficam de fora: o app ainda não
-- guarda vídeo.
--
-- Ligar a opção (schedule_instagram_publish, com a sessão de quem agenda): o
-- app converte as imagens para JPEG (o único formato que a Meta aceita),
-- grava as cópias no bucket `content`, assina as URLs com a sessão da pessoa,
-- válidas até 3 dias depois do horário, e as guarda aqui fora da API
-- (`private.content_post_publish_media`), porque o job roda sem sessão e o
-- bucket é privado. O post vai para "Agendado" e entra na fila. Desligar
-- (cancel_instagram_publish) tira da fila e devolve as cópias para o app
-- apagar.
--
-- Publicar (o mesmo desenho da parte 1/3): o pg_cron chama, a cada 5
-- minutos, private.run_instagram_job('publish_due'); a rota do app pede os
-- posts que venceram (instagram_posts_due, que trava cada um no estado
-- "publicando" com `for update skip locked`, para não sair duas vezes), cria
-- os contêineres na Meta, publica e devolve o resultado
-- (instagram_post_published / instagram_post_failed / instagram_post_deferred).
-- Todas conferem o segredo do Vault. Falhou: tenta de novo nas rodadas
-- seguintes, até 3 vezes; na última, avisa a equipe (notificação nova
-- `instagram_publish_failed`).
--
-- As colunas novas do post só mudam pelas funções: um trigger devolve o valor
-- antigo quando a mudança vem direto da API.
--
-- Aditivo para o código que está na main: colunas novas com padrão, uma
-- tabela privada, um tipo novo de aviso, funções novas e um job novo.

-- Tipo do aviso ---------------------------------------------------------------

alter type public.notification_kind add value if not exists 'instagram_publish_failed';

-- Colunas do post -------------------------------------------------------------

alter table public.content_posts
  -- "Publicar automaticamente" ligado.
  add column auto_publish boolean not null default false,
  -- queued: na fila (ou esperando a Meta); publishing: o job está publicando;
  -- published: saiu no Instagram; failed: desistiu e avisou a equipe.
  add column publish_status text check (publish_status in ('queued', 'publishing', 'published', 'failed')),
  -- Último erro (da Meta ou do agendamento), sem token.
  add column publish_error text check (char_length(publish_error) <= 500),
  add column publish_attempts smallint not null default 0 check (publish_attempts between 0 and 20),
  add column publish_attempted_at timestamptz,
  -- O post publicado no Instagram.
  add column instagram_media_id text check (char_length(instagram_media_id) between 1 and 64),
  add column instagram_permalink text check (char_length(instagram_permalink) <= 500 and instagram_permalink ~ '^https://'),
  -- Cópias em JPEG no bucket `content` (`<client_id>/<arquivo>.jpg`), apagadas
  -- com o post, com o cliente ou ao desligar.
  add column publish_jpeg_paths text[] not null default '{}' check (cardinality(publish_jpeg_paths) <= 20);

comment on column public.content_posts.auto_publish is
  'Publicar automaticamente no Instagram no dia e horário. Muda só por schedule_instagram_publish / cancel_instagram_publish.';

create index content_posts_publish_queue_idx on public.content_posts (publish_on, publish_time)
  where auto_publish and publish_status = 'queued';

-- Imagens que vão para o Instagram, na ordem: a capa (estático, foto, story)
-- ou as imagens dos slides (carrossel). A mesma regra de publishSourcePaths.
create function private.content_publish_sources(p_format public.content_format, p_cover text, p_slides jsonb)
returns text[]
language sql
immutable
set search_path = ''
as $$
  select case
    when p_format in ('static', 'photo', 'stories') then array[p_cover]
    when p_format = 'carousel' then coalesce(
      (select array_agg(s.slide ->> 'image_path' order by s.n)
         from jsonb_array_elements(p_slides) with ordinality as s (slide, n)),
      '{}'::text[]
    )
    else '{}'::text[]
  end;
$$;

revoke all on function private.content_publish_sources(public.content_format, text, jsonb) from public;

-- Assinatura do que foi agendado (cliente, formato e imagens): se mudar
-- depois de agendar, as URLs guardadas não valem mais.
create function private.content_publish_signature(p_client_id uuid, p_format public.content_format, p_cover text, p_slides jsonb)
returns text
language sql
immutable
set search_path = ''
as $$
  select md5(concat_ws('|', p_client_id::text, p_format::text,
    array_to_string(private.content_publish_sources(p_format, p_cover, p_slides), ',', '-')));
$$;

revoke all on function private.content_publish_signature(uuid, public.content_format, text, jsonb) from public;

-- As colunas da publicação só mudam pelas funções (security definer, que
-- rodam como o dono). Pela API, voltam ao valor antigo (ou ao padrão, ao criar).
create function private.guard_content_post_publish()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') then
    return new;
  end if;
  if tg_op = 'INSERT' then
    new.auto_publish := false;
    new.publish_status := null;
    new.publish_error := null;
    new.publish_attempts := 0;
    new.publish_attempted_at := null;
    new.instagram_media_id := null;
    new.instagram_permalink := null;
    new.publish_jpeg_paths := '{}';
  else
    new.auto_publish := old.auto_publish;
    new.publish_status := old.publish_status;
    new.publish_error := old.publish_error;
    new.publish_attempts := old.publish_attempts;
    new.publish_attempted_at := old.publish_attempted_at;
    new.instagram_media_id := old.instagram_media_id;
    new.instagram_permalink := old.instagram_permalink;
    new.publish_jpeg_paths := old.publish_jpeg_paths;
  end if;
  return new;
end;
$$;

create trigger guard_content_post_publish
  before insert or update on public.content_posts
  for each row execute function private.guard_content_post_publish();

-- URLs assinadas, fora da API --------------------------------------------------

create table private.content_post_publish_media (
  post_id uuid primary key references public.content_posts (id) on delete cascade,
  -- Uma por imagem, na ordem (URLs assinadas do Storage, temporárias).
  media_urls text[] not null check (cardinality(media_urls) between 1 and 20),
  urls_expire_at timestamptz not null,
  signature text not null,
  -- Contêiner criado numa rodada anterior, ainda processando na Meta.
  container_id text check (char_length(container_id) between 1 and 64),
  container_created_at timestamptz,
  updated_at timestamptz not null default now()
);
comment on table private.content_post_publish_media is
  'URLs assinadas das imagens (JPEG) dos posts na fila do Instagram. Ninguém lê pela API; só as funções security definer.';

alter table private.content_post_publish_media enable row level security;
revoke all on private.content_post_publish_media from public, anon, authenticated;

-- Aviso da equipe -------------------------------------------------------------

-- A publicação desistiu: avisa a equipe toda, com o post e o motivo.
create function private.notify_instagram_publish_failed(p_post_ids uuid[])
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if coalesce(cardinality(p_post_ids), 0) = 0 then
    return;
  end if;
  insert into public.notifications (user_id, kind, actor_name, client_id, title, body, link, post_id)
  select pr.id, 'instagram_publish_failed', 'Instagram', p.client_id, left(p.title, 300),
         left(coalesce(p.publish_error, ''), 280), '/conteudo?post=' || p.id, p.id
    from public.content_posts p
   cross join public.profiles pr
   where p.id = any(p_post_ids);
end;
$$;

revoke all on function private.notify_instagram_publish_failed(uuid[]) from public;

-- Ligar e desligar (com a sessão) ---------------------------------------------

-- O app chama depois de converter as imagens e assinar as URLs. Confere de
-- novo as regras (etapa, rede, formato, data e as imagens, que precisam ser as
-- do post agora), põe na fila e leva o post para "Agendado". Devolve as cópias
-- antigas que saíram, para o app apagar do Storage.
create function public.schedule_instagram_publish(
  p_post_id uuid,
  p_sources text[],
  p_media_urls text[],
  p_jpeg_paths text[],
  p_urls_expire_at timestamptz
)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  post public.content_posts%rowtype;
  old_paths text[];
begin
  if not private.is_team_member() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into post from public.content_posts p where p.id = p_post_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if post.publish_status = 'publishing' then
    raise exception 'publishing' using errcode = '55000';
  end if;
  if post.publish_status = 'published' then
    raise exception 'already_published' using errcode = '55000';
  end if;
  if post.stage not in ('approved', 'scheduled') then
    raise exception 'stage' using errcode = '22023';
  end if;
  if not ('instagram' = any (post.networks)) or post.format not in ('static', 'photo', 'carousel', 'stories') then
    raise exception 'not_publishable' using errcode = '22023';
  end if;
  if post.publish_on is null or post.publish_time is null then
    raise exception 'no_time' using errcode = '22023';
  end if;
  if private.content_publish_sources(post.format, post.cover_path, post.slides) is distinct from p_sources
     or array_position(p_sources, null) is not null then
    raise exception 'media_changed' using errcode = '22023';
  end if;
  if cardinality(p_media_urls) is distinct from cardinality(p_sources)
     or exists (select 1 from unnest(p_media_urls) u (url) where u.url is null or u.url !~ '^https://' or char_length(u.url) > 2000)
     or p_urls_expire_at is null or p_urls_expire_at <= now() then
    raise exception 'invalid_media' using errcode = '22023';
  end if;

  old_paths := post.publish_jpeg_paths;
  update public.content_posts p
     set auto_publish = true,
         publish_status = 'queued',
         publish_error = null,
         publish_attempts = 0,
         publish_attempted_at = null,
         publish_jpeg_paths = coalesce(p_jpeg_paths, '{}'),
         stage = 'scheduled'
   where p.id = p_post_id;

  insert into private.content_post_publish_media (post_id, media_urls, urls_expire_at, signature)
  values (p_post_id, p_media_urls, p_urls_expire_at,
          private.content_publish_signature(post.client_id, post.format, post.cover_path, post.slides))
  on conflict (post_id) do update
    set media_urls = excluded.media_urls,
        urls_expire_at = excluded.urls_expire_at,
        signature = excluded.signature,
        container_id = null,
        container_created_at = null,
        updated_at = now();

  return array(select unnest(old_paths) except select unnest(coalesce(p_jpeg_paths, '{}')));
end;
$$;

revoke all on function public.schedule_instagram_publish(uuid, text[], text[], text[], timestamptz) from public, anon;
grant execute on function public.schedule_instagram_publish(uuid, text[], text[], text[], timestamptz) to authenticated;

-- Desliga e tira da fila (a etapa fica). Devolve as cópias em JPEG para o app
-- apagar. Publicado fica como está (o link continua no post).
create function public.cancel_instagram_publish(p_post_id uuid)
returns text[]
language plpgsql
security definer
set search_path = ''
as $$
declare
  post public.content_posts%rowtype;
begin
  if not private.is_team_member() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into post from public.content_posts p where p.id = p_post_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if post.publish_status = 'publishing' then
    raise exception 'publishing' using errcode = '55000';
  end if;
  if post.publish_status = 'published' then
    return '{}';
  end if;
  update public.content_posts p
     set auto_publish = false,
         publish_status = null,
         publish_error = null,
         publish_attempts = 0,
         publish_attempted_at = null,
         publish_jpeg_paths = '{}'
   where p.id = p_post_id;
  delete from private.content_post_publish_media m where m.post_id = p_post_id;
  return post.publish_jpeg_paths;
end;
$$;

revoke all on function public.cancel_instagram_publish(uuid) from public, anon;
grant execute on function public.cancel_instagram_publish(uuid) to authenticated;

-- Job sem sessão (segredo do Vault) -------------------------------------------

-- Posts que venceram. Antes, desiste (e avisa) dos que não têm como sair:
-- publicação interrompida no meio (o app caiu: não tenta de novo, para não
-- sair duas vezes), horário vencido há mais de 24 h, imagens mudadas depois
-- de agendar, links vencidos ou a conta do cliente desconectada. Depois trava
-- até 3 posts no estado "publicando" e os devolve com as URLs e o contêiner
-- guardado, se houver.
create function public.instagram_posts_due(p_secret text)
returns table (
  post_id uuid,
  client_id uuid,
  format text,
  caption text,
  media_urls text[],
  container_id text,
  container_created_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  failed uuid[];
begin
  if not private.instagram_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;

  with stuck as (
    update public.content_posts p
       set publish_status = 'failed',
           publish_attempts = p.publish_attempts + 1,
           publish_error = 'A publicação foi interrompida no meio. Confira no Instagram se o post saiu antes de tentar de novo.'
     where p.publish_status = 'publishing'
       and p.publish_attempted_at < now() - interval '15 minutes'
    returning p.id
  )
  select array_agg(s.id) into failed from stuck s;
  perform private.notify_instagram_publish_failed(failed);

  with blocked as (
    update public.content_posts p
       set publish_status = 'failed',
           publish_error = case
             when (p.publish_on + p.publish_time) at time zone 'America/Sao_Paulo' < now() - interval '24 hours'
               then 'O horário passou há mais de 24 horas sem publicar. Confira o dia e o horário e ligue a publicação de novo.'
             when m.post_id is null
               or m.signature is distinct from private.content_publish_signature(p.client_id, p.format, p.cover_path, p.slides)
               then 'O cliente, o formato ou as imagens mudaram depois de agendar. Abra o post e ligue a publicação de novo.'
             when m.urls_expire_at <= now() + interval '5 minutes'
               then 'Os links das imagens venceram. Abra o post e ligue a publicação de novo.'
             else 'O Instagram do cliente não está conectado (ou a conexão venceu). Conecte de novo e tente outra vez.'
           end
      from public.content_posts q
      left join private.content_post_publish_media m on m.post_id = q.id
     where q.id = p.id
       and p.auto_publish
       and p.publish_status = 'queued'
       and p.stage in ('approved', 'scheduled')
       and 'instagram' = any (p.networks)
       and p.format in ('static', 'photo', 'carousel', 'stories')
       and p.publish_on is not null
       and p.publish_time is not null
       and (p.publish_on + p.publish_time) at time zone 'America/Sao_Paulo' <= now()
       and (
         (p.publish_on + p.publish_time) at time zone 'America/Sao_Paulo' < now() - interval '24 hours'
         or m.post_id is null
         or m.signature is distinct from private.content_publish_signature(p.client_id, p.format, p.cover_path, p.slides)
         or m.urls_expire_at <= now() + interval '5 minutes'
         or not exists (
           select 1 from public.social_accounts a
            where a.client_id = p.client_id
              and a.network = 'instagram'
              and a.status <> 'expired'
              and a.token_expires_at > now()
         )
       )
    returning p.id
  )
  select array_agg(b.id) into failed from blocked b;
  perform private.notify_instagram_publish_failed(failed);

  return query
    with picked as (
      select p.id
        from public.content_posts p
       where p.auto_publish
         and p.publish_status = 'queued'
         and p.stage in ('approved', 'scheduled')
         and 'instagram' = any (p.networks)
         and p.format in ('static', 'photo', 'carousel', 'stories')
         and p.publish_on is not null
         and p.publish_time is not null
         and (p.publish_on + p.publish_time) at time zone 'America/Sao_Paulo' <= now()
       order by p.publish_on, p.publish_time
       limit 3
       for update of p skip locked
    ),
    marked as (
      update public.content_posts p
         set publish_status = 'publishing',
             publish_attempted_at = now()
        from picked
       where p.id = picked.id
      returning p.id, p.client_id, p.format, p.caption
    )
    select k.id, k.client_id, k.format::text, k.caption, m.media_urls, m.container_id, m.container_created_at
      from marked k
      join private.content_post_publish_media m on m.post_id = k.id;
end;
$$;

revoke all on function public.instagram_posts_due(text) from public;
grant execute on function public.instagram_posts_due(text) to anon, authenticated;

-- Saiu no Instagram: o post vai para "Publicado" (o trigger preenche
-- published_at), com o id e o link. As URLs guardadas saem.
create function public.instagram_post_published(
  p_secret text,
  p_post_id uuid,
  p_media_id text,
  p_permalink text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.instagram_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  update public.content_posts p
     set stage = 'published',
         publish_status = 'published',
         publish_error = null,
         instagram_media_id = left(p_media_id, 64),
         instagram_permalink = case
           when p_permalink ~ '^https://' and char_length(p_permalink) <= 500 then p_permalink
         end
   where p.id = p_post_id;
  delete from private.content_post_publish_media m where m.post_id = p_post_id;
end;
$$;

revoke all on function public.instagram_post_published(text, uuid, text, text) from public;
grant execute on function public.instagram_post_published(text, uuid, text, text) to anon, authenticated;

-- Não saiu: conta a tentativa e volta para a fila, ou desiste na 3ª (ou já,
-- quando tentar de novo não adianta ou pode publicar duas vezes) e avisa a
-- equipe. O contêiner guardado não serve mais.
create function public.instagram_post_failed(
  p_secret text,
  p_post_id uuid,
  p_error text,
  p_final boolean
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  result text;
begin
  if not private.instagram_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  update public.content_posts p
     set publish_attempts = p.publish_attempts + 1,
         publish_error = left(coalesce(nullif(trim(p_error), ''), 'Erro desconhecido.'), 500),
         publish_status = case when p_final or p.publish_attempts + 1 >= 3 then 'failed' else 'queued' end
   where p.id = p_post_id
     and p.publish_status = 'publishing'
  returning p.publish_status into result;
  update private.content_post_publish_media m
     set container_id = null, container_created_at = null, updated_at = now()
   where m.post_id = p_post_id;
  if result = 'failed' then
    perform private.notify_instagram_publish_failed(array[p_post_id]);
  end if;
  return result;
end;
$$;

revoke all on function public.instagram_post_failed(text, uuid, text, boolean) from public;
grant execute on function public.instagram_post_failed(text, uuid, text, boolean) to anon, authenticated;

-- Fica para a próxima rodada sem contar tentativa: a Meta ainda processa o
-- contêiner (guardado para não criar de novo), o limite de posts em 24 h foi
-- atingido ou o tempo da rodada acabou. A nota aparece no post.
create function public.instagram_post_deferred(
  p_secret text,
  p_post_id uuid,
  p_container_id text,
  p_note text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.instagram_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  update public.content_posts p
     set publish_status = 'queued',
         publish_error = left(nullif(trim(p_note), ''), 500)
   where p.id = p_post_id
     and p.publish_status = 'publishing';
  update private.content_post_publish_media m
     set container_created_at = case
           when p_container_id is null then null
           when m.container_id is distinct from p_container_id then now()
           else m.container_created_at
         end,
         container_id = left(p_container_id, 64),
         updated_at = now()
   where m.post_id = p_post_id;
end;
$$;

revoke all on function public.instagram_post_deferred(text, uuid, text, text) from public;
grant execute on function public.instagram_post_deferred(text, uuid, text, text) to anon, authenticated;

-- Publicação: a cada 5 minutos.
select cron.schedule(
  'instagram-publish-due',
  '*/5 * * * *',
  $$select private.run_instagram_job('publish_due')$$
);
