-- Boop Admin: metas (OKRs).
--
-- Um objetivo tem período e resultados-chave. O resultado-chave pode apontar
-- para um indicador do sistema (o app calcula o progresso sozinho, a partir
-- dos dados) ou ser manual (alguém atualiza o valor).

create table public.objectives (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  description text check (char_length(description) <= 5000),
  area public.task_area,
  owner_id uuid references public.profiles (id) on delete set null,
  starts_on date not null,
  ends_on date not null,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint objectives_period_check check (ends_on >= starts_on)
);
comment on table public.objectives is 'Objetivos (OKRs) com período.';

create table public.key_results (
  id uuid primary key default gen_random_uuid(),
  objective_id uuid not null references public.objectives (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  -- Indicador do catálogo do app que mede o resultado; vazio = manual.
  metric text check (char_length(metric) between 1 and 60),
  -- Recorte do indicador (ex.: receita de um cliente).
  client_id uuid references public.clients (id) on delete set null,
  unit text not null default 'number' check (unit in ('money', 'percent', 'count', 'number', 'days')),
  -- Valores na unidade: dinheiro em centavos; percentual em pontos (30 = 30%).
  target_value numeric not null check (abs(target_value) < 1e15),
  baseline_value numeric check (abs(baseline_value) < 1e15),
  -- Valor atual dos resultados manuais.
  manual_value numeric check (abs(manual_value) < 1e15),
  position smallint not null default 0,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.key_results is 'Resultados-chave: indicador do sistema (automático) ou valor manual.';

create index objectives_period_idx on public.objectives (starts_on, ends_on);
create index objectives_owner_id_idx on public.objectives (owner_id);
create index objectives_created_by_idx on public.objectives (created_by);
create index key_results_objective_id_idx on public.key_results (objective_id, position);
create index key_results_client_id_idx on public.key_results (client_id);
create index key_results_created_by_idx on public.key_results (created_by);

create trigger set_record_fields before insert or update on public.objectives
  for each row execute function private.set_record_fields();
create trigger set_record_fields before insert or update on public.key_results
  for each row execute function private.set_record_fields();

alter table public.objectives enable row level security;
alter table public.key_results enable row level security;

create policy "equipe vê objetivos" on public.objectives
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe cria objetivos" on public.objectives
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita objetivos" on public.objectives
  for update to authenticated
  using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "equipe exclui objetivos" on public.objectives
  for delete to authenticated using ((select private.is_team_member()));

create policy "equipe vê resultados-chave" on public.key_results
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe cria resultados-chave" on public.key_results
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita resultados-chave" on public.key_results
  for update to authenticated
  using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "equipe exclui resultados-chave" on public.key_results
  for delete to authenticated using ((select private.is_team_member()));
