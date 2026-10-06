-- Boop Admin: Reuniões.
--
-- A agenda continua no Calendário: uma reunião é um evento do tipo 'meeting',
-- único ou semanal. Aqui fica o que acontece em cada reunião: assuntos,
-- combinados, resumo, transcrição e a pauta congelada ao encerrar. O registro
-- nasce quando alguém abre a reunião no app e fica ligado ao evento e ao dia
-- da ocorrência.

-- Busca sem acento ------------------------------------------------------------

create extension if not exists unaccent with schema extensions;

-- unaccent() não é imutável porque depende do dicionário em uso. Com o
-- dicionário fixo, dá para usá-la em colunas geradas e índices.
create function private.unaccent_text(value text)
returns text
language sql
immutable
parallel safe
strict
set search_path = ''
as $$
  select extensions.unaccent('extensions.unaccent'::regdictionary, value);
$$;

revoke all on function private.unaccent_text(text) from public;
grant execute on function private.unaccent_text(text) to authenticated;

-- Tipos -----------------------------------------------------------------------

create type public.meeting_status as enum ('scheduled', 'done', 'canceled');
create type public.meeting_item_kind as enum ('topic', 'agreement');

-- Tabelas ---------------------------------------------------------------------

create table public.meetings (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events (id) on delete cascade,
  -- Dia da ocorrência (em São Paulo). Em eventos únicos acompanha a data do
  -- evento (trigger sync_meeting_dates).
  occurs_on date not null,
  status public.meeting_status not null default 'scheduled',
  summary text check (char_length(summary) <= 20000),
  transcript text check (char_length(transcript) <= 200000),
  transcript_length integer generated always as (coalesce(char_length(transcript), 0)) stored,
  -- Pauta como estava no encerramento (tarefas por pessoa, combinados
  -- anteriores). Montada pelo app; nula enquanto a reunião está aberta.
  agenda jsonb,
  closed_at timestamptz,
  closed_by uuid references public.profiles (id),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    to_tsvector(
      'portuguese'::regconfig,
      private.unaccent_text(coalesce(summary, '') || ' ' || coalesce(transcript, ''))
    )
  ) stored,
  constraint meetings_occurrence_key unique (event_id, occurs_on)
);
comment on table public.meetings is
  'Registro de cada reunião: uma ocorrência de um evento do tipo meeting.';

-- Assuntos (pauta trazida pela equipe) e combinados (o que ficou decidido).
create table public.meeting_items (
  id uuid primary key default gen_random_uuid(),
  meeting_id uuid not null references public.meetings (id) on delete cascade,
  kind public.meeting_item_kind not null,
  content text not null check (char_length(trim(content)) between 1 and 1000),
  owner_id uuid references public.profiles (id) on delete set null,
  due_date date,
  -- Assunto já discutido, ou combinado cumprido quando não virou tarefa.
  done boolean not null default false,
  -- Tarefa criada a partir do combinado. Quando existe, o status dela vale.
  task_id uuid references public.tasks (id) on delete set null,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now()
);

-- Origem da tarefa: o combinado de uma reunião.
alter table public.tasks
  add column meeting_id uuid references public.meetings (id) on delete set null;

-- Índices ---------------------------------------------------------------------

create index meetings_occurs_on_idx on public.meetings (occurs_on);
create index meetings_closed_by_idx on public.meetings (closed_by);
create index meetings_created_by_idx on public.meetings (created_by);
create index meetings_search_idx on public.meetings using gin (search);
create index meeting_items_meeting_id_idx on public.meeting_items (meeting_id);
create index meeting_items_owner_id_idx on public.meeting_items (owner_id);
create index meeting_items_task_id_idx on public.meeting_items (task_id);
create index meeting_items_created_by_idx on public.meeting_items (created_by);
create index tasks_meeting_id_idx on public.tasks (meeting_id);

-- Triggers --------------------------------------------------------------------

-- updated_at a cada alteração; closed_at e closed_by quando a reunião é
-- encerrada (e limpos se ela for reaberta).
create function private.set_meeting_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status <> 'done' then
      new.closed_at := now();
      new.closed_by := auth.uid();
    else
      new.closed_at := old.closed_at;
      new.closed_by := old.closed_by;
    end if;
  else
    new.closed_at := null;
    new.closed_by := null;
  end if;
  return new;
end;
$$;

create trigger set_meeting_fields
  before insert or update on public.meetings
  for each row execute function private.set_meeting_fields();

-- Reunião única remarcada no Calendário: o registro vai junto para a nova
-- data. Em eventos semanais cada registro é de uma semana e fica onde está.
create function private.sync_meeting_dates()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  new_date date := (new.start_at at time zone 'America/Sao_Paulo')::date;
begin
  if new.recurrence_rule is null
    and (select count(*) from public.meetings where event_id = new.id) = 1
  then
    update public.meetings
       set occurs_on = new_date
     where event_id = new.id
       and occurs_on <> new_date;
  end if;
  return null;
end;
$$;

create trigger sync_meeting_dates
  after update of start_at, recurrence_rule on public.events
  for each row execute function private.sync_meeting_dates();

-- RLS -------------------------------------------------------------------------
-- Mesmo modelo das outras tabelas: a equipe vê e altera tudo, e a autoria é
-- sempre de quem cria.

alter table public.meetings enable row level security;
alter table public.meeting_items enable row level security;

create policy "equipe vê reuniões" on public.meetings
  for select to authenticated
  using ((select private.is_team_member()));
create policy "equipe registra reuniões" on public.meetings
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita reuniões" on public.meetings
  for update to authenticated
  using ((select private.is_team_member()))
  with check ((select private.is_team_member()));
create policy "equipe exclui reuniões" on public.meetings
  for delete to authenticated
  using ((select private.is_team_member()));

create policy "equipe vê itens de reunião" on public.meeting_items
  for select to authenticated
  using ((select private.is_team_member()));
create policy "equipe cria itens de reunião" on public.meeting_items
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita itens de reunião" on public.meeting_items
  for update to authenticated
  using ((select private.is_team_member()))
  with check ((select private.is_team_member()));
create policy "equipe exclui itens de reunião" on public.meeting_items
  for delete to authenticated
  using ((select private.is_team_member()));
