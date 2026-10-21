-- Boop Admin: conversas diretas com as pessoas do cliente.
--
-- Além do canal do cliente ("Alterações – <cliente>", de toda a equipe), uma
-- pessoa da equipe abre uma conversa só dela com uma pessoa do cliente (ex.:
-- Léo e Danielle, da Velmont). É uma conversa direta (`kind = 'direct'`),
-- como as da equipe, que também guarda o cliente e a conta da pessoa do
-- cliente (`client_user_id`); quem é da equipe fica em `channel_members`, como
-- sempre. Uma por par (pessoa da equipe, pessoa do cliente), aberta só por
-- open_client_direct_channel.
--
-- A equipe vê a conversa pelas políticas de sempre (team_channel_ids: só quem
-- participa). A conta do cliente lê e escreve só pelas funções
-- `portal_direct_*` (security definer, search_path vazio), que conferem a
-- própria conta, o cliente dela (private.my_client_ids()) e o cliente ativo.
-- Sem post, projeto, pedido de ajuste nem mensagem interna: é só conversa.
--
-- Avisos: o que a pessoa do cliente escreve avisa quem participa da equipe
-- (client_message, sem título: "mandou uma mensagem para você"); o que a
-- equipe escreve avisa a pessoa do cliente (team_message, sem título).
--
-- Aditivo para o código que está na main: o canal do cliente continua único
-- por cliente (o índice único passa a valer só para `kind = 'client'`) e as
-- conversas diretas da equipe continuam iguais.

-- Canal -----------------------------------------------------------------------

alter table public.channels
  add column client_user_id uuid references auth.users (id) on delete cascade;

comment on column public.channels.client_user_id is
  'Conversa direta com uma pessoa do cliente: a conta dela (client_members.user_id). Vazio nas outras.';

-- Cliente: só o canal do cliente e as conversas diretas com alguém do cliente
-- (as duas colunas juntas); canal interno e conversa da equipe, sem cliente.
alter table public.channels drop constraint channels_kind_client_check;
alter table public.channels add constraint channels_kind_client_check check (
  case kind
    when 'client' then client_id is not null and client_user_id is null
    when 'direct' then (client_id is null) = (client_user_id is null)
    else client_id is null and client_user_id is null
  end
);

-- Um canal de cliente por cliente (antes, uma restrição na coluna toda).
alter table public.channels drop constraint channels_client_id_key;
create unique index channels_client_id_key on public.channels (client_id) where kind = 'client';
create index channels_client_direct_idx on public.channels (client_id, client_user_id) where client_user_id is not null;
create index channels_client_user_id_idx on public.channels (client_user_id);

-- A pessoa do cliente da conversa não muda.
create function private.keep_channel_client_user()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.client_user_id := old.client_user_id;
  return new;
end;
$$;

create trigger keep_channel_client_user
  before update on public.channels
  for each row execute function private.keep_channel_client_user();

-- O canal do cliente nasce com o cliente (o índice único agora é parcial).
create or replace function private.sync_client_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.channels (kind, client_id, name, created_by)
    values (
      'client',
      new.id,
      left('Alterações – ' || trim(new.name), 120),
      (select p.id from public.profiles p where p.id = (select auth.uid()))
    )
    on conflict (client_id) where kind = 'client' do nothing;
  elsif new.name is distinct from old.name then
    update public.channels
       set name = left('Alterações – ' || trim(new.name), 120)
     where client_id = new.id and kind = 'client';
  end if;
  return null;
end;
$$;

-- Abrir a conversa ------------------------------------------------------------

-- Abre (ou cria) a conversa de quem chama com uma pessoa do cliente
-- (client_members.id): uma por par. Só a equipe. Reabre se estava arquivada.
create function public.open_client_direct_channel(member_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  member public.client_members%rowtype;
  found_id uuid;
begin
  if me is null or not private.is_team_member() then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  select * into member from public.client_members m where m.id = open_client_direct_channel.member_id;
  if not found then
    raise exception 'Essa pessoa não acessa mais o portal.' using errcode = 'P0002';
  end if;

  -- Duas abas abrindo a mesma conversa ao mesmo tempo: uma espera a outra.
  perform pg_advisory_xact_lock(hashtextextended(
    'client-direct:' || me::text || ':' || member.client_id::text || ':' || member.user_id::text,
    0
  ));

  select c.id into found_id
    from public.channels c
   where c.kind = 'direct'
     and c.client_id = member.client_id
     and c.client_user_id = member.user_id
     and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = me)
   order by c.created_at
   limit 1;

  if found_id is not null then
    update public.channels c set archived = false where c.id = found_id and c.archived;
    return found_id;
  end if;

  insert into public.channels (kind, client_id, client_user_id, created_by)
  values ('direct', member.client_id, member.user_id, me)
  returning id into found_id;
  insert into public.channel_members (channel_id, user_id) values (found_id, me);
  return found_id;
end;
$$;

revoke execute on function public.open_client_direct_channel(uuid) from public, anon;
grant execute on function public.open_client_direct_channel(uuid) to authenticated;

-- Avisos ----------------------------------------------------------------------

