-- Boop Admin: portal do cliente 2.0 (banco, sem telas).
--
-- Três peças, só acrescentando (nada é renomeado nem apagado):
--
--   1. Avisos do cliente (`client_notifications`). `notifications` é da equipe
--      (user_id aponta para profiles) e continua como está; a conta do
--      cliente ganha uma tabela própria, gravada só pelo banco, quando:
--        - a equipe escreve no canal do cliente (chat do post, conversa do
--          projeto ou o canal, em Comunicação);
--        - um post entra em "Aguardando cliente";
--        - uma etapa do projeto pede a aprovação do cliente ou é concluída.
--      Cada conta vê só os seus avisos, e a tabela entra no Realtime, como a
--      da equipe.
--
--   2. Comunicação do cliente. O cliente lê e escreve no canal do cliente
--      ("Alterações – <cliente>") pelo portal, com as não lidas. Como nas
--      fases anteriores, nenhuma política das tabelas da equipe muda: tudo
--      passa por funções `portal_*` (security definer, search_path vazio)
--      que conferem private.my_client_ids() e devolvem só os campos
--      liberados. No fio do portal entram as mensagens gerais do canal e as
--      do chat dos posts e dos projetos que o cliente vê; a conversa sobre um
--      post que ainda não chegou a ele fica só com a equipe. A equipe também
--      conversa no canal do cliente sem que ele veja: a mensagem interna
--      (`messages.internal`) nunca sai pelo portal nem avisa o cliente.
--
--   3. Aprovação de etapas. A equipe marca, por tarefa, se a etapa precisa da
--      aprovação do cliente (e ela passa a ser vista por ele). Concluir uma
--      etapa dessas pede a aprovação; o cliente aprova (a etapa continua
--      concluída) ou pede ajustes com uma nota (a etapa volta para "Fazendo"),
--      por portal_review_step, no padrão de portal_review_post. O resultado
--      (aprovado ou pediu ajustes, nota, quem e quando) fica na tarefa, e a
--      resposta vira mensagem na conversa do projeto, ligada à tarefa: o
--      pedido de ajustes entra nos pendentes da equipe e se resolve quando a
--      tarefa é concluída de novo, e a equipe recebe o aviso de sempre
--      (client_approval ou client_change_request). Concluir de novo pede uma
--      nova aprovação.

-- Tipos -----------------------------------------------------------------------

create type public.client_notification_kind as enum (
  'team_message',
  'post_review',
  'step_approval',
  'step_done'
);

create type public.client_approval_result as enum ('approved', 'changes');

-- Conversa interna no canal do cliente --------------------------------------

