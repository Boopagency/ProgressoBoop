-- Boop Admin: Clientes — cadastro completo e revisão mensal.
--
-- O cliente ganha responsável, frentes de trabalho, desde quando é cliente,
-- contato, observações e o dia do mês em que a revisão vence. Cada cliente
-- ativo tem uma revisão por mês (`client_reviews`): saúde (semáforo),
-- checklist, notas e próximos passos, que são tarefas ligadas à revisão.

-- Tipos -----------------------------------------------------------------------

create type public.client_health as enum ('healthy', 'attention', 'at_risk');

-- Clientes --------------------------------------------------------------------

alter table public.clients
  add column owner_id uuid references public.profiles (id) on delete set null,
  add column services text[] not null default '{}',
  add column since date,
  add column contact_name text,
  add column contact_email text,
  add column contact_phone text,
  add column notes text,
  -- Dia do mês em que a revisão vence; null = sem revisão mensal.
  add column review_day smallint default 10,
  add column updated_at timestamptz not null default now(),
  add constraint clients_services_check check (cardinality(services) <= 12),
  add constraint clients_contact_name_check check (char_length(contact_name) <= 120),
  add constraint clients_contact_email_check check (char_length(contact_email) <= 200),
  add constraint clients_contact_phone_check check (char_length(contact_phone) <= 40),
  add constraint clients_notes_check check (char_length(notes) <= 5000),
  add constraint clients_review_day_check check (review_day between 1 and 28);

-- A própria Boop (projetos internos) não passa por revisão mensal.
update public.clients set review_day = null where name = 'Boop';

-- Revisões --------------------------------------------------------------------

create table public.client_reviews (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  -- Mês de referência (sempre o dia 1).
  period date not null check (extract(day from period) = 1),
  health public.client_health,
  -- Itens conferidos: [{ "key": "...", "label": "...", "done": true }].
  checklist jsonb not null default '[]'::jsonb check (jsonb_typeof(checklist) = 'array'),
  notes text check (char_length(notes) <= 20000),
  done boolean not null default false,
  done_at timestamptz,
  done_by uuid references public.profiles (id) on delete set null,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, period)
);
comment on table public.client_reviews is
  'Revisão mensal de cada cliente: saúde, checklist, notas e próximos passos (tarefas).';

-- Próximos passos de uma revisão viram tarefas.
alter table public.tasks
  add column client_review_id uuid references public.client_reviews (id) on delete set null;

-- Índices ---------------------------------------------------------------------

create index clients_owner_id_idx on public.clients (owner_id);
create index client_reviews_done_by_idx on public.client_reviews (done_by);
create index client_reviews_created_by_idx on public.client_reviews (created_by);
create index tasks_client_review_id_idx on public.tasks (client_review_id);

-- Triggers --------------------------------------------------------------------

create function private.set_client_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.created_at := old.created_at;
  return new;
end;
$$;

create trigger set_client_fields
  before update on public.clients
  for each row execute function private.set_client_fields();

-- Data de atualização e quem concluiu a revisão (e quando).
create function private.set_client_review_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    new.client_id := old.client_id;
    new.period := old.period;
  end if;
  if new.done and (tg_op = 'INSERT' or not old.done) then
    new.done_at := now();
    new.done_by := auth.uid();
  elsif not new.done then
    new.done_at := null;
    new.done_by := null;
  elsif tg_op = 'UPDATE' then
    new.done_at := old.done_at;
    new.done_by := old.done_by;
  end if;
  return new;
end;
$$;

create trigger set_client_review_fields
  before insert or update on public.client_reviews
  for each row execute function private.set_client_review_fields();

-- RLS -------------------------------------------------------------------------

alter table public.client_reviews enable row level security;

create policy "equipe vê revisões de clientes" on public.client_reviews
  for select to authenticated
  using ((select private.is_team_member()));
create policy "equipe cria revisões de clientes" on public.client_reviews
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita revisões de clientes" on public.client_reviews
  for update to authenticated
  using ((select private.is_team_member()))
  with check ((select private.is_team_member()));
create policy "equipe exclui revisões de clientes" on public.client_reviews
  for delete to authenticated
  using ((select private.is_team_member()));
