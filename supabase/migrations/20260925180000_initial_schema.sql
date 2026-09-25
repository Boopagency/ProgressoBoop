-- Boop Admin: schema da V1.
--
-- Ter um perfil em public.profiles é o que faz alguém ser da equipe. Os perfis
-- são criados à mão (supabase/seed.sql), junto com as contas do Supabase Auth;
-- não existe cadastro público. Uma conta sem perfil não enxerga nenhum dado.

-- Tipos -----------------------------------------------------------------------

create type public.task_status as enum ('todo', 'doing', 'done');
create type public.task_priority as enum ('low', 'normal', 'high');
create type public.task_area as enum (
  'commercial', 'finance', 'operations', 'brand', 'technology', 'clients'
);
create type public.event_type as enum ('meeting', 'internal', 'delivery');

-- Tabelas ---------------------------------------------------------------------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  full_name text not null check (char_length(trim(full_name)) > 0),
  avatar_url text,
  role text,
  created_at timestamptz not null default now()
);
comment on table public.profiles is 'Pessoas da equipe (1:1 com auth.users). Ter perfil = ter acesso.';

create table public.clients (
  id uuid primary key default gen_random_uuid(),
  name text not null unique check (char_length(trim(name)) > 0),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) > 0),
  starts_on date not null,
  ends_on date not null,
  created_at timestamptz not null default now(),
  constraint plans_period_check check (ends_on >= starts_on)
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text check (char_length(description) <= 5000),
  client_id uuid references public.clients (id) on delete set null,
  plan_id uuid references public.plans (id) on delete set null,
  area public.task_area,
  status public.task_status not null default 'todo',
  priority public.task_priority not null default 'normal',
  due_date date,
  completed_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Uma tarefa pode ter uma, duas ou as três pessoas como responsáveis.
create table public.task_assignees (
  task_id uuid not null references public.tasks (id) on delete cascade,
  profile_id uuid not null references public.profiles (id) on delete cascade,
  primary key (task_id, profile_id)
);

-- Recorrência: só 'FREQ=WEEKLY' (mesmo dia da semana e horário de start_at).
-- Sem motor de recorrência: o app expande as ocorrências para o período visível.
create table public.events (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text check (char_length(description) <= 5000),
  event_type public.event_type not null default 'meeting',
  start_at timestamptz not null,
  end_at timestamptz,
  all_day boolean not null default false,
  recurrence_rule text check (recurrence_rule = 'FREQ=WEEKLY'),
  client_id uuid references public.clients (id) on delete set null,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint events_period_check check (end_at is null or end_at > start_at)
);

create table public.weekly_decisions (
  id uuid primary key default gen_random_uuid(),
  content text not null check (char_length(trim(content)) between 1 and 500),
  -- Sempre a segunda-feira da semana.
  week_start date not null check (extract(isodow from week_start) = 1),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Índices (chaves estrangeiras e filtros usados pelo app) ----------------------

create index tasks_due_date_idx on public.tasks (due_date);
create index tasks_client_id_idx on public.tasks (client_id);
create index tasks_plan_id_idx on public.tasks (plan_id);
create index tasks_created_by_idx on public.tasks (created_by);
create index task_assignees_profile_id_idx on public.task_assignees (profile_id);
create index events_start_at_idx on public.events (start_at);
create index events_client_id_idx on public.events (client_id);
create index events_created_by_idx on public.events (created_by);
create index weekly_decisions_week_start_idx on public.weekly_decisions (week_start);
create index weekly_decisions_created_by_idx on public.weekly_decisions (created_by);

-- Funções internas (schema fora da API) ----------------------------------------

create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

-- completed_at acompanha o status; updated_at muda a cada alteração.
create function private.set_task_timestamps()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
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

create trigger set_task_timestamps
  before insert or update on public.tasks
  for each row execute function private.set_task_timestamps();

-- Usada pelas políticas de RLS. security definer para ler profiles sem cair
-- na própria política de profiles.
create function private.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()));
$$;

revoke all on function private.is_team_member() from public;
grant execute on function private.is_team_member() to authenticated;

-- RLS ---------------------------------------------------------------------------
-- V1: quem é da equipe vê e altera tudo. Sem papéis nem permissões por pessoa.
-- Usuários anônimos não têm nenhuma política, então não acessam nada.

alter table public.profiles enable row level security;
alter table public.clients enable row level security;
alter table public.plans enable row level security;
alter table public.tasks enable row level security;
alter table public.task_assignees enable row level security;
alter table public.events enable row level security;
alter table public.weekly_decisions enable row level security;

create policy "equipe vê a equipe" on public.profiles
  for select to authenticated
  using ((select private.is_team_member()));

create policy "cada um edita o próprio perfil" on public.profiles
  for update to authenticated
  using (id = (select auth.uid()))
  with check (id = (select auth.uid()));

create policy "equipe acessa clientes" on public.clients
  for all to authenticated
  using ((select private.is_team_member()))
  with check ((select private.is_team_member()));

create policy "equipe acessa planos" on public.plans
  for all to authenticated
  using ((select private.is_team_member()))
  with check ((select private.is_team_member()));

create policy "equipe acessa responsáveis" on public.task_assignees
  for all to authenticated
  using ((select private.is_team_member()))
  with check ((select private.is_team_member()));

-- Tarefas, eventos e decisões: a autoria é sempre de quem cria.

create policy "equipe vê tarefas" on public.tasks
  for select to authenticated
  using ((select private.is_team_member()));
create policy "equipe cria tarefas" on public.tasks
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita tarefas" on public.tasks
  for update to authenticated
  using ((select private.is_team_member()))
  with check ((select private.is_team_member()));
create policy "equipe exclui tarefas" on public.tasks
  for delete to authenticated
  using ((select private.is_team_member()));

create policy "equipe vê eventos" on public.events
  for select to authenticated
  using ((select private.is_team_member()));
create policy "equipe cria eventos" on public.events
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita eventos" on public.events
  for update to authenticated
  using ((select private.is_team_member()))
  with check ((select private.is_team_member()));
create policy "equipe exclui eventos" on public.events
  for delete to authenticated
  using ((select private.is_team_member()));

create policy "equipe vê decisões" on public.weekly_decisions
  for select to authenticated
  using ((select private.is_team_member()));
create policy "equipe registra decisões" on public.weekly_decisions
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe exclui decisões" on public.weekly_decisions
  for delete to authenticated
  using ((select private.is_team_member()));
