-- Boop Admin: comercial (funil de vendas).
--
-- Um negócio (deal) vai de lead a ganho ou perdido. Ganhar não copia valores:
-- o negócio aponta para o cliente, o contrato (recorrência do financeiro) e o
-- projeto que nasceram dele. Os números comerciais (leads, propostas,
-- conversão, ticket, ciclo de venda, origem) saem destas linhas.

create type public.deal_stage as enum ('lead', 'contact', 'proposal', 'negotiation', 'won', 'lost');
create type public.lead_source as enum (
  'referral', 'instagram', 'website', 'google', 'linkedin', 'whatsapp', 'outbound', 'event', 'existing_client', 'other'
);

create table public.deals (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  -- Cliente da casa (upsell) ou o cliente criado quando o negócio foi ganho.
  client_id uuid references public.clients (id) on delete set null,
  -- Empresa e contato do lead (antes de virar cliente).
  company text check (char_length(company) <= 200),
  contact_name text check (char_length(contact_name) <= 120),
  contact_email text check (char_length(contact_email) <= 200),
  contact_phone text check (char_length(contact_phone) <= 40),
  source public.lead_source not null default 'other',
  -- Frente (Social media, Site...).
  service text check (char_length(service) <= 60),
  stage public.deal_stage not null default 'lead',
  -- Etapa mais avançada já alcançada (o funil conta por ela; perdido guarda
  -- onde parou). Mantida pelo trigger.
  reached_stage public.deal_stage not null default 'lead',
  owner_id uuid references public.profiles (id) on delete set null,
  -- Valor mensal (fee) e valor pontual (projeto, setup), em centavos.
  recurring_cents bigint not null default 0 check (recurring_cents between 0 and 100000000000),
  one_time_cents bigint not null default 0 check (one_time_cents between 0 and 100000000000),
  -- Duração prevista do contrato em meses (vazio = sem prazo).
  term_months smallint check (term_months between 1 and 120),
  -- Chance de fechar (%); vazio = a padrão da etapa.
  probability smallint check (probability between 0 and 100),
  -- Dia em que o lead chegou.
  opened_on date not null default ((now() at time zone 'America/Sao_Paulo')::date),
  expected_close_on date,
  proposal_sent_on date,
  -- Ganho ou perdido neste dia (trigger).
  closed_on date,
  lost_reason text check (char_length(lost_reason) <= 500),
  -- O que nasceu do negócio ganho.
  project_id uuid references public.projects (id) on delete set null,
  recurrence_id uuid references public.finance_recurrences (id) on delete set null,
  notes text check (char_length(notes) <= 5000),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.deals is 'Negócios do funil comercial (lead → ganho/perdido).';

create index deals_stage_idx on public.deals (stage);
create index deals_opened_on_idx on public.deals (opened_on);
create index deals_closed_on_idx on public.deals (closed_on);
create index deals_client_id_idx on public.deals (client_id);
create index deals_owner_id_idx on public.deals (owner_id);
create index deals_project_id_idx on public.deals (project_id);
create index deals_recurrence_id_idx on public.deals (recurrence_id);
create index deals_created_by_idx on public.deals (created_by);

create function private.set_deal_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  today date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  new.updated_at := now();
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  -- Etapa mais avançada: ganho é o fim do funil; perdido não avança.
  if tg_op = 'INSERT' then
    new.reached_stage := case when new.stage = 'lost' then 'lead'::public.deal_stage else new.stage end;
  elsif new.stage <> 'lost' and new.stage > old.reached_stage then
    new.reached_stage := new.stage;
  else
    new.reached_stage := old.reached_stage;
  end if;

  -- Proposta: o dia em que o negócio chegou nessa etapa (se ninguém informou).
  if new.stage in ('proposal', 'negotiation') and new.proposal_sent_on is null then
    new.proposal_sent_on := today;
  end if;

  -- Fechamento: ganho ou perdido ganha a data; reaberto perde.
  if new.stage in ('won', 'lost') then
    if new.closed_on is null
      or (tg_op = 'UPDATE' and new.stage <> old.stage and new.closed_on is not distinct from old.closed_on) then
      new.closed_on := today;
    end if;
  else
    new.closed_on := null;
  end if;
  if new.stage <> 'lost' then
    new.lost_reason := null;
  end if;
  return new;
end;
$$;

create trigger set_deal_fields before insert or update on public.deals
  for each row execute function private.set_deal_fields();

-- Histórico -------------------------------------------------------------------

alter table public.activity drop constraint activity_entity_type_check;
alter table public.activity add constraint activity_entity_type_check check (
  entity_type in ('task', 'project', 'decision', 'communication', 'finance', 'recurrence', 'deal')
);

create function private.log_deal_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changes jsonb := '{}'::jsonb;
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  field text;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform private.log_activity('deal', new.id, new.title, new.project_id, new.client_id, 'created', '{}'::jsonb);
  elsif tg_op = 'DELETE' then
    perform private.log_activity('deal', old.id, old.title, null, old.client_id, 'deleted', '{}'::jsonb);
  else
    foreach field in array array[
      'title', 'stage', 'recurring_cents', 'one_time_cents', 'term_months', 'owner_id',
      'expected_close_on', 'client_id', 'project_id', 'source', 'lost_reason'
    ] loop
      changes := private.diff(changes, field, old_row -> field, new_row -> field);
    end loop;
    perform private.log_activity('deal', new.id, new.title, new.project_id, new.client_id, 'updated', private.without_cascade(changes));
  end if;
  return null;
end;
$$;

create trigger log_deal_activity
  after insert or update or delete on public.deals
  for each row execute function private.log_deal_activity();

-- Comentários também nos negócios.
create or replace function private.fill_comment_context()
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
  elsif new.entity_type = 'deal' then
    select d.title, d.project_id, d.client_id into new.entity_title, new.project_id, new.client_id
      from public.deals d where d.id = new.entity_id;
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

-- RLS -------------------------------------------------------------------------

alter table public.deals enable row level security;

create policy "equipe vê negócios" on public.deals
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe cria negócios" on public.deals
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita negócios" on public.deals
  for update to authenticated
  using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "equipe exclui negócios" on public.deals
  for delete to authenticated using ((select private.is_team_member()));