-- Igual à versão de 20261009163255_notifications, mais a conversa direta com
-- alguém do cliente: o que essa pessoa escreve avisa quem participa.
create or replace function private.notify_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.channels%rowtype;
  author_name text;
  subject text;
  excerpt text := left(trim(regexp_replace(new.body, '\s+', ' ', 'g')), 280);
  notice public.notification_kind;
begin
  if new.kind = 'system' or new.author_id is null then
    return null;
  end if;
  select * into ch from public.channels c where c.id = new.channel_id;
  select left(p.full_name, 120) into author_name from public.profiles p where p.id = new.author_id;

  if ch.kind in ('internal', 'direct') then
    if author_name is null then
      -- Conversa direta com alguém do cliente: a mensagem dessa pessoa.
      if ch.kind = 'direct' and ch.client_user_id is not null and new.author_id = ch.client_user_id then
        select left(cm.full_name, 120) into author_name
          from public.client_members cm
         where cm.user_id = new.author_id and cm.client_id = ch.client_id;
        if author_name is not null then
          insert into public.notifications (user_id, kind, actor_id, actor_name, client_id, title, body, link, channel_id, message_id)
          select m.user_id, 'client_message', new.author_id, author_name, ch.client_id, null, excerpt,
                 '/comunicacoes?canal=' || ch.id, ch.id, new.id
            from public.channel_members m
           where m.channel_id = ch.id;
        end if;
      end if;
      return null;
    end if;
    insert into public.notifications (user_id, kind, actor_id, actor_name, title, body, link, channel_id, message_id)
    select m.user_id, 'message', new.author_id, author_name, ch.name, excerpt, '/comunicacoes?canal=' || ch.id, ch.id, new.id
      from public.channel_members m
     where m.channel_id = ch.id
       and m.user_id <> new.author_id;
    return null;
  end if;

  -- Canal do cliente: mensagem da equipe não avisa.
  if author_name is not null then
    return null;
  end if;
  select left(cm.full_name, 120) into author_name
    from public.client_members cm
   where cm.user_id = new.author_id and cm.client_id = ch.client_id;
  if author_name is null then
    return null;
  end if;
  -- Do que se trata: o post ou o projeto da mensagem, ou o próprio canal.
  if new.post_id is not null then
    select p.title into subject from public.content_posts p where p.id = new.post_id;
  elsif new.project_id is not null then
    select p.name into subject from public.projects p where p.id = new.project_id;
  end if;
  notice := case new.kind
    when 'approval' then 'client_approval'::public.notification_kind
    when 'change_request' then 'client_change_request'::public.notification_kind
    else 'client_message'::public.notification_kind
  end;

  insert into public.notifications (
    user_id, kind, actor_id, actor_name, client_id, title, body, link, channel_id, message_id, post_id
  )
  select p.id, notice, new.author_id, author_name, ch.client_id, left(coalesce(subject, ch.name), 300), excerpt,
         case when new.post_id is not null then '/conteudo?post=' || new.post_id else '/comunicacoes?canal=' || ch.id end,
         ch.id, new.id, new.post_id
    from public.profiles p;
  return null;
end;
$$;

-- Mensagem da equipe na conversa direta com alguém do cliente: avisa essa
-- pessoa, se ela ainda acessa o cliente e o cliente está ativo.
create function private.notify_client_direct_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.channels%rowtype;
  author_name text;
begin
  if new.kind = 'system' or new.author_id is null then
    return null;
  end if;
  select * into ch from public.channels c where c.id = new.channel_id;
  if ch.kind is distinct from 'direct' or ch.client_user_id is null then
    return null;
  end if;
  select left(p.full_name, 120) into author_name from public.profiles p where p.id = new.author_id;
  if author_name is null
    or not exists (select 1 from public.clients c where c.id = ch.client_id and c.active)
    or not exists (
      select 1 from public.client_members m where m.client_id = ch.client_id and m.user_id = ch.client_user_id
    )
  then
    return null;
  end if;

  insert into public.client_notifications (user_id, client_id, kind, actor_name, title, body, link, channel_id, message_id)
  values (
    ch.client_user_id, ch.client_id, 'team_message', author_name, null,
    left(trim(regexp_replace(new.body, '\s+', ' ', 'g')), 280),
    '/portal/comunicacao?cliente=' || ch.client_id || '&conversa=' || ch.id,
    ch.id, new.id
  );
  return null;
end;
$$;

create trigger notify_client_direct_message
  after insert on public.messages
  for each row execute function private.notify_client_direct_message();

-- Portal ----------------------------------------------------------------------

