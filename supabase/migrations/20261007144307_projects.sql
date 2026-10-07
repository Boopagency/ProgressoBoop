-- Boop Admin: Projetos e visões salvas.
--
-- Projeto é um conjunto de tarefas com começo, prazo, responsável e,
-- quando for de cliente, o cliente. Os planos (ciclos internos, como
-- "Estruturação da Boop até 31/10") viram projetos internos (sem cliente):
-- um conceito só para "um conjunto de tarefas com prazo e progresso".
-- Projetos "em foco" aparecem na tela Hoje e na pauta da weekly.
--
-- Visões salvas são filtros da tela Tarefas com nome, da equipe toda.

-- Tipos -----------------------------------------------------------------------

create type public.project_status as enum ('planned', 'active', 'paused', 'done', 'canceled');

-- Projetos --------------------------------------------------------------------

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 200),
  -- Sem cliente = projeto interno da Boop.
  client_id uuid references public.clients (id) on delete set null,
  owner_id uuid references public.profiles (id) on delete set null,
  status public.project_status not null default 'active',
  -- Modelo usado na criação (ex.: 'site'). Só informativo.
  template text check (char_length(template) <= 60),
  description text check (char_length(description) <= 5000),
  starts_on date not null,
  due_on date,
  -- Em foco: aparece na tela Hoje e na pauta da weekly.
  pinned boolean not null default false,
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint projects_period_check check (due_on is null or due_on >= starts_on)
);
comment on table public.projects is
  'Projetos (de clientes ou internos): tarefas com começo, prazo, responsável e progresso.';

alter table public.tasks
  add column project_id uuid references public.projects (id) on delete set null;

-- Visões salvas ---------------------------------------------------------------

create table public.saved_views (
  id uuid primary key default gen_random_uuid(),
  -- Tela da visão. Por enquanto só Tarefas.
  page text not null default 'tasks' check (page in ('tasks')),
  name text not null check (char_length(trim(name)) between 1 and 60),
  -- Parâmetros da URL da tela (ex.: "pessoa=mine&prazo=overdue&ver=quadro").
  query text not null default '' check (char_length(query) <= 500),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);
comment on table public.saved_views is 'Filtros da tela Tarefas com nome, compartilhados com a equipe.';

-- Índices ---------------------------------------------------------------------

create index projects_client_id_idx on public.projects (client_id);
create index projects_owner_id_idx on public.projects (owner_id);
create index projects_created_by_idx on public.projects (created_by);
create index tasks_project_id_idx on public.tasks (project_id);
create index saved_views_created_by_idx on public.saved_views (created_by);

-- Triggers --------------------------------------------------------------------

-- updated_at a cada alteração; completed_at quando o projeto é concluído.
create function private.set_project_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  if new.status <> 'done' then
    new.completed_at := null;
  elsif tg_op = 'INSERT' or old.status <> 'done' then
    new.completed_at := now();
  else
    new.completed_at := coalesce(old.completed_at, now());
  end if;
  return new;
end;
$$;

create trigger set_project_fields
  before insert or update on public.projects
  for each row execute function private.set_project_fields();

-- Planos → projetos -------------------------------------------------------------
-- Mesmo id, para os links antigos continuarem valendo. O plano vira projeto
-- interno em foco; as tarefas do plano passam a ser do projeto.

insert into public.projects (id, name, status, template, starts_on, due_on, pinned, created_by, created_at)
select
  p.id,
  p.name,
  case
    when p.ends_on < (now() at time zone 'America/Sao_Paulo')::date then 'done'::public.project_status
    else 'active'::public.project_status
  end,
  'plan',
  p.starts_on,
  p.ends_on,
  true,
  (select pr.id from public.profiles pr order by pr.created_at limit 1),
  p.created_at
from public.plans p
where exists (select 1 from public.profiles)
on conflict (id) do nothing;

update public.tasks
   set project_id = plan_id
 where plan_id is not null
   and project_id is null;

comment on table public.plans is
  'Obsoleta: os planos viraram projetos internos (projects, mesmo id). Sai numa migration de limpeza.';
comment on column public.tasks.plan_id is
  'Obsoleta: use project_id. Sai numa migration de limpeza.';

-- RLS -------------------------------------------------------------------------

alter table public.projects enable row level security;
alter table public.saved_views enable row level security;

create policy "equipe vê projetos" on public.projects
  for select to authenticated
  using ((select private.is_team_member()));
create policy "equipe cria projetos" on public.projects
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita projetos" on public.projects
  for update to authenticated
  using ((select private.is_team_member()))
  with check ((select private.is_team_member()));
create policy "equipe exclui projetos" on public.projects
  for delete to authenticated
  using ((select private.is_team_member()));

create policy "equipe vê visões salvas" on public.saved_views
  for select to authenticated
  using ((select private.is_team_member()));
create policy "equipe cria visões salvas" on public.saved_views
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita visões salvas" on public.saved_views
  for update to authenticated
  using ((select private.is_team_member()))
  with check ((select private.is_team_member()));
create policy "equipe exclui visões salvas" on public.saved_views
  for delete to authenticated
  using ((select private.is_team_member()));
