-- Boop Admin: portal do cliente, projetos (banco, sem telas).
--
-- O cliente passa a ver os projetos dele no portal: situação, prazo e quanto
-- já foi feito, as etapas que a equipe marcar como "o cliente vê" e a
-- conversa do projeto. A conversa é o canal do cliente ("Alterações –
-- <cliente>"), com as mensagens marcadas com o projeto, como já acontece com
-- os posts: o cliente continua com um lugar só para falar com a Boop.
--
-- Só acréscimos: duas colunas novas e funções. Como nas fases anteriores,
-- nenhuma política das tabelas da equipe muda e o cliente lê e escreve só por
-- funções security definer, que conferem private.my_client_ids() e devolvem
-- só os campos liberados (nada de descrição, responsável ou tarefa interna).

-- Etapa que o cliente vê --------------------------------------------------------

alter table public.tasks
  add column client_visible boolean not null default false;

comment on column public.tasks.client_visible is
  'Etapa que o cliente vê no portal, na página do projeto (só título, situação e prazo).';

-- Mensagem marcada com o projeto -----------------------------------------------

alter table public.messages
  add column project_id uuid references public.projects (id) on delete set null;

comment on column public.messages.project_id is
  'Projeto da mensagem (só no canal do cliente do projeto): a conversa do projeto no portal.';

create index messages_project_id_idx on public.messages (project_id, created_at desc);

-- O projeto precisa ser do cliente do canal, e só quem escreveu troca o
-- projeto da mensagem (como o post). Ajustes do próprio banco (projeto
-- excluído ou levado para outro cliente) passam direto.
create function private.check_message_project()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.channels%rowtype;
  project_client uuid;
begin
  if tg_op = 'UPDATE' then
    if new.project_id is not distinct from old.project_id or pg_trigger_depth() > 1 then
      return new;
    end if;
    if old.author_id is distinct from (select auth.uid()) then
      raise exception 'Só quem escreveu pode editar a mensagem.' using errcode = '42501';
    end if;
  end if;
  if new.project_id is null then
    return new;
  end if;

  -- O canal não muda (set_message_fields), mas este trigger roda antes dele.
  select * into ch from public.channels c
   where c.id = case when tg_op = 'UPDATE' then old.channel_id else new.channel_id end;
  select p.client_id into project_client from public.projects p where p.id = new.project_id;
  if ch.kind is distinct from 'client' or project_client is distinct from ch.client_id then
    raise exception 'O projeto precisa ser do cliente deste canal.' using errcode = '23514';
  end if;
  return new;
end;
$$;

create trigger check_message_project
  before insert or update of project_id on public.messages
  for each row execute function private.check_message_project();

-- Projeto levado para outro cliente (ou que virou interno): as mensagens
-- ficam no canal em que foram escritas, sem a marca do projeto.
create function private.unlink_project_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.client_id is distinct from old.client_id then
    update public.messages m
       set project_id = null
     where m.project_id = new.id
       and m.channel_id not in (
         select c.id from public.channels c where c.kind = 'client' and c.client_id = new.client_id
       );
  end if;
  return null;
end;
$$;

create trigger unlink_project_messages
  after update of client_id on public.projects
  for each row execute function private.unlink_project_messages();

-- Projetos que o cliente vê ---------------------------------------------------------

-- Projeto do cliente da conta logada, com o cliente ativo. Cancelado não
-- aparece; concluído continua, como histórico.
create function private.portal_can_see_project(target_project uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.projects p
      join public.clients c on c.id = p.client_id
     where p.id = target_project
       and p.client_id in (select private.my_client_ids())
       and c.active
       and p.status <> 'canceled'
  );
$$;

revoke all on function private.portal_can_see_project(uuid) from public;
grant execute on function private.portal_can_see_project(uuid) to authenticated;

-- Projetos do cliente, com o andamento: todas as tarefas contam no total e no
-- feito (como no admin), mas só os números saem daqui.
create function public.portal_projects(target_client uuid)
returns table (
  id uuid,
  name text,
  template text,
  status public.project_status,
  starts_on date,
  due_on date,
  completed_at timestamptz,
  tasks_total integer,
  tasks_done integer
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.name, p.template, p.status, p.starts_on, p.due_on, p.completed_at,
         (select count(*)::integer from public.tasks t where t.project_id = p.id),
         (select count(*)::integer from public.tasks t where t.project_id = p.id and t.status = 'done')
    from public.projects p
    join public.clients c on c.id = p.client_id
   where p.client_id = target_client
     and c.active
     and p.client_id in (select private.my_client_ids())
     and p.status <> 'canceled'
   order by p.status in ('done'), p.due_on nulls last, p.starts_on, p.created_at;
$$;

-- Etapas do projeto que o cliente vê: só título, situação e datas.
create function public.portal_project_steps(target_project uuid)
returns table (
  id uuid,
  title text,
  status public.task_status,
  due_date date,
  completed_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select t.id, t.title, t.status, t.due_date, t.completed_at
    from public.tasks t
   where t.project_id = target_project
     and t.client_visible
     and private.portal_can_see_project(target_project)
   order by t.due_date nulls last, t.created_at;
$$;

-- Conversa do projeto ------------------------------------------------------------

-- Mensagens do canal do cliente marcadas com o projeto, com o nome de quem
-- escreveu (equipe pelo perfil, cliente pelo nome do acesso).
create function public.portal_project_messages(target_project uuid)
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
     and private.portal_can_see_project(target_project)
   order by m.created_at;
$$;

-- O cliente escreve na conversa do projeto (vai para o canal do cliente).
create function public.portal_send_project_message(target_project uuid, message_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_channel uuid;
  created uuid;
begin
  if not private.portal_can_see_project(target_project) then
    raise exception 'project_not_found' using errcode = 'P0002';
  end if;
  if char_length(trim(coalesce(message_body, ''))) not between 1 and 5000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;

  select ch.id into target_channel
    from public.channels ch
    join public.projects p on p.client_id = ch.client_id
   where p.id = target_project and ch.kind = 'client';
  if target_channel is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;

  insert into public.messages (channel_id, project_id, author_id, kind, body)
  values (target_channel, target_project, (select auth.uid()), 'text', message_body)
  returning id into created;
  return created;
end;
$$;

revoke execute on function public.portal_projects(uuid) from public, anon;
grant execute on function public.portal_projects(uuid) to authenticated;
revoke execute on function public.portal_project_steps(uuid) from public, anon;
grant execute on function public.portal_project_steps(uuid) to authenticated;
revoke execute on function public.portal_project_messages(uuid) from public, anon;
grant execute on function public.portal_project_messages(uuid) to authenticated;
revoke execute on function public.portal_send_project_message(uuid, text) from public, anon;
grant execute on function public.portal_send_project_message(uuid, text) to authenticated;