-- Conversa direta da conta logada: ela é a pessoa do cliente da conversa, o
-- cliente é dela e está ativo.
create function private.portal_direct_channel(target_channel uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ch.id
    from public.channels ch
    join public.clients c on c.id = ch.client_id
   where ch.id = target_channel
     and ch.kind = 'direct'
     and ch.client_user_id = (select auth.uid())
     and c.active
     and ch.client_id in (select private.my_client_ids());
$$;

revoke all on function private.portal_direct_channel(uuid) from public;

-- As conversas diretas da conta com a equipe, por cliente: com quem (o nome e
-- a foto de quem participa da equipe), se está arquivada, não lidas, a última
-- mensagem e até onde a conta leu. A mais recente primeiro.
create function public.portal_direct_channels(target_client uuid)
returns table (
  channel_id uuid,
  team_name text,
  team_avatar_url text,
  archived boolean,
  unread integer,
  last_message_at timestamptz,
  last_read_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select ch.id,
         coalesce(
           (select string_agg(p.full_name, ', ' order by m.created_at)
              from public.channel_members m
              join public.profiles p on p.id = m.user_id
             where m.channel_id = ch.id),
           'Equipe da Boop'
         ),
         (select p.avatar_url
            from public.channel_members m
            join public.profiles p on p.id = m.user_id
           where m.channel_id = ch.id
           order by m.created_at
           limit 1),
         ch.archived,
         (select count(*)::integer
            from public.messages m
           where m.channel_id = ch.id
             and m.author_id is distinct from (select auth.uid())
             and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
         (select max(m.created_at) from public.messages m where m.channel_id = ch.id),
         r.last_read_at
    from public.channels ch
    join public.clients c on c.id = ch.client_id
    left join public.channel_reads r on r.channel_id = ch.id and r.user_id = (select auth.uid())
   where ch.kind = 'direct'
     and ch.client_id = target_client
     and ch.client_user_id = (select auth.uid())
     and c.active
     and target_client in (select private.my_client_ids())
   order by 6 desc nulls last, ch.created_at desc;
$$;

-- Uma página da conversa direta, como portal_channel_messages (as mesmas
-- colunas; sem post nem projeto). Até 200 por vez.
create function public.portal_direct_messages(
  target_channel uuid,
  older_than timestamptz default null,
  max_count integer default 101
)
returns table (
  id uuid,
  kind public.message_kind,
  body text,
  author_name text,
  from_team boolean,
  mine boolean,
  resolved boolean,
  post_id uuid,
  post_title text,
  post_stage public.content_stage,
  post_format public.content_format,
  post_cover_path text,
  post_publish_on date,
  project_id uuid,
  project_name text,
  created_at timestamptz,
  edited_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id,
         m.kind,
         m.body,
         coalesce(pr.full_name, cm.full_name, 'Conta removida'),
         pr.id is not null,
         m.author_id is not distinct from (select auth.uid()),
         m.resolved_at is not null,
         null::uuid,
         null::text,
         null::public.content_stage,
         null::public.content_format,
         null::text,
         null::date,
         null::uuid,
         null::text,
         m.created_at,
         m.edited_at
    from public.messages m
    join public.channels ch on ch.id = m.channel_id
    left join public.profiles pr on pr.id = m.author_id
    left join public.client_members cm on cm.user_id = m.author_id and cm.client_id = ch.client_id
   where m.channel_id = private.portal_direct_channel(target_channel)
     and (older_than is null or m.created_at < older_than)
     and not m.internal
   order by m.created_at desc, m.id desc
   limit least(greatest(coalesce(max_count, 101), 1), 200);
$$;

-- A pessoa do cliente escreve na conversa direta.
create function public.portal_send_direct_message(target_channel uuid, message_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  found_channel uuid := private.portal_direct_channel(target_channel);
  created uuid;
begin
  if found_channel is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;
  if char_length(trim(coalesce(message_body, ''))) not between 1 and 5000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;

  insert into public.messages (channel_id, author_id, kind, body)
  values (found_channel, (select auth.uid()), 'text', message_body)
  returning id into created;
  return created;
end;
$$;

-- A conta leu a conversa direta até `read_until`, como portal_read_channel.
create function public.portal_read_direct(target_channel uuid, read_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  found_channel uuid := private.portal_direct_channel(target_channel);
  stamp timestamptz;
begin
  if found_channel is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;
  if read_until is null then
    raise exception 'invalid_read' using errcode = '22023';
  end if;

  insert into public.channel_reads (user_id, channel_id, last_read_at)
  values (me, found_channel, least(read_until, clock_timestamp()))
  on conflict (user_id, channel_id)
    do update set last_read_at = greatest(public.channel_reads.last_read_at, excluded.last_read_at)
  returning last_read_at into stamp;

  update public.client_notifications n
     set read_at = now()
    from public.messages m
   where n.user_id = me
     and n.channel_id = found_channel
     and n.read_at is null
     and m.id = n.message_id
     and m.created_at <= stamp;
end;
$$;

revoke execute on function public.portal_direct_channels(uuid) from public, anon;
grant execute on function public.portal_direct_channels(uuid) to authenticated;
revoke execute on function public.portal_direct_messages(uuid, timestamptz, integer) from public, anon;
grant execute on function public.portal_direct_messages(uuid, timestamptz, integer) to authenticated;
revoke execute on function public.portal_send_direct_message(uuid, text) from public, anon;
grant execute on function public.portal_send_direct_message(uuid, text) to authenticated;
revoke execute on function public.portal_read_direct(uuid, timestamptz) from public, anon;
grant execute on function public.portal_read_direct(uuid, timestamptz) to authenticated;
