-- Boop Admin: histórico de atividade e comentários.
--
-- O próprio banco registra quem criou, mudou ou excluiu tarefas, projetos,
-- decisões, comunicações e lançamentos (triggers), venha a mudança de qualquer
-- tela. Comentários entram na mesma linha do tempo (action = 'comment').
--
-- Para não virar ruído: mudanças seguidas da mesma pessoa no mesmo item, em
-- até 10 minutos e sem ninguém no meio, viram um registro só (o "antes" do
-- primeiro e o "depois" do último; se voltou ao que era, some). Ajustes logo
-- depois de criar (até 2 minutos, como os responsáveis da tarefa nova) ficam
-- dentro do "criou".

create type public.activity_action as enum ('created', 'updated', 'deleted', 'comment');

create table public.activity (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null check (
    entity_type in ('task', 'project', 'decision', 'communication', 'finance', 'recurrence')
  ),
  entity_id uuid not null,
  -- Título do item no momento (para quando ele já foi excluído).
  entity_title text not null default '' check (char_length(entity_title) <= 300),
  -- Projeto e cliente do item, para as linhas do tempo do projeto e do cliente.
  project_id uuid references public.projects (id) on delete set null,
  client_id uuid references public.clients (id) on delete set null,
  action public.activity_action not null,
  -- Campos alterados: { "campo": [antes, depois] }.
  changes jsonb not null default '{}'::jsonb check (jsonb_typeof(changes) = 'object'),
  body text check (char_length(trim(body)) between 1 and 5000),
  actor_id uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint activity_comment_body_check check ((action = 'comment') = (body is not null))
);
comment on table public.activity is
  'Histórico (gravado pelos triggers) e comentários de tarefas, projetos, decisões, comunicações e lançamentos.';

create index activity_entity_idx on public.activity (entity_type, entity_id, created_at desc);
create index activity_project_id_idx on public.activity (project_id, created_at desc);
create index activity_client_id_idx on public.activity (client_id, created_at desc);
create index activity_actor_id_idx on public.activity (actor_id);
create index activity_created_at_idx on public.activity (created_at desc);

-- Registro --------------------------------------------------------------------

-- Acrescenta { campo: [antes, depois] } quando o valor mudou.
create function private.diff(changes jsonb, field text, before jsonb, after jsonb)
returns jsonb
language sql
immutable
set search_path = ''
as $$
  select case
    when coalesce(before, 'null'::jsonb) = coalesce(after, 'null'::jsonb) then changes
    else changes || jsonb_build_object(field, jsonb_build_array(before, after))
  end;
$$;