-- A equipe escreve no canal do cliente o que ele não deve ver (ex.: "ele pediu
-- isso por WhatsApp, vale cobrar à parte?"). Só a equipe escreve mensagem
-- interna, só no canal do cliente (nos internos e diretos não faz sentido), e
-- só quem escreveu troca (virar interna apaga os avisos que o cliente já
-- recebeu dela). Padrão falso: o chat do post e a conversa do projeto, que já
-- falam com o cliente, continuam iguais.
alter table public.messages
  add column internal boolean not null default false;

comment on column public.messages.internal is
  'Mensagem interna no canal do cliente: só a equipe vê (o portal nunca devolve nem avisa).';

create function private.check_message_internal()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  channel_kind public.channel_kind;
begin
  if tg_op = 'UPDATE' then
    if new.internal is not distinct from old.internal or pg_trigger_depth() > 1 then
      return new;
    end if;
    if old.author_id is distinct from (select auth.uid()) then
      raise exception 'Só quem escreveu pode editar a mensagem.' using errcode = '42501';
    end if;
  end if;
  if not new.internal then
    return new;
  end if;

  select c.kind into channel_kind from public.channels c
   where c.id = case when tg_op = 'UPDATE' then old.channel_id else new.channel_id end;
  if channel_kind is distinct from 'client' then
    raise exception 'Só o canal do cliente tem mensagem interna.' using errcode = '23514';
  end if;
  if not exists (select 1 from public.profiles p where p.id = coalesce(new.author_id, old.author_id)) then
    raise exception 'Só a equipe escreve mensagem interna.' using errcode = '42501';
  end if;
  if tg_op = 'UPDATE' then
    delete from public.client_notifications n where n.message_id = new.id;
  end if;
  return new;
end;
$$;

create trigger check_message_internal
  before insert or update of internal on public.messages
  for each row execute function private.check_message_internal();

-- Aprovação de etapas ---------------------------------------------------------

alter table public.tasks
  add column client_approval_required boolean not null default false,
  add column client_approval public.client_approval_result,
  add column client_approval_note text check (char_length(client_approval_note) <= 5000),
  add column client_approval_by uuid references auth.users (id) on delete set null,
  add column client_approval_at timestamptz,
  add constraint tasks_client_approval_check check ((client_approval is null) = (client_approval_at is null));

comment on column public.tasks.client_approval_required is
  'Etapa que precisa da aprovação do cliente no portal (sempre vista por ele). Concluir pede a aprovação.';
comment on column public.tasks.client_approval is
  'Resposta do cliente à última conclusão: aprovado ou pediu ajustes. Só portal_review_step grava; concluir de novo limpa.';
comment on column public.tasks.client_approval_by is 'Conta do cliente que respondeu (auth.users).';

create index tasks_client_approval_by_idx on public.tasks (client_approval_by);

-- A equipe marca se a etapa precisa de aprovação, mas não grava a resposta do
-- cliente (só portal_review_step, com a conta do cliente). Etapa que precisa
-- de aprovação é sempre vista pelo cliente. Concluir de novo apaga a resposta
-- anterior (a conversa do projeto guarda o histórico) e pede outra aprovação.
create function private.set_task_client_approval()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.client_approval_required then
    new.client_visible := true;
  end if;
  if tg_op = 'INSERT' then
    new.client_approval := null;
    new.client_approval_note := null;
    new.client_approval_by := null;
    new.client_approval_at := null;
    return new;
  end if;
  -- Ajustes do próprio banco (conta apagada) passam direto.
  if pg_trigger_depth() = 1 and (select private.is_team_member()) then
    new.client_approval := old.client_approval;
    new.client_approval_note := old.client_approval_note;
    new.client_approval_by := old.client_approval_by;
    new.client_approval_at := old.client_approval_at;
  end if;
  if new.status = 'done' and old.status <> 'done' then
    new.client_approval := null;
    new.client_approval_note := null;
    new.client_approval_by := null;
    new.client_approval_at := null;
  end if;
  return new;
end;
$$;

create trigger set_task_client_approval
  before insert or update on public.tasks
  for each row execute function private.set_task_client_approval();

-- Etapa esperando a aprovação do cliente: precisa de aprovação, concluída e
-- sem resposta desde a conclusão.
create function private.step_awaiting_client(
  required boolean,
  visible boolean,
  status public.task_status,
  approval public.client_approval_result
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select coalesce(required and visible and status = 'done' and approval is null, false);
$$;

revoke all on function private.step_awaiting_client(boolean, boolean, public.task_status, public.client_approval_result) from public;

-- Avisos do cliente -----------------------------------------------------------

create table public.client_notifications (
  id uuid primary key default gen_random_uuid(),
  -- Quem recebe: uma conta de cliente (client_members), nunca da equipe.
  user_id uuid not null references auth.users (id) on delete cascade,
  -- O cliente do aviso (a conta pode ter mais de um).
  client_id uuid not null references public.clients (id) on delete cascade,
  kind public.client_notification_kind not null,
  -- Quem da equipe fez, no momento (vazio quando foi o banco).
  actor_name text check (char_length(actor_name) <= 120),
  -- Do que se trata: o post, a etapa ou o projeto da mensagem (vazio no
  -- canal).
  title text check (char_length(title) <= 300),
  -- Trecho da mensagem ou o projeto da etapa.
  body text check (char_length(body) <= 300),
  -- Endereço dentro do portal: sempre um caminho de /portal.
  link text not null check (char_length(link) <= 300 and link ~ '^/portal(/|\?|$)'),
  channel_id uuid references public.channels (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  post_id uuid references public.content_posts (id) on delete cascade,
  project_id uuid references public.projects (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.client_notifications is
  'Avisos das contas de cliente no portal (respostas da equipe, posts e etapas para aprovar, etapas concluídas). Gravados só pelo banco.';

create index client_notifications_user_id_idx on public.client_notifications (user_id, created_at desc);
create index client_notifications_unread_idx on public.client_notifications (user_id) where read_at is null;
create index client_notifications_client_id_idx on public.client_notifications (client_id);
create index client_notifications_channel_id_idx on public.client_notifications (channel_id);
create index client_notifications_message_id_idx on public.client_notifications (message_id);
create index client_notifications_post_id_idx on public.client_notifications (post_id);
create index client_notifications_project_id_idx on public.client_notifications (project_id);
create index client_notifications_task_id_idx on public.client_notifications (task_id);

-- Pela API, só a leitura muda (com a hora do banco). Ajustes do próprio banco
-- passam direto.
create function private.set_client_notification_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  read_at timestamptz := case
    when new.read_at is null then null
    when old.read_at is null then now()
    else old.read_at
  end;
begin
  if pg_trigger_depth() > 1 then
    return new;
  end if;
  new := old;
  new.read_at := read_at;
  return new;
end;
$$;

create trigger set_client_notification_fields
  before update on public.client_notifications
  for each row execute function private.set_client_notification_fields();

-- Um aviso para cada conta do cliente (ativo), menos quem fez. O nome de quem
-- fez vem do perfil da equipe.
create function private.notify_client_members(
  p_client uuid,
  p_actor uuid,
  p_kind public.client_notification_kind,
  p_title text,
  p_body text,
  p_link text,
  p_channel uuid default null,
  p_message uuid default null,
  p_post uuid default null,
  p_project uuid default null,
  p_task uuid default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_name text := (select left(p.full_name, 120) from public.profiles p where p.id = p_actor);
begin
  if not exists (select 1 from public.clients c where c.id = p_client and c.active) then
    return;
  end if;
  insert into public.client_notifications (
    user_id, client_id, kind, actor_name, title, body, link, channel_id, message_id, post_id, project_id, task_id
  )
  select m.user_id, p_client, p_kind, actor_name, left(p_title, 300), left(p_body, 300), p_link,
         p_channel, p_message, p_post, p_project, p_task
    from public.client_members m
   where m.client_id = p_client
     and m.user_id is distinct from p_actor;
end;
$$;

revoke all on function private.notify_client_members(
  uuid, uuid, public.client_notification_kind, text, text, text, uuid, uuid, uuid, uuid, uuid
) from public;

-- Mensagem da equipe no canal do cliente: avisa as contas do cliente, se ele
-- vê a mensagem no portal (não interna; geral, de um post que já chegou a ele
-- ou de um projeto não cancelado).
create function private.notify_client_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.channels%rowtype;
  post public.content_posts%rowtype;
  project public.projects%rowtype;
  subject text;
  target text;
begin
  if new.kind = 'system' or new.author_id is null or new.internal then
    return null;
  end if;
  select * into ch from public.channels c where c.id = new.channel_id;
  if ch.kind is distinct from 'client' then
    return null;
  end if;
  -- Só a equipe avisa o cliente (o que o cliente escreve avisa a equipe).
  if not exists (select 1 from public.profiles p where p.id = new.author_id) then
    return null;
  end if;

  if new.post_id is not null then
    select * into post from public.content_posts p where p.id = new.post_id;
    if not found or not private.portal_visible_post(post.id, post.stage) then
      return null;
    end if;
    subject := post.title;
    target := '/portal/posts/' || post.id;
  elsif new.project_id is not null then
    select * into project from public.projects p where p.id = new.project_id;
    if not found or project.status = 'canceled' then
      return null;
    end if;
    subject := project.name;
    target := '/portal/projetos/' || project.id;
  else
    target := '/portal/comunicacao?cliente=' || ch.client_id;
  end if;

  perform private.notify_client_members(
    ch.client_id, new.author_id, 'team_message', subject,
    left(trim(regexp_replace(new.body, '\s+', ' ', 'g')), 280), target,
    p_channel => ch.id, p_message => new.id, p_post => new.post_id, p_project => new.project_id
  );
  return null;
end;
$$;

create trigger notify_client_message
  after insert on public.messages
  for each row execute function private.notify_client_message();

-- Post entra em "Aguardando cliente": avisa o cliente. Quando sai (aprovado,
-- ajuste ou a equipe voltou a etapa), os avisos dele ficam lidos.
create function private.notify_client_post_review()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.stage = 'client_review' and (tg_op = 'INSERT' or old.stage <> 'client_review') then
    perform private.notify_client_members(
      new.client_id, (select auth.uid()), 'post_review', new.title, null, '/portal/posts/' || new.id,
      p_post => new.id
    );
  elsif tg_op = 'UPDATE' and old.stage = 'client_review' and new.stage <> 'client_review' then
    update public.client_notifications n
       set read_at = now()
     where n.post_id = new.id
       and n.kind = 'post_review'
       and n.read_at is null;
  end if;
  return null;
end;
$$;

create trigger notify_client_post_review
  after insert or update of stage on public.content_posts
  for each row execute function private.notify_client_post_review();

-- Etapa do projeto: concluir uma que precisa de aprovação (ou marcar como
-- "precisa de aprovação" uma já concluída) pede a aprovação; concluir uma que
-- o cliente só vê avisa que foi concluída. Quando a etapa deixa de esperar o
-- cliente, os avisos de aprovação ficam lidos; reabrir a etapa apaga os
-- avisos dela ainda não lidos (ex.: concluída por engano e desfeita).
create function private.notify_client_step()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  was_awaiting boolean := private.step_awaiting_client(
    old.client_approval_required, old.client_visible, old.status, old.client_approval
  );
  is_awaiting boolean := private.step_awaiting_client(
    new.client_approval_required, new.client_visible, new.status, new.client_approval
  );
  notice public.client_notification_kind;
  project public.projects%rowtype;
begin
  if was_awaiting and not is_awaiting then
    update public.client_notifications n
       set read_at = now()
     where n.task_id = new.id
       and n.kind = 'step_approval'
       and n.read_at is null;
  end if;
  if old.status = 'done' and new.status <> 'done' then
    delete from public.client_notifications n
     where n.task_id = new.id
       and n.kind in ('step_approval', 'step_done')
       and n.read_at is null;
  end if;

  if is_awaiting and not was_awaiting then
    notice := 'step_approval';
  elsif new.status = 'done' and old.status <> 'done' and new.client_visible and not new.client_approval_required then
    notice := 'step_done';
  else
    return null;
  end if;

  select * into project from public.projects p where p.id = new.project_id;
  if not found or project.client_id is null or project.status = 'canceled' then
    return null;
  end if;
  perform private.notify_client_members(
    project.client_id, (select auth.uid()), notice, new.title, project.name, '/portal/projetos/' || project.id,
    p_project => project.id, p_task => new.id
  );
  return null;
end;
$$;

create trigger notify_client_step
  after update of status, client_visible, client_approval_required, client_approval on public.tasks
  for each row execute function private.notify_client_step();

-- Post ou projeto levado para outro cliente: os avisos do cliente anterior
-- sobre ele saem (ele não vê mais o item).
create function private.clear_moved_client_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.client_id is distinct from old.client_id then
    if tg_table_name = 'content_posts' then
      delete from public.client_notifications n
       where n.post_id = new.id and n.client_id is distinct from new.client_id;
    else
      delete from public.client_notifications n
       where n.project_id = new.id and n.client_id is distinct from new.client_id;
    end if;
  end if;
  return null;
end;
$$;

create trigger clear_moved_client_notifications
  after update of client_id on public.content_posts
  for each row execute function private.clear_moved_client_notifications();
create trigger clear_moved_client_notifications
  after update of client_id on public.projects
  for each row execute function private.clear_moved_client_notifications();

-- Acesso tirado: os avisos daquele cliente para a conta saem.
create function private.clear_member_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.client_notifications n
   where n.user_id = old.user_id
     and n.client_id = old.client_id;
  return null;
end;
$$;

create trigger clear_member_notifications
  after delete on public.client_members
  for each row execute function private.clear_member_notifications();

-- Cada aviso novo leva embora os de mais de 90 dias de quem o recebeu.
create function private.purge_old_client_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.client_notifications n
   where n.user_id in (select distinct a.user_id from added a)
     and n.created_at < now() - interval '90 days';
  return null;
end;
$$;

create trigger purge_old_client_notifications
  after insert on public.client_notifications
  referencing new table as added
  for each statement execute function private.purge_old_client_notifications();

-- Comunicação do cliente ------------------------------------------------------

-- Canal do cliente que a conta logada vê: do cliente dela e com o cliente
-- ativo.
create function private.portal_client_channel(target_client uuid)
returns uuid
language sql
stable
security definer
set search_path = ''
as $$
  select ch.id
    from public.channels ch
    join public.clients c on c.id = ch.client_id
   where ch.kind = 'client'
     and ch.client_id = target_client
     and c.active
     and target_client in (select private.my_client_ids());
$$;

revoke all on function private.portal_client_channel(uuid) from public;

-- Mensagem (não interna) do canal do cliente que aparece no portal: geral, de
-- um post que já chegou ao cliente ou de um projeto dele não cancelado. Quem
-- chama confere `internal`.
create function private.portal_channel_message_visible(target_client uuid, message_post uuid, message_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when message_post is not null then exists (
      select 1 from public.content_posts p
       where p.id = message_post
         and p.client_id = target_client
         and private.portal_visible_post(p.id, p.stage)
    )
    when message_project is not null then exists (
      select 1 from public.projects p
       where p.id = message_project
         and p.client_id = target_client
         and p.status <> 'canceled'
    )
    else true
  end;
$$;

revoke all on function private.portal_channel_message_visible(uuid, uuid, uuid) from public;

-- O canal do cliente no portal: nome, se está arquivado, não lidas (dos
-- outros, depois da última leitura), a última mensagem e até onde a conta
-- leu. Cliente de outra conta volta vazio.
create function public.portal_channel(target_client uuid)
returns table (
  channel_id uuid,
  name text,
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
         ch.name,
         ch.archived,
         (select count(*)::integer
            from public.messages m
           where m.channel_id = ch.id
             and m.author_id is distinct from (select auth.uid())
             and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)
             and not m.internal
             and private.portal_channel_message_visible(ch.client_id, m.post_id, m.project_id)),
         (select max(m.created_at)
            from public.messages m
           where m.channel_id = ch.id
             and not m.internal
             and private.portal_channel_message_visible(ch.client_id, m.post_id, m.project_id)),
         r.last_read_at
    from public.channels ch
    left join public.channel_reads r on r.channel_id = ch.id and r.user_id = (select auth.uid())
   where ch.id = private.portal_client_channel(target_client);
$$;

-- Uma página do fio do canal no portal: as mensagens mais recentes (ou as de
-- antes de `older_than`), da mais nova para a mais antiga, com o nome de quem
-- escreveu e o cartão do post ou do projeto. Até 200 por vez.
create function public.portal_channel_messages(
  target_client uuid,
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
         p.id,
         p.title,
         p.stage,
         p.format,
         p.cover_path,
         p.publish_on,
         pj.id,
         pj.name,
         m.created_at,
         m.edited_at
    from public.messages m
    join public.channels ch on ch.id = m.channel_id
    left join public.content_posts p on p.id = m.post_id
    left join public.projects pj on pj.id = m.project_id and m.post_id is null
    left join public.profiles pr on pr.id = m.author_id
    left join public.client_members cm on cm.user_id = m.author_id and cm.client_id = ch.client_id
   where m.channel_id = private.portal_client_channel(target_client)
     and (older_than is null or m.created_at < older_than)
     and not m.internal
     and private.portal_channel_message_visible(ch.client_id, m.post_id, m.project_id)
   order by m.created_at desc, m.id desc
   limit least(greatest(coalesce(max_count, 101), 1), 200);
$$;

-- O cliente escreve no canal (mensagem geral, sem post nem projeto).
create function public.portal_send_channel_message(target_client uuid, message_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_channel uuid := private.portal_client_channel(target_client);
  created uuid;
begin
  if target_channel is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;
  if char_length(trim(coalesce(message_body, ''))) not between 1 and 5000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;

  insert into public.messages (channel_id, author_id, kind, body)
  values (target_channel, (select auth.uid()), 'text', message_body)
  returning id into created;
  return created;
end;
$$;

-- A conta leu o canal até `read_until` (a hora da mensagem mais nova que ela
-- viu, como veio do banco). Nunca volta para trás nem passa de agora, e os
-- avisos das mensagens vistas ficam lidos.
create function public.portal_read_channel(target_client uuid, read_until timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  target_channel uuid := private.portal_client_channel(target_client);
  stamp timestamptz;
begin
  if target_channel is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;
  if read_until is null then
    raise exception 'invalid_read' using errcode = '22023';
  end if;

  insert into public.channel_reads (user_id, channel_id, last_read_at)
  values (me, target_channel, least(read_until, clock_timestamp()))
  on conflict (user_id, channel_id)
    do update set last_read_at = greatest(public.channel_reads.last_read_at, excluded.last_read_at)
  returning last_read_at into stamp;

  update public.client_notifications n
     set read_at = now()
    from public.messages m
   where n.user_id = me
     and n.channel_id = target_channel
     and n.read_at is null
     and m.id = n.message_id
     and m.created_at <= stamp;
end;
$$;

-- O chat do post e a conversa do projeto no portal deixam de fora as
-- mensagens internas (mesma assinatura; só o filtro é novo).
create or replace function public.portal_post_messages(target_post uuid)
returns table (
  id uuid,
  kind public.message_kind,
  body text,
  author_name text,
  from_team boolean,
  mine boolean,
  resolved boolean,
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
         m.created_at,
         m.edited_at
    from public.messages m
    join public.channels ch on ch.id = m.channel_id and ch.kind = 'client'
    join public.content_posts p on p.id = m.post_id and p.client_id = ch.client_id
    left join public.profiles pr on pr.id = m.author_id
    left join public.client_members cm on cm.user_id = m.author_id and cm.client_id = ch.client_id
   where m.post_id = target_post
     and not m.internal
     and private.portal_can_see_post(target_post)
   order by m.created_at;
$$;

create or replace function public.portal_project_messages(target_project uuid)
returns table (
  id uuid,
  kind public.message_kind,
  body text,
  author_name text,
  from_team boolean,
  mine boolean,
  resolved boolean,
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
         m.created_at,
         m.edited_at
    from public.messages m
    join public.channels ch on ch.id = m.channel_id and ch.kind = 'client'
    join public.projects p on p.id = m.project_id and p.client_id = ch.client_id
    left join public.profiles pr on pr.id = m.author_id
    left join public.client_members cm on cm.user_id = m.author_id and cm.client_id = ch.client_id
   where m.project_id = target_project
     and not m.internal
     and private.portal_can_see_project(target_project)
   order by m.created_at;
$$;

-- Aprovação de etapas no portal -----------------------------------------------

-- As etapas que pedem a aprovação do cliente, nos projetos dele (não
-- cancelados): se esperam a resposta e a última resposta (aprovado ou pediu
-- ajustes, nota, quem e quando). Serve ao painel e à página do projeto.
create function public.portal_step_approvals(target_client uuid)
returns table (
  id uuid,
  project_id uuid,
  project_name text,
  title text,
  status public.task_status,
  due_date date,
  completed_at timestamptz,
  awaiting boolean,
  approval public.client_approval_result,
  note text,
  decided_by_name text,
  decided_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id,
         p.id,
         p.name,
         t.title,
         t.status,
         t.due_date,
         t.completed_at,
         private.step_awaiting_client(t.client_approval_required, t.client_visible, t.status, t.client_approval),
         t.client_approval,
         t.client_approval_note,
         case when t.client_approval is not null then coalesce(cm.full_name, 'Conta removida') end,
         t.client_approval_at
    from public.tasks t
    join public.projects p on p.id = t.project_id
    join public.clients c on c.id = p.client_id
    left join public.client_members cm on cm.user_id = t.client_approval_by and cm.client_id = p.client_id
   where p.client_id = target_client
     and c.active
     and p.client_id in (select private.my_client_ids())
     and p.status <> 'canceled'
     and t.client_approval_required
     and t.client_visible
   order by private.step_awaiting_client(t.client_approval_required, t.client_visible, t.status, t.client_approval) desc,
            t.due_date nulls last, t.created_at;
$$;

-- Aprovar ou pedir ajustes numa etapa que espera o cliente. Aprovar mantém a
-- etapa concluída; pedir ajustes (com o que mudar) a volta para "Fazendo". As
-- duas viram mensagem na conversa do projeto, ligada à etapa (a de ajustes
-- fica pendente até a etapa ser concluída de novo).
create function public.portal_review_step(target_step uuid, decision text, note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  step public.tasks%rowtype;
  project public.projects%rowtype;
  target_channel uuid;
  text_note text := nullif(trim(coalesce(note, '')), '');
  created uuid;
begin
  if decision not in ('approve', 'changes') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  if decision = 'changes' and text_note is null then
    raise exception 'note_required' using errcode = '22023';
  end if;
  if char_length(coalesce(text_note, '')) > 4000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;

  select * into step from public.tasks t where t.id = target_step for update;
  if not found
    or step.project_id is null
    or not step.client_visible
    or not private.portal_can_see_project(step.project_id)
  then
    raise exception 'step_not_found' using errcode = 'P0002';
  end if;
  if not private.step_awaiting_client(step.client_approval_required, step.client_visible, step.status, step.client_approval) then
    raise exception 'not_awaiting_approval' using errcode = 'P0001';
  end if;

  select * into project from public.projects p where p.id = step.project_id;
  select ch.id into target_channel from public.channels ch where ch.client_id = project.client_id and ch.kind = 'client';
  if target_channel is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;

  update public.tasks t
     set client_approval = case when decision = 'approve' then 'approved' else 'changes' end::public.client_approval_result,
         client_approval_note = text_note,
         client_approval_by = (select auth.uid()),
         client_approval_at = now(),
         status = case when decision = 'approve' then t.status else 'doing'::public.task_status end
   where t.id = target_step;

  insert into public.messages (channel_id, project_id, task_id, author_id, kind, body)
  values (
    target_channel,
    project.id,
    step.id,
    (select auth.uid()),
    case when decision = 'approve' then 'approval'::public.message_kind else 'change_request'::public.message_kind end,
    case
      when decision = 'approve' and text_note is null then 'Aprovou a etapa “' || step.title || '”.'
      when decision = 'approve' then 'Aprovou a etapa “' || step.title || '”: ' || text_note
      else 'Pediu ajustes na etapa “' || step.title || '”: ' || text_note
    end
  )
  returning id into created;
  return created;
end;
$$;

-- Permissões ------------------------------------------------------------------

revoke execute on function public.portal_channel(uuid) from public, anon;
grant execute on function public.portal_channel(uuid) to authenticated;
revoke execute on function public.portal_channel_messages(uuid, timestamptz, integer) from public, anon;
grant execute on function public.portal_channel_messages(uuid, timestamptz, integer) to authenticated;
revoke execute on function public.portal_send_channel_message(uuid, text) from public, anon;
grant execute on function public.portal_send_channel_message(uuid, text) to authenticated;
revoke execute on function public.portal_read_channel(uuid, timestamptz) from public, anon;
grant execute on function public.portal_read_channel(uuid, timestamptz) to authenticated;
revoke execute on function public.portal_step_approvals(uuid) from public, anon;
grant execute on function public.portal_step_approvals(uuid) to authenticated;
revoke execute on function public.portal_review_step(uuid, text, text) from public, anon;
grant execute on function public.portal_review_step(uuid, text, text) to authenticated;

-- RLS -------------------------------------------------------------------------
-- Cada conta de cliente vê e marca como lidos só os próprios avisos, dos
-- clientes a que ainda tem acesso. Ninguém cria nem apaga pela API (só os
-- triggers). A equipe não tem nenhum (os dela ficam em notifications).

alter table public.client_notifications enable row level security;

create policy "cliente vê os próprios avisos" on public.client_notifications
  for select to authenticated
  using (user_id = (select auth.uid()) and client_id in (select private.my_client_ids()));
create policy "cliente marca os próprios avisos" on public.client_notifications
  for update to authenticated
  using (user_id = (select auth.uid()) and client_id in (select private.my_client_ids()))
  with check (user_id = (select auth.uid()) and client_id in (select private.my_client_ids()));

-- Realtime: o portal escuta os próprios avisos, como o sino da equipe. O
-- Realtime aplica o RLS acima.
alter publication supabase_realtime add table public.client_notifications;
