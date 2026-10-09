-- Boop Admin: central de notificações da equipe (banco, sem telas).
--
-- Uma linha por pessoa e aviso, gravada só pelo banco (triggers), nunca pelo
-- app:
--   - message: mensagem nova num canal interno ou numa conversa direta de que
--     a pessoa participa;
--   - client_message: mensagem de uma conta de cliente (portal) no canal do
--     cliente, para a equipe toda;
--   - client_approval e client_change_request: o cliente aprovou o post ou
--     pediu ajuste (portal_review_post), para a equipe toda;
--   - task_assigned: tarefa atribuída à pessoa. Várias tarefas atribuídas de
--     uma vez (modelo de projeto, checklist do processo, frentes do post) viram
--     um aviso só, com a quantidade.
-- Quem escreveu (ou atribuiu) não recebe. Mensagem da equipe no canal do
-- cliente não gera aviso: o canal é de toda a equipe e já entra nas não lidas.
--
-- Só a equipe recebe (user_id aponta para profiles): a conta do cliente não
-- tem nenhuma linha nem política. Cada pessoa lê e marca como lidas só as
-- suas; o resto da linha não muda.
--
-- O texto é uma cópia do momento, como num e-mail: do que se trata (canal,
-- post, tarefa ou projeto), o trecho da mensagem e o nome de quem fez. A frase
-- ("Jabez em Financeiro") é montada pelo app. Excluir a mensagem, o canal, o
-- post, a tarefa ou o cliente apaga os avisos ligados; sair de um canal apaga
-- os avisos dele; tirar a pessoa da tarefa apaga o aviso ainda não lido; ler o
-- canal marca como lidos os avisos das mensagens vistas. Avisos com mais de
-- 90 dias saem sozinhos.

-- Tipos -----------------------------------------------------------------------

create type public.notification_kind as enum (
  'message',
  'client_message',
  'client_approval',
  'client_change_request',
  'task_assigned'
);

-- Avisos ----------------------------------------------------------------------