-- Vínculo limpo porque o projeto ou o cliente foi excluído (cascata do banco):
-- não é uma mudança de alguém. Os triggers AFTER das cascatas rodam no mesmo
-- nível dos comandos da pessoa, então a regra olha se o vínculo ainda existe.
create function private.without_cascade(changes jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  result jsonb := changes;
begin
  if result ? 'project_id' and result -> 'project_id' -> 1 = 'null'::jsonb
    and not exists (select 1 from public.projects p where p.id::text = result -> 'project_id' ->> 0)
  then
    result := result - 'project_id';
  end if;
  if result ? 'client_id' and result -> 'client_id' -> 1 = 'null'::jsonb
    and not exists (select 1 from public.clients c where c.id::text = result -> 'client_id' ->> 0)
  then
    result := result - 'client_id';
  end if;
  return result;
end;
$$;

-- security definer: só o banco grava histórico (a equipe só insere comentários).
create function private.log_activity(
  p_entity_type text,
  p_entity_id uuid,
  p_title text,
  p_project_id uuid,
  p_client_id uuid,
  p_action public.activity_action,
  p_changes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  stamp timestamptz := clock_timestamp();
  last_row public.activity%rowtype;
  merged jsonb;
  field text;
begin
  -- Projeto ou cliente que acabou de ser excluído (cascata): sem vínculo.
  if p_project_id is not null and not exists (select 1 from public.projects p where p.id = p_project_id) then
    p_project_id := null;
  end if;
  if p_client_id is not null and not exists (select 1 from public.clients c where c.id = p_client_id) then
    p_client_id := null;
  end if;
  if p_action = 'updated' then
    if p_changes = '{}'::jsonb then
      return;
    end if;
    select * into last_row
      from public.activity a
     where a.entity_type = p_entity_type
       and a.entity_id = p_entity_id
     order by a.created_at desc, a.id desc
     limit 1;
    if found
      and last_row.actor_id is not distinct from actor
      and last_row.action in ('created', 'updated')
    then
      if last_row.action = 'created' and last_row.created_at > now() - interval '2 minutes' then
        update public.activity
           set entity_title = left(coalesce(p_title, ''), 300),
               project_id = p_project_id,
               client_id = p_client_id
         where id = last_row.id;
        return;
      end if;
      if last_row.action = 'updated' and last_row.created_at > now() - interval '10 minutes' then
        merged := last_row.changes;
        for field in select jsonb_object_keys(p_changes) loop
          if merged ? field then
            merged := jsonb_set(merged, array[field], jsonb_build_array(merged -> field -> 0, p_changes -> field -> 1));
          else
            merged := merged || jsonb_build_object(field, p_changes -> field);
          end if;
          if (merged -> field -> 0) = (merged -> field -> 1) then
            merged := merged - field;
          end if;
        end loop;
        if merged = '{}'::jsonb then
          delete from public.activity where id = last_row.id;
        else
          update public.activity
             set changes = merged,
                 created_at = stamp,
                 entity_title = left(coalesce(p_title, ''), 300),
                 project_id = p_project_id,
                 client_id = p_client_id
           where id = last_row.id;
        end if;
        return;
      end if;
    end if;
  end if;

  insert into public.activity (entity_type, entity_id, entity_title, project_id, client_id, action, changes, actor_id, created_at)
  values (p_entity_type, p_entity_id, left(coalesce(p_title, ''), 300), p_project_id, p_client_id, p_action, p_changes, actor, stamp);
end;
$$;

revoke all on function private.log_activity(text, uuid, text, uuid, uuid, public.activity_action, jsonb) from public;

-- Tarefas ---------------------------------------------------------------------
-- Mudanças feitas pelo próprio banco em cascata (ex.: cliente excluído tira o
-- cliente das tarefas) não entram: without_cascade() descarta o vínculo limpo
-- e pg_trigger_depth() > 1 cobre o que roda dentro de outro trigger.

create function private.log_task_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changes jsonb := '{}'::jsonb;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform private.log_activity('task', new.id, new.title, new.project_id, new.client_id, 'created', '{}'::jsonb);
  elsif tg_op = 'DELETE' then
    perform private.log_activity('task', old.id, old.title, old.project_id, old.client_id, 'deleted', '{}'::jsonb);
  else
    changes := private.diff(changes, 'title', to_jsonb(old.title), to_jsonb(new.title));
    changes := private.diff(changes, 'status', to_jsonb(old.status), to_jsonb(new.status));
    changes := private.diff(changes, 'due_date', to_jsonb(old.due_date), to_jsonb(new.due_date));
    changes := private.diff(changes, 'priority', to_jsonb(old.priority), to_jsonb(new.priority));
    changes := private.diff(changes, 'area', to_jsonb(old.area), to_jsonb(new.area));
    changes := private.diff(changes, 'client_id', to_jsonb(old.client_id), to_jsonb(new.client_id));
    changes := private.diff(changes, 'project_id', to_jsonb(old.project_id), to_jsonb(new.project_id));
    changes := private.diff(changes, 'description',
      to_jsonb(left(old.description, 200)), to_jsonb(left(new.description, 200)));
    perform private.log_activity('task', new.id, new.title, new.project_id, new.client_id, 'updated', private.without_cascade(changes));
  end if;
  return null;
end;
$$;

create trigger log_task_activity
  after insert or update or delete on public.tasks
  for each row execute function private.log_task_activity();

-- Responsáveis: um registro por tarefa e comando, com a lista antes e depois
-- (ordenada). O app grava responsáveis em dois comandos (inclui e remove); a
-- junção dos registros da mesma pessoa deixa um "antes → depois" só.

create function private.log_assignees_added()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  for r in
    select t.id, t.title, t.project_id, t.client_id,
           coalesce((select jsonb_agg(a.profile_id order by a.profile_id)
                       from public.task_assignees a
                      where a.task_id = t.id), '[]'::jsonb) as after_ids,
           coalesce((select jsonb_agg(a.profile_id order by a.profile_id)
                       from public.task_assignees a
                      where a.task_id = t.id
                        and a.profile_id not in (select n.profile_id from added n where n.task_id = t.id)),
                    '[]'::jsonb) as before_ids
      from public.tasks t
     where t.id in (select distinct n.task_id from added n)
  loop
    perform private.log_activity('task', r.id, r.title, r.project_id, r.client_id, 'updated',
      private.diff('{}'::jsonb, 'assignees', r.before_ids, r.after_ids));
  end loop;
  return null;
end;
$$;

create function private.log_assignees_removed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  for r in
    select t.id, t.title, t.project_id, t.client_id,
           coalesce((select jsonb_agg(a.profile_id order by a.profile_id)
                       from public.task_assignees a
                      where a.task_id = t.id), '[]'::jsonb) as after_ids,
           coalesce((select jsonb_agg(x.profile_id order by x.profile_id)
                       from (select a.profile_id from public.task_assignees a where a.task_id = t.id
                             union
                             select o.profile_id from removed o where o.task_id = t.id) x),
                    '[]'::jsonb) as before_ids
      from public.tasks t
     where t.id in (select distinct o.task_id from removed o)
  loop
    perform private.log_activity('task', r.id, r.title, r.project_id, r.client_id, 'updated',
      private.diff('{}'::jsonb, 'assignees', r.before_ids, r.after_ids));
  end loop;
  return null;
end;
$$;

create trigger log_assignees_added
  after insert on public.task_assignees
  referencing new table as added
  for each statement execute function private.log_assignees_added();

create trigger log_assignees_removed
  after delete on public.task_assignees
  referencing old table as removed
  for each statement execute function private.log_assignees_removed();

-- Projetos --------------------------------------------------------------------

create function private.log_project_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changes jsonb := '{}'::jsonb;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform private.log_activity('project', new.id, new.name, new.id, new.client_id, 'created', '{}'::jsonb);
  elsif tg_op = 'DELETE' then
    perform private.log_activity('project', old.id, old.name, null, old.client_id, 'deleted', '{}'::jsonb);
  else
    changes := private.diff(changes, 'name', to_jsonb(old.name), to_jsonb(new.name));
    changes := private.diff(changes, 'status', to_jsonb(old.status), to_jsonb(new.status));
    changes := private.diff(changes, 'starts_on', to_jsonb(old.starts_on), to_jsonb(new.starts_on));
    changes := private.diff(changes, 'due_on', to_jsonb(old.due_on), to_jsonb(new.due_on));
    changes := private.diff(changes, 'owner_id', to_jsonb(old.owner_id), to_jsonb(new.owner_id));
    changes := private.diff(changes, 'client_id', to_jsonb(old.client_id), to_jsonb(new.client_id));
    changes := private.diff(changes, 'description',
      to_jsonb(left(old.description, 200)), to_jsonb(left(new.description, 200)));
    perform private.log_activity('project', new.id, new.name, new.id, new.client_id, 'updated', private.without_cascade(changes));
  end if;
  return null;
end;
$$;

create trigger log_project_activity
  after insert or update or delete on public.projects
  for each row execute function private.log_project_activity();

-- Decisões --------------------------------------------------------------------

create function private.log_decision_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changes jsonb := '{}'::jsonb;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform private.log_activity('decision', new.id, new.title, new.project_id, new.client_id, 'created', '{}'::jsonb);
  elsif tg_op = 'DELETE' then
    perform private.log_activity('decision', old.id, old.title, old.project_id, old.client_id, 'deleted', '{}'::jsonb);
  else
    changes := private.diff(changes, 'title', to_jsonb(old.title), to_jsonb(new.title));
    changes := private.diff(changes, 'status', to_jsonb(old.status), to_jsonb(new.status));
    changes := private.diff(changes, 'decided_on', to_jsonb(old.decided_on), to_jsonb(new.decided_on));
    changes := private.diff(changes, 'client_id', to_jsonb(old.client_id), to_jsonb(new.client_id));
    changes := private.diff(changes, 'project_id', to_jsonb(old.project_id), to_jsonb(new.project_id));
    changes := private.diff(changes, 'context',
      to_jsonb(left(old.context, 200)), to_jsonb(left(new.context, 200)));
    perform private.log_activity('decision', new.id, new.title, new.project_id, new.client_id, 'updated', private.without_cascade(changes));
  end if;
  return null;
end;
$$;

create trigger log_decision_activity
  after insert or update or delete on public.decisions
  for each row execute function private.log_decision_activity();

-- Comunicações ----------------------------------------------------------------

create function private.log_communication_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changes jsonb := '{}'::jsonb;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform private.log_activity('communication', new.id, new.summary, new.project_id, new.client_id, 'created', '{}'::jsonb);
  elsif tg_op = 'DELETE' then
    -- Cliente excluído leva as comunicações junto: fica só o registro do cliente.
    if not exists (select 1 from public.clients c where c.id = old.client_id) then
      return null;
    end if;
    perform private.log_activity('communication', old.id, old.summary, old.project_id, old.client_id, 'deleted', '{}'::jsonb);
  else
    changes := private.diff(changes, 'summary', to_jsonb(old.summary), to_jsonb(new.summary));
    changes := private.diff(changes, 'kind', to_jsonb(old.kind), to_jsonb(new.kind));
    changes := private.diff(changes, 'occurred_on', to_jsonb(old.occurred_on), to_jsonb(new.occurred_on));
    changes := private.diff(changes, 'project_id', to_jsonb(old.project_id), to_jsonb(new.project_id));
    perform private.log_activity('communication', new.id, new.summary, new.project_id, new.client_id, 'updated', private.without_cascade(changes));
  end if;
  return null;
end;
$$;

create trigger log_communication_activity
  after insert or update or delete on public.communications
  for each row execute function private.log_communication_activity();

-- Financeiro ------------------------------------------------------------------

create function private.log_finance_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text := case when tg_table_name = 'finance_recurrences' then 'recurrence' else 'finance' end;
  changes jsonb := '{}'::jsonb;
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  field text;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform private.log_activity(kind, new.id, new.description, new.project_id, new.client_id, 'created', '{}'::jsonb);
  elsif tg_op = 'DELETE' then
    perform private.log_activity(kind, old.id, old.description, old.project_id, old.client_id, 'deleted', '{}'::jsonb);
  else
    foreach field in array array[
      'description', 'amount_cents', 'due_on', 'paid_on', 'skipped', 'day_of_month', 'ends_on',
      'client_id', 'project_id', 'category'
    ] loop
      if new_row ? field then
        changes := private.diff(changes, field, old_row -> field, new_row -> field);
      end if;
    end loop;
    perform private.log_activity(kind, new.id, new.description, new.project_id, new.client_id, 'updated', private.without_cascade(changes));
  end if;
  return null;
end;
$$;

create trigger log_finance_activity
  after insert or update or delete on public.finance_entries
  for each row execute function private.log_finance_activity();

create trigger log_finance_activity
  after insert or update or delete on public.finance_recurrences
  for each row execute function private.log_finance_activity();

-- Comentários -----------------------------------------------------------------
-- O banco completa título, projeto e cliente a partir do item comentado (o
-- app manda só o item e o texto). Só tarefas, projetos e decisões recebem
-- comentários.

create function private.fill_comment_context()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Histórico gravado pelo banco, ou ajuste em cascata (projeto ou cliente
  -- excluído limpa o vínculo): passa direto.
  if new.action <> 'comment' or pg_trigger_depth() > 1 then
    return new;
  end if;
  new.actor_id := auth.uid();
  new.changes := '{}'::jsonb;
  new.body := trim(new.body);
  if tg_op = 'UPDATE' then
    new.entity_type := old.entity_type;
    new.entity_id := old.entity_id;
    new.entity_title := old.entity_title;
    new.project_id := old.project_id;
    new.client_id := old.client_id;
    new.created_at := old.created_at;
    new.actor_id := old.actor_id;
    new.edited_at := clock_timestamp();
    return new;
  end if;
  new.created_at := clock_timestamp();
  new.edited_at := null;
  if new.entity_type = 'task' then
    select t.title, t.project_id, t.client_id into new.entity_title, new.project_id, new.client_id
      from public.tasks t where t.id = new.entity_id;
  elsif new.entity_type = 'project' then
    select p.name, p.id, p.client_id into new.entity_title, new.project_id, new.client_id
      from public.projects p where p.id = new.entity_id;
  elsif new.entity_type = 'decision' then
    select d.title, d.project_id, d.client_id into new.entity_title, new.project_id, new.client_id
      from public.decisions d where d.id = new.entity_id;
  else
    raise exception 'Este item não recebe comentários.' using errcode = '22023';
  end if;
  if not found then
    raise exception 'Item não encontrado.' using errcode = '23503';
  end if;
  new.entity_title := left(coalesce(new.entity_title, ''), 300);
  return new;
end;
$$;

create trigger fill_comment_context
  before insert or update on public.activity
  for each row execute function private.fill_comment_context();

-- RLS -------------------------------------------------------------------------
-- A equipe lê tudo; cada pessoa cria, edita e apaga só os próprios
-- comentários. O histórico é só do banco (funções security definer).

alter table public.activity enable row level security;

create policy "equipe vê a atividade" on public.activity
  for select to authenticated
  using ((select private.is_team_member()));
create policy "equipe comenta" on public.activity
  for insert to authenticated
  with check (
    (select private.is_team_member())
    and action = 'comment'
    and actor_id = (select auth.uid())
  );
create policy "cada um edita os próprios comentários" on public.activity
  for update to authenticated
  using ((select private.is_team_member()) and action = 'comment' and actor_id = (select auth.uid()))
  with check ((select private.is_team_member()) and action = 'comment' and actor_id = (select auth.uid()));
create policy "cada um apaga os próprios comentários" on public.activity
  for delete to authenticated
  using ((select private.is_team_member()) and action = 'comment' and actor_id = (select auth.uid()));
