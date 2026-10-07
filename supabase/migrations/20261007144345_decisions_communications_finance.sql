-- Boop Admin: Decisões, comunicações com clientes e financeiro básico.
--
-- Decisão: o que ficou definido e por quê (preço, política, escolha de um
-- projeto), com origem (reunião, projeto, cliente). Combinados de reunião
-- continuam sendo "quem faz o quê até quando"; decisão não tem dono nem prazo.
--
-- Comunicação: registro do que foi falado com o cliente (pedido, aprovação,
-- retorno, atualização), por canal. Pode virar tarefa.
--
-- Financeiro: lançamentos de receita e despesa com vencimento e pagamento.
-- Mensalidades e assinaturas são recorrências: o app mostra a ocorrência de
-- cada mês e o lançamento real só nasce quando alguém mexe nela (marca como
-- pago, muda o valor ou pula o mês), como nas revisões de clientes.

-- Tipos -----------------------------------------------------------------------

create type public.decision_status as enum ('active', 'revoked');
create type public.communication_kind as enum ('update', 'request', 'approval', 'feedback', 'other');
create type public.communication_channel as enum ('whatsapp', 'email', 'call', 'meeting', 'other');
create type public.finance_kind as enum ('income', 'expense');

-- Decisões --------------------------------------------------------------------

create table public.decisions (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 300),
  -- Por quê, alternativas descartadas, detalhes.
  context text check (char_length(context) <= 5000),
  decided_on date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  status public.decision_status not null default 'active',
  area public.task_area,
  client_id uuid references public.clients (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  -- Reunião em que foi decidida.
  meeting_id uuid references public.meetings (id) on delete set null,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.decisions is 'Decisões da Boop: o que ficou definido, por quê e de onde veio.';

-- Comunicações ----------------------------------------------------------------

create table public.communications (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  kind public.communication_kind not null default 'update',
  channel public.communication_channel not null default 'whatsapp',
  summary text not null check (char_length(trim(summary)) between 1 and 300),
  details text check (char_length(details) <= 5000),
  occurred_on date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.communications is
  'O que foi falado com cada cliente (pedidos, aprovações, retornos, atualizações).';

-- Origem da tarefa: uma comunicação (ex.: pedido do cliente).
alter table public.tasks
  add column communication_id uuid references public.communications (id) on delete set null;

-- Financeiro ------------------------------------------------------------------

create table public.finance_recurrences (
  id uuid primary key default gen_random_uuid(),
  kind public.finance_kind not null,
  description text not null check (char_length(trim(description)) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  -- Dia do vencimento; em meses mais curtos, o último dia do mês.
  day_of_month smallint not null check (day_of_month between 1 and 31),
  category text check (char_length(category) <= 60),
  client_id uuid references public.clients (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  -- Primeiro e último mês (sempre dia 1); sem fim = continua.
  starts_on date not null check (extract(day from starts_on) = 1),
  ends_on date check (extract(day from ends_on) = 1),
  notes text check (char_length(notes) <= 2000),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_recurrences_period_check check (ends_on is null or ends_on >= starts_on)
);
comment on table public.finance_recurrences is
  'Receitas e despesas mensais (fees, assinaturas). Cada mês vira um lançamento quando alguém mexe nele.';

create table public.finance_entries (
  id uuid primary key default gen_random_uuid(),
  kind public.finance_kind not null,
  description text not null check (char_length(trim(description)) between 1 and 200),
  amount_cents bigint not null check (amount_cents > 0 and amount_cents <= 100000000000),
  due_on date not null,
  -- Recebido (receita) ou pago (despesa) neste dia.
  paid_on date,
  -- Ocorrência de recorrência que não vale neste mês (ex.: mês sem cobrança).
  skipped boolean not null default false,
  category text check (char_length(category) <= 60),
  client_id uuid references public.clients (id) on delete set null,
  project_id uuid references public.projects (id) on delete set null,
  -- Ocorrência de uma recorrência: a recorrência e o mês (dia 1). Se a
  -- recorrência for apagada, o lançamento fica (histórico).
  recurrence_id uuid references public.finance_recurrences (id) on delete set null,
  period date check (extract(day from period) = 1),
  notes text check (char_length(notes) <= 2000),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint finance_entries_occurrence_key unique (recurrence_id, period)
);
comment on table public.finance_entries is 'Lançamentos de receita e despesa (avulsos ou meses de uma recorrência).';

-- Índices ---------------------------------------------------------------------

create index decisions_decided_on_idx on public.decisions (decided_on desc);
create index decisions_client_id_idx on public.decisions (client_id);
create index decisions_project_id_idx on public.decisions (project_id);
create index decisions_meeting_id_idx on public.decisions (meeting_id);
create index decisions_created_by_idx on public.decisions (created_by);
create index communications_client_id_idx on public.communications (client_id, occurred_on desc);
create index communications_project_id_idx on public.communications (project_id);
create index communications_created_by_idx on public.communications (created_by);
create index tasks_communication_id_idx on public.tasks (communication_id);
create index finance_recurrences_client_id_idx on public.finance_recurrences (client_id);
create index finance_recurrences_project_id_idx on public.finance_recurrences (project_id);
create index finance_recurrences_created_by_idx on public.finance_recurrences (created_by);
create index finance_entries_due_on_idx on public.finance_entries (due_on);
create index finance_entries_client_id_idx on public.finance_entries (client_id);
create index finance_entries_project_id_idx on public.finance_entries (project_id);
create index finance_entries_created_by_idx on public.finance_entries (created_by);

-- Triggers --------------------------------------------------------------------

-- updated_at a cada alteração; autoria e criação não mudam. Serve para
-- decisões, comunicações e financeiro.
create function private.set_record_fields()
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
  return new;
end;
$$;

create trigger set_record_fields before insert or update on public.decisions
  for each row execute function private.set_record_fields();
create trigger set_record_fields before insert or update on public.communications
  for each row execute function private.set_record_fields();
create trigger set_record_fields before insert or update on public.finance_recurrences
  for each row execute function private.set_record_fields();
create trigger set_record_fields before insert or update on public.finance_entries
  for each row execute function private.set_record_fields();

-- RLS -------------------------------------------------------------------------
-- Mesmo modelo das outras tabelas: a equipe vê e altera tudo; a autoria é de
-- quem cria.

alter table public.decisions enable row level security;
alter table public.communications enable row level security;
alter table public.finance_recurrences enable row level security;
alter table public.finance_entries enable row level security;

create policy "equipe vê decisões" on public.decisions
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe registra decisões" on public.decisions
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita decisões" on public.decisions
  for update to authenticated
  using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "equipe exclui decisões" on public.decisions
  for delete to authenticated using ((select private.is_team_member()));

create policy "equipe vê comunicações" on public.communications
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe registra comunicações" on public.communications
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita comunicações" on public.communications
  for update to authenticated
  using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "equipe exclui comunicações" on public.communications
  for delete to authenticated using ((select private.is_team_member()));

create policy "equipe vê recorrências" on public.finance_recurrences
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe cria recorrências" on public.finance_recurrences
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita recorrências" on public.finance_recurrences
  for update to authenticated
  using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "equipe exclui recorrências" on public.finance_recurrences
  for delete to authenticated using ((select private.is_team_member()));

create policy "equipe vê lançamentos" on public.finance_entries
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe cria lançamentos" on public.finance_entries
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita lançamentos" on public.finance_entries
  for update to authenticated
  using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "equipe exclui lançamentos" on public.finance_entries
  for delete to authenticated using ((select private.is_team_member()));