create table public.notifications (
  id uuid primary key default gen_random_uuid(),
  -- Quem recebe: sempre alguém da equipe.
  user_id uuid not null references public.profiles (id) on delete cascade,
  kind public.notification_kind not null,
  -- Quem fez (equipe ou conta de cliente) e o nome no momento.
  actor_id uuid references auth.users (id) on delete set null,
  actor_name text check (char_length(actor_name) <= 120),
  -- O cliente, nos avisos que vêm do portal.
  client_id uuid references public.clients (id) on delete cascade,
  -- Do que se trata: o canal, o post, a tarefa (ou o projeto, quando são
  -- várias tarefas). Vazio na conversa direta.
  title text check (char_length(title) <= 300),
  -- Trecho da mensagem.
  body text check (char_length(body) <= 300),
  -- Quantas tarefas foram atribuídas de uma vez (1 nos outros avisos).
  item_count integer not null default 1 check (item_count >= 1),
  -- Endereço dentro do app: sempre um caminho, nunca outro site.
  link text not null check (char_length(link) <= 300 and link ~ '^/[^/\\]'),
  channel_id uuid references public.channels (id) on delete cascade,
  message_id uuid references public.messages (id) on delete cascade,
  post_id uuid references public.content_posts (id) on delete cascade,
  task_id uuid references public.tasks (id) on delete cascade,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
comment on table public.notifications is
  'Avisos da equipe (mensagens, portal do cliente, tarefas atribuídas), uma linha por pessoa. Gravados só pelo banco.';

-- Índices ---------------------------------------------------------------------

create index notifications_user_id_idx on public.notifications (user_id, created_at desc);
create index notifications_unread_idx on public.notifications (user_id) where read_at is null;
create index notifications_actor_id_idx on public.notifications (actor_id);
create index notifications_client_id_idx on public.notifications (client_id);
create index notifications_channel_id_idx on public.notifications (channel_id);
create index notifications_message_id_idx on public.notifications (message_id);
create index notifications_post_id_idx on public.notifications (post_id);
create index notifications_task_id_idx on public.notifications (task_id);

-- Leitura ---------------------------------------------------------------------

-- Pela API, só a leitura muda (com a hora do banco). Ajustes do próprio banco
-- (conta apagada, canal lido) passam direto.
create function private.set_notification_fields()
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

create trigger set_notification_fields
  before update on public.notifications
  for each row execute function private.set_notification_fields();

-- Mensagens -------------------------------------------------------------------

-- Canal interno ou conversa direta: os participantes, menos quem escreveu.
-- Canal do cliente: só o que a conta do cliente escreve, para a equipe toda
-- (aprovação e pedido de ajuste com tipo próprio).
create function private.notify_message()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.channels%rowtype;
  author_name text;
  post_title text;
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
  if new.post_id is not null then
    select p.title into post_title from public.content_posts p where p.id = new.post_id;
  end if;
  notice := case new.kind
    when 'approval' then 'client_approval'::public.notification_kind
    when 'change_request' then 'client_change_request'::public.notification_kind
    else 'client_message'::public.notification_kind
  end;

  insert into public.notifications (
    user_id, kind, actor_id, actor_name, client_id, title, body, link, channel_id, message_id, post_id
  )
  select p.id, notice, new.author_id, author_name, ch.client_id, left(coalesce(post_title, ch.name), 300), excerpt,
         case when new.post_id is not null then '/conteudo?post=' || new.post_id else '/comunicacoes?canal=' || ch.id end,
         ch.id, new.id, new.post_id
    from public.profiles p;
  return null;
end;
$$;

create trigger notify_message
  after insert on public.messages
  for each row execute function private.notify_message();

-- Ler o canal (channel_reads) marca como lidos os avisos das mensagens vistas.
create function private.read_channel_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.notifications n
     set read_at = now()
    from public.messages m
   where n.user_id = new.user_id
     and n.channel_id = new.channel_id
     and n.read_at is null
     and m.id = n.message_id
     and m.created_at <= new.last_read_at;
  return null;
end;
$$;

create trigger read_channel_notifications
  after insert or update of last_read_at on public.channel_reads
  for each row execute function private.read_channel_notifications();

-- Quem sai (ou é tirado) de um canal perde os avisos dele.
create function private.clear_channel_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
   using removed o
   where n.channel_id = o.channel_id
     and n.user_id = o.user_id;
  return null;
end;
$$;

create trigger clear_channel_notifications
  after delete on public.channel_members
  referencing old table as removed
  for each statement execute function private.clear_channel_notifications();

-- Tarefas ---------------------------------------------------------------------

-- Um aviso por pessoa e comando: uma tarefa leva a ela; várias de uma vez
-- levam ao projeto delas (quando é um só) ou às tarefas da pessoa. Quem
-- atribuiu não recebe, e sem alguém da equipe logado (SQL do painel, seed)
-- ninguém recebe.
create function private.notify_task_assigned()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  me_name text := (select left(p.full_name, 120) from public.profiles p where p.id = me);
begin
  if me_name is null then
    return null;
  end if;
  with grouped as (
    select a.profile_id,
           count(*)::integer as n,
           (array_agg(a.task_id order by t.created_at, t.id))[1] as first_task,
           case
             when bool_and(t.project_id is not null) and count(distinct t.project_id) = 1
               then (array_agg(t.project_id))[1]
           end as project_id
      from added a
      join public.tasks t on t.id = a.task_id
     where a.profile_id <> me
     group by a.profile_id
  )
  insert into public.notifications (user_id, kind, actor_id, actor_name, title, item_count, link, task_id)
  select g.profile_id,
         'task_assigned',
         me,
         me_name,
         left(case when g.n = 1 then t.title else pr.name end, 300),
         g.n,
         case
           when g.n = 1 then '/tarefas?tarefa=' || g.first_task
           when pr.id is not null then '/projetos/' || pr.id
           else '/tarefas?pessoa=mine'
         end,
         case when g.n = 1 then g.first_task end
    from grouped g
    left join public.tasks t on t.id = g.first_task
    left join public.projects pr on pr.id = g.project_id;
  return null;
end;
$$;

create trigger notify_task_assigned
  after insert on public.task_assignees
  referencing new table as added
  for each statement execute function private.notify_task_assigned();

-- Tirar a pessoa da tarefa apaga o aviso dela, se ainda não foi lido (ex.:
-- escolheu a pessoa errada e trocou logo depois).
create function private.clear_task_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
   using removed o
   where n.kind = 'task_assigned'
     and n.task_id = o.task_id
     and n.user_id = o.profile_id
     and n.read_at is null;
  return null;
end;
$$;

create trigger clear_task_notifications
  after delete on public.task_assignees
  referencing old table as removed
  for each statement execute function private.clear_task_notifications();

-- Limpeza ---------------------------------------------------------------------

-- Cada aviso novo leva embora os de mais de 90 dias de quem o recebeu.
create function private.purge_old_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.notifications n
   where n.user_id in (select distinct a.user_id from added a)
     and n.created_at < now() - interval '90 days';
  return null;
end;
$$;

create trigger purge_old_notifications
  after insert on public.notifications
  referencing new table as added
  for each statement execute function private.purge_old_notifications();

-- RLS -------------------------------------------------------------------------
-- Cada pessoa da equipe vê e marca como lidas só as próprias. Ninguém cria nem
-- apaga pela API (só os triggers). A conta do cliente não tem nenhuma.

alter table public.notifications enable row level security;

create policy "cada um vê as próprias notificações" on public.notifications
  for select to authenticated
  using ((select private.is_team_member()) and user_id = (select auth.uid()));
create policy "cada um marca as próprias notificações" on public.notifications
  for update to authenticated
  using ((select private.is_team_member()) and user_id = (select auth.uid()))
  with check ((select private.is_team_member()) and user_id = (select auth.uid()));
