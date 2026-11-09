-- Boop Admin: jornada do cliente, a base (issue #115, item 1).
--
-- Cada cliente tem uma ou mais linhas de serviço (social media e tráfego
-- pago); cada linha anda pelas fases Entrada → Onboarding → Ongoing →
-- Renovação (→ Saída), com as etapas do processo oficial da Boop (SOCIAL 00 a
-- 07). As fases e as etapas ficam no código (`src/features/journey/catalog.ts`);
-- aqui ficam o estado de cada cliente e as marcações da equipe:
--
--   * `client_journeys`: a linha do cliente, a fase atual, o modo do
--     onboarding (compacto ou completo), o começo da fase, o fim do contrato
--     (quando a equipe escreve; sem ela, vale o fim das recorrências do
--     Financeiro) e o fim da jornada. Uma por cliente e linha;
--   * `journey_marks`: cada etapa marcada à mão (feita, não se aplica ou
--     reaberta), com quem e quando. A rodada é o mês no ongoing e o começo da
--     fase nas outras, então renovar ou recomeçar não herda marcação velha;
--   * `private.journey_facts`: o que os dados do sistema já dizem (negócio
--     ganho, 1ª fatura paga, responsável, acesso ao portal, briefing liberado,
--     enviado e com a imersão feita, Instagram conectado, 1º post publicado,
--     revisões mensais feitas e o fim do contrato), para marcar as etapas
--     sozinho. Nada é gravado: o app lê e decide;
--   * `public.team_journeys`: a leitura da equipe numa consulta só (as
--     jornadas, as marcações e os dados agregados), com o RLS de quem chama;
--   * `public.portal_journey`: o ponto de leitura do portal (PR seguinte),
--     security definer, só a versão resumida da jornada do próprio cliente;
--   * avisos no sino, num job diário (pg_cron, 08:13 de São Paulo): etapa
--     parada além do prazo-alvo, acessos e materiais sem chegar em 3 dias
--     úteis e 30 dias antes do fim do contrato. Cada aviso sai uma vez
--     (`private.journey_notices`). A conta do prazo e da etapa atual espelha
--     `src/features/journey/logic.ts`, com a cópia mínima do catálogo em
--     `private.journey_steps`; o teste `journey-sql.test.mjs` compara os
--     dois lados.
--
-- Clientes que já existem não mudam: entram na jornada pela ação "Iniciar
-- jornada" da equipe. Ganhar um negócio passa a iniciar a jornada na Entrada
-- (pelo app, depois de `win_deal`).
--
-- Sem chave estrangeira para `clients` e `profiles`: a jornada e as
-- marcações são histórico, e as telas só mostram as de clientes que existem
-- (o trigger confere o cliente ao criar). Nada sai daqui pela API: não há
-- política de exclusão, e encerrar é uma data (`ended_on`).
--
-- RLS: só a equipe lê e grava. A conta do cliente não lê as tabelas; o
-- portal vai ler por `portal_journey`.
--
-- Aditivo para o código que está na main: um valor novo de aviso, tipos,
-- tabelas, funções e um job novos.

-- Tipos -----------------------------------------------------------------------

alter type public.notification_kind add value if not exists 'journey_alert';

create type public.journey_line as enum ('social', 'traffic');
create type public.journey_phase as enum ('entry', 'onboarding', 'ongoing', 'renewal', 'offboarding');
create type public.journey_mode as enum ('compact', 'full');
create type public.journey_mark_state as enum ('done', 'not_applicable', 'open');

-- Tabelas ---------------------------------------------------------------------

create table public.client_journeys (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null,
  line public.journey_line not null,
  phase public.journey_phase not null,
  -- Compacto: plano Básico (12 posts). Completo: Intermediário e Avançado.
  mode public.journey_mode not null default 'full',
  -- Começo da fase atual: a base dos prazos e a rodada das marcações.
  phase_started_on date not null,
  started_on date not null,
  contract_ends_on date,
  ended_on date,
  created_by uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (client_id, line),
  check (phase_started_on >= started_on),
  check (ended_on is null or ended_on >= started_on)
);
comment on table public.client_journeys is
  'Jornada do cliente numa linha de serviço (social, tráfego): fase, modo do onboarding e datas. As etapas ficam no código.';

create index client_journeys_active_idx on public.client_journeys (phase) where ended_on is null;

create table public.journey_marks (
  id uuid primary key default gen_random_uuid(),
  journey_id uuid not null references public.client_journeys (id),
  step_key text not null check (step_key ~ '^[a-z][a-z0-9_]{1,60}$'),
  -- "aaaa-mm" no ongoing; "aaaa-mm-dd" (começo da fase) nas outras.
  round text not null check (round ~ '^\d{4}-\d{2}(-\d{2})?$'),
  state public.journey_mark_state not null,
  note text check (char_length(note) <= 500),
  -- Gravados pelo banco.
  marked_by uuid,
  marked_at timestamptz not null default now(),
  unique (journey_id, step_key, round)
);
comment on table public.journey_marks is
  'Etapas da jornada marcadas pela equipe (feita, não se aplica ou reaberta), por rodada, com quem e quando.';

-- Cópia mínima do catálogo (para o job) --------------------------------------

create table private.journey_steps (
  line public.journey_line not null,
  phase public.journey_phase not null,
  position integer not null,
  step_key text not null,
  name text not null,
  actor text not null check (actor in ('boop', 'client')),
  gate boolean not null default false,
  auto text,
  -- business_days (target_full/target_compact desde o começo da fase),
  -- month_day (dia do mês) ou month_business_day (enésimo dia útil do mês).
  target_kind text not null check (target_kind in ('business_days', 'month_day', 'month_business_day')),
  target_full integer not null,
  target_compact integer not null,
  quarterly boolean not null default false,
  primary key (line, step_key),
  unique (line, phase, position)
);
comment on table private.journey_steps is
  'Cópia do catálogo de src/features/journey/catalog.ts para os avisos do job (o teste confere que são iguais).';

alter table private.journey_steps enable row level security;
revoke all on private.journey_steps from public, anon, authenticated;

insert into private.journey_steps (line, phase, position, step_key, name, actor, gate, auto, target_kind, target_full, target_compact, quarterly)
select l.line::public.journey_line, s.phase::public.journey_phase, s.position, s.step_key, s.name, s.actor, s.gate, s.auto,
       s.target_kind, s.target_full, s.target_compact, s.quarterly
  from (values ('social'), ('traffic')) l (line)
 cross join (values
   -- Entrada (SOCIAL 01), igual nas duas linhas (o Instagram é só do social).
   ('entry', 1, 'deal_won', 'Negócio ganho', 'boop', false, 'deal_won', 'business_days', 0, 0, false),
   ('entry', 2, 'contract_signed', 'Contrato assinado', 'client', true, null, 'business_days', 2, 2, false),
   ('entry', 3, 'first_payment', '1ª fatura paga', 'client', true, 'first_payment', 'business_days', 3, 3, false),
   ('entry', 4, 'owner_defined', 'Gerente de projeto definido', 'boop', false, 'owner_defined', 'business_days', 1, 1, false),
   ('entry', 5, 'portal_access', 'Boas-vindas e acesso ao portal', 'boop', false, 'portal_access', 'business_days', 1, 1, false),
   ('entry', 6, 'access_materials', 'Acessos e materiais', 'client', false, null, 'business_days', 3, 3, false),
   ('entry', 8, 'kickoff', 'Kickoff de capacitação', 'boop', false, null, 'business_days', 3, 3, false),
   -- Renovação e saída.
   ('renewal', 1, 'renewal_report', 'Relatório do período', 'boop', false, null, 'business_days', 5, 5, false),
   ('renewal', 2, 'renewal_proposal', 'Proposta de renovação', 'boop', false, null, 'business_days', 10, 10, false),
   ('renewal', 3, 'renewal_decision', 'Decisão do cliente', 'client', true, null, 'business_days', 20, 20, false),
   ('offboarding', 1, 'final_report', 'Relatório final', 'boop', false, null, 'business_days', 5, 5, false),
   ('offboarding', 2, 'materials_delivered', 'Materiais entregues', 'boop', false, null, 'business_days', 5, 5, false),
   ('offboarding', 3, 'access_revoked', 'Acessos revogados', 'boop', true, null, 'business_days', 10, 10, false)
 ) s (phase, position, step_key, name, actor, gate, auto, target_kind, target_full, target_compact, quarterly);

insert into private.journey_steps (line, phase, position, step_key, name, actor, gate, auto, target_kind, target_full, target_compact, quarterly)
values
  ('social', 'entry', 7, 'instagram_connected', 'Instagram conectado', 'client', false, 'instagram_connected', 'business_days', 3, 3, false),
  -- Onboarding social em sprints (SOCIAL 02 e 03).
  ('social', 'onboarding', 1, 'briefing_released', 'Briefing liberado', 'boop', false, 'briefing_released', 'business_days', 1, 1, false),
  ('social', 'onboarding', 2, 'briefing_submitted', 'Briefing respondido', 'client', false, 'briefing_submitted', 'business_days', 3, 2, false),
  ('social', 'onboarding', 3, 'briefing_meeting', 'Reunião de briefing', 'boop', false, 'briefing_meeting', 'business_days', 4, 3, false),
  ('social', 'onboarding', 4, 'analysis', 'Análise em 7 blocos', 'boop', false, null, 'business_days', 5, 4, false),
  ('social', 'onboarding', 5, 'quick_wins', 'Quick wins', 'boop', false, null, 'business_days', 5, 4, false),
  ('social', 'onboarding', 6, 'analysis_validated', 'Cliente valida a análise', 'client', true, null, 'business_days', 5, 5, false),
  ('social', 'onboarding', 7, 'content_strategy', 'Estratégia de conteúdo', 'boop', false, null, 'business_days', 8, 5, false),
  ('social', 'onboarding', 8, 'moodboard', 'Moodboard', 'boop', false, null, 'business_days', 9, 5, false),
  ('social', 'onboarding', 9, 'strategy_approved', 'Estratégia aprovada', 'client', true, null, 'business_days', 10, 5, false),
  ('social', 'onboarding', 10, 'digital_kv', 'KV digital', 'boop', false, null, 'business_days', 12, 6, false),
  ('social', 'onboarding', 11, 'door_piece', 'Peça-porta', 'boop', false, null, 'business_days', 13, 7, false),
  ('social', 'onboarding', 12, 'first_month_themes', 'Temas do 1º mês', 'boop', false, null, 'business_days', 12, 6, false),
  ('social', 'onboarding', 13, 'boost_plan', 'Plano de impulsionamento', 'boop', false, null, 'business_days', 13, 7, false),
  ('social', 'onboarding', 14, 'themes_approved', 'Temas aprovados', 'client', true, null, 'business_days', 15, 8, false),
  ('social', 'onboarding', 15, 'production', 'Produção', 'boop', false, null, 'business_days', 20, 9, false),
  ('social', 'onboarding', 16, 'pieces_approved', 'Aprovação das peças', 'client', false, null, 'business_days', 22, 10, false),
  ('social', 'onboarding', 17, 'scheduling', 'Agendamento', 'boop', false, null, 'business_days', 23, 10, false),
  ('social', 'onboarding', 18, 'first_post', '1ª publicação', 'boop', true, 'first_post', 'business_days', 25, 10, false),
  ('social', 'onboarding', 19, 'checkin_30', 'Check-in de 30 dias marcado', 'boop', false, null, 'business_days', 25, 10, false),
  -- Ongoing social, todo mês (SOCIAL 04).
  ('social', 'ongoing', 1, 'month_numbers', 'Números do mês e escuta', 'boop', false, null, 'month_day', 3, 3, false),
  ('social', 'ongoing', 2, 'next_themes', 'Temas do mês seguinte', 'boop', false, null, 'month_day', 4, 4, false),
  ('social', 'ongoing', 3, 'themes_approval', 'Cliente aprova os temas', 'client', false, null, 'month_day', 7, 7, false),
  ('social', 'ongoing', 4, 'month_production', 'Produção', 'boop', false, null, 'month_day', 11, 11, false),
  ('social', 'ongoing', 5, 'pieces_ready', 'Peças prontas', 'boop', false, null, 'month_day', 12, 12, false),
  ('social', 'ongoing', 6, 'monthly_report', 'Relatório e revisão mensal', 'boop', false, 'monthly_review', 'month_business_day', 10, 10, false),
  ('social', 'ongoing', 7, 'pieces_approval', 'Cliente aprova as peças', 'client', false, null, 'month_day', 15, 15, false),
  ('social', 'ongoing', 8, 'all_scheduled', 'Mês seguinte 100% agendado', 'boop', true, null, 'month_day', 18, 18, false),
  ('social', 'ongoing', 9, 'quarterly_meeting', 'Reunião estratégica trimestral', 'boop', false, null, 'month_day', 28, 28, true),
  -- Tráfego pago (SOCIAL 06).
  ('traffic', 'onboarding', 1, 'ads_access', 'Acessos Meta e Google', 'client', false, null, 'business_days', 2, 2, false),
  ('traffic', 'onboarding', 2, 'tracking_checked', 'Pixel, eventos e UTM', 'boop', false, null, 'business_days', 4, 4, false),
  ('traffic', 'onboarding', 3, 'ads_strategy', 'Estratégia', 'boop', false, null, 'business_days', 6, 6, false),
  ('traffic', 'onboarding', 4, 'creatives_approved', 'Criativos aprovados', 'client', true, null, 'business_days', 8, 8, false),
  ('traffic', 'onboarding', 5, 'prelaunch_checklist', 'Checklist pré-subida', 'boop', false, null, 'business_days', 9, 9, false),
  ('traffic', 'onboarding', 6, 'launch', 'Subida das campanhas', 'boop', true, null, 'business_days', 10, 10, false),
  ('traffic', 'onboarding', 7, 'learning', 'Aprendizado (2–4 semanas)', 'boop', false, null, 'business_days', 30, 30, false),
  ('traffic', 'ongoing', 1, 'monthly_report', 'Relatório mensal', 'boop', false, null, 'month_business_day', 10, 10, false),
  ('traffic', 'ongoing', 2, 'next_budget', 'Verba do mês seguinte aprovada', 'client', true, null, 'month_day', 25, 25, false),
  ('traffic', 'ongoing', 3, 'weekly_optimization', 'Otimizações semanais', 'boop', false, null, 'month_day', 28, 28, false);

-- Datas -------------------------------------------------------------------------

-- Dia útil (segunda a sexta) `p_days` dias úteis depois de `p_from`; o próprio
-- dia não conta (addBusinessDays em src/lib/dates.ts).
create function private.journey_add_business_days(p_from date, p_days integer)
returns date
language plpgsql
immutable
set search_path = ''
as $$
declare
  result date := p_from;
  remaining integer := abs(p_days);
  step integer := case when p_days < 0 then -1 else 1 end;
begin
  while remaining > 0 loop
    result := result + step;
    if extract(isodow from result) < 6 then
      remaining := remaining - 1;
    end if;
  end loop;
  return result;
end;
$$;
revoke all on function private.journey_add_business_days(date, integer) from public;

-- A rodada das marcações (journeyRound).
create function private.journey_round(p_phase public.journey_phase, p_phase_started_on date, p_today date)
returns text
language sql
immutable
set search_path = ''
as $$
  select case when p_phase = 'ongoing' then to_char(p_today, 'YYYY-MM') else to_char(p_phase_started_on, 'YYYY-MM-DD') end;
$$;
revoke all on function private.journey_round(public.journey_phase, date, date) from public;

-- O prazo-alvo da etapa na rodada de hoje (stepDueOn).
create function private.journey_step_due(
  p_kind text,
  p_full integer,
  p_compact integer,
  p_mode public.journey_mode,
  p_phase_started_on date,
  p_today date
)
returns date
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'business_days' then
      private.journey_add_business_days(p_phase_started_on, case when p_mode = 'compact' then p_compact else p_full end)
    when 'month_day' then
      make_date(
        extract(year from p_today)::integer,
        extract(month from p_today)::integer,
        least(p_full, extract(day from date_trunc('month', p_today) + interval '1 month - 1 day')::integer)
      )
    else
      private.journey_add_business_days((date_trunc('month', p_today) - interval '1 day')::date, p_full)
  end;
$$;
revoke all on function private.journey_step_due(text, integer, integer, public.journey_mode, date, date) from public;

-- O que os dados dizem ----------------------------------------------------------

-- Um jsonb por cliente com as datas (no fuso de São Paulo) do que já
-- aconteceu. Security invoker: pela API, vale o RLS de quem chama.
create function private.journey_facts(p_client uuid)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select jsonb_strip_nulls(jsonb_build_object(
    'deal_won', (
      select min(coalesce(d.closed_on, (d.updated_at at time zone 'America/Sao_Paulo')::date))
        from public.deals d
       where d.client_id = c.id and d.stage = 'won'
    ),
    'first_payment', (
      select min(e.paid_on)
        from public.finance_entries e
       where e.client_id = c.id and e.account = 'client_revenue' and e.paid_on is not null and not e.skipped
    ),
    'owner_defined', case when c.owner_id is not null then true end,
    'portal_access', (
      select min((m.created_at at time zone 'America/Sao_Paulo')::date)
        from public.client_members m
       where m.client_id = c.id
    ),
    'briefing_released', (
      select (b.released_at at time zone 'America/Sao_Paulo')::date
        from public.client_briefings b
       where b.client_id = c.id and b.status::text <> 'preparing'
    ),
    'briefing_submitted', (
      select (coalesce(b.submitted_at, b.updated_at) at time zone 'America/Sao_Paulo')::date
        from public.client_briefings b
       where b.client_id = c.id and b.status::text in ('submitted', 'immersion_done', 'document_sent', 'validated')
    ),
    'briefing_meeting', (
      select (coalesce(b.immersion_at, b.updated_at) at time zone 'America/Sao_Paulo')::date
        from public.client_briefings b
       where b.client_id = c.id and b.status::text in ('immersion_done', 'document_sent', 'validated')
    ),
    'instagram_connected', (
      select min((a.connected_at at time zone 'America/Sao_Paulo')::date)
        from public.social_accounts a
       where a.client_id = c.id and a.network = 'instagram' and a.status = 'connected'
    ),
    'first_post', (
      select min((p.published_at at time zone 'America/Sao_Paulo')::date)
        from public.content_posts p
       where p.client_id = c.id and p.published_at is not null
    ),
    'monthly_reviews', (
      select jsonb_agg(to_char(r.period, 'YYYY-MM') order by r.period)
        from public.client_reviews r
       where r.client_id = c.id and r.done
    ),
    -- Fim do contrato: o último mês das recorrências de receita que ainda
    -- valem, se todas têm data de fim.
    'contract_ends_on', (
      select case when bool_or(r.ends_on is null) then null
                  else (date_trunc('month', max(r.ends_on)) + interval '1 month - 1 day')::date end
        from public.finance_recurrences r
       where r.client_id = c.id
         and r.account = 'client_revenue'
         and (r.ends_on is null or r.ends_on >= date_trunc('month', (now() at time zone 'America/Sao_Paulo'))::date)
    )
  ))
    from public.clients c
   where c.id = p_client;
$$;
revoke all on function private.journey_facts(uuid) from public;
grant execute on function private.journey_facts(uuid) to authenticated;

-- Triggers --------------------------------------------------------------------

-- Criar: o cliente precisa existir; quem criou é quem está logado. Mudar: o
-- cliente e a linha não mudam.
create function private.guard_client_journey()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    if not exists (select 1 from public.clients c where c.id = new.client_id) then
      raise exception 'client_not_found' using errcode = 'P0002';
    end if;
    new.created_by := coalesce((select auth.uid()), new.created_by);
  else
    if new.client_id <> old.client_id or new.line <> old.line then
      raise exception 'journey_fixed' using errcode = '22023';
    end if;
    new.updated_at := now();
  end if;
  return new;
end;
$$;
revoke all on function private.guard_client_journey() from public;

create trigger guard_client_journey before insert or update on public.client_journeys
  for each row execute function private.guard_client_journey();

-- Marcar: a etapa precisa ser da linha; portão não aceita "não se aplica";
-- quem e quando são de quem está logado, agora.
create function private.guard_journey_mark()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  journey_line public.journey_line;
  is_gate boolean;
begin
  if tg_op = 'UPDATE' and (new.journey_id <> old.journey_id or new.step_key <> old.step_key or new.round <> old.round) then
    raise exception 'mark_fixed' using errcode = '22023';
  end if;
  select j.line into journey_line from public.client_journeys j where j.id = new.journey_id;
  select s.gate into is_gate from private.journey_steps s where s.line = journey_line and s.step_key = new.step_key;
  if not found then
    raise exception 'unknown_step' using errcode = '22023';
  end if;
  if is_gate and new.state = 'not_applicable' then
    raise exception 'gate_required' using errcode = '22023';
  end if;
  new.marked_by := (select auth.uid());
  new.marked_at := now();
  return new;
end;
$$;
revoke all on function private.guard_journey_mark() from public;

create trigger guard_journey_mark before insert or update on public.journey_marks
  for each row execute function private.guard_journey_mark();

-- RLS -------------------------------------------------------------------------

alter table public.client_journeys enable row level security;
alter table public.journey_marks enable row level security;

create policy "equipe vê as jornadas" on public.client_journeys
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe inicia jornadas" on public.client_journeys
  for insert to authenticated with check ((select private.is_team_member()));
create policy "equipe muda jornadas" on public.client_journeys
  for update to authenticated using ((select private.is_team_member())) with check ((select private.is_team_member()));

create policy "equipe vê as marcações" on public.journey_marks
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe marca etapas" on public.journey_marks
  for insert to authenticated with check ((select private.is_team_member()));
create policy "equipe muda marcações" on public.journey_marks
  for update to authenticated using ((select private.is_team_member())) with check ((select private.is_team_member()));

-- Leitura da equipe --------------------------------------------------------------

-- Todas as jornadas (ou as de um cliente), com as marcações e os dados, numa
-- consulta só. Security invoker: a conta do cliente recebe uma lista vazia.
create function public.team_journeys(p_client uuid default null)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', j.id,
           'client_id', j.client_id,
           'client_name', c.name,
           'client_active', c.active,
           'owner_id', c.owner_id,
           'line', j.line,
           'phase', j.phase,
           'mode', j.mode,
           'phase_started_on', j.phase_started_on,
           'started_on', j.started_on,
           'contract_ends_on', j.contract_ends_on,
           'ended_on', j.ended_on,
           'marks', coalesce((
             select jsonb_agg(jsonb_build_object(
                      'step_key', m.step_key, 'round', m.round, 'state', m.state, 'note', m.note,
                      'marked_by', m.marked_by, 'marked_at', m.marked_at
                    ) order by m.marked_at)
               from public.journey_marks m
              where m.journey_id = j.id
           ), '[]'::jsonb),
           'facts', coalesce(private.journey_facts(j.client_id), '{}'::jsonb)
         ) order by j.created_at, j.id), '[]'::jsonb)
    from public.client_journeys j
    join public.clients c on c.id = j.client_id
   where p_client is null or j.client_id = p_client;
$$;
revoke execute on function public.team_journeys(uuid) from public, anon;
grant execute on function public.team_journeys(uuid) to authenticated;

-- Leitura do portal (PR seguinte) ----------------------------------------------

-- A versão resumida da jornada do próprio cliente: as linhas em andamento, a
-- fase, o modo, as datas, as marcações (sem nota nem quem) e os dados. O app
-- monta "Onde estamos", "Próximo passo" e "O que depende de você" com o
-- catálogo. Cliente de outra conta, ou inativo, volta vazio.
create function public.portal_journey(target_client uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(jsonb_agg(jsonb_build_object(
           'line', j.line,
           'phase', j.phase,
           'mode', j.mode,
           'phase_started_on', j.phase_started_on,
           'started_on', j.started_on,
           'contract_ends_on', j.contract_ends_on,
           'marks', coalesce((
             select jsonb_agg(jsonb_build_object('step_key', m.step_key, 'round', m.round, 'state', m.state) order by m.marked_at)
               from public.journey_marks m
              where m.journey_id = j.id
           ), '[]'::jsonb),
           'facts', coalesce(private.journey_facts(j.client_id), '{}'::jsonb)
         ) order by j.line), '[]'::jsonb)
    from public.client_journeys j
    join public.clients c on c.id = j.client_id and c.active
   where j.client_id = target_client
     and j.ended_on is null
     and target_client in (select private.my_client_ids());
$$;
revoke execute on function public.portal_journey(uuid) from public, anon;
grant execute on function public.portal_journey(uuid) to authenticated;

-- Avisos ------------------------------------------------------------------------

-- As etapas que faltam na rodada de hoje, de cada jornada em andamento de
-- cliente ativo, com o prazo (o mesmo de evaluateJourney): marcação à mão
-- vale mais que o dado; "reaberta" desliga o automático; a trimestral só no
-- último mês do trimestre; no 1º mês do ongoing, o que venceria antes do
-- começo da fase não conta.
create function private.journey_pending_steps(p_today date)
returns table (
  journey_id uuid,
  client_id uuid,
  line public.journey_line,
  phase public.journey_phase,
  round text,
  step_position integer,
  step_key text,
  step_name text,
  actor text,
  due_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  with journeys as (
    select j.*, private.journey_round(j.phase, j.phase_started_on, p_today) as round,
           coalesce(private.journey_facts(j.client_id), '{}'::jsonb) as facts
      from public.client_journeys j
      join public.clients c on c.id = j.client_id and c.active
     where j.ended_on is null
  ),
  steps as (
    select j.id as journey_id, j.client_id, j.line, j.phase, j.round, j.facts, j.phase_started_on,
           s.position, s.step_key, s.name, s.actor, s.auto, s.target_kind, s.quarterly,
           private.journey_step_due(s.target_kind, s.target_full, s.target_compact, j.mode, j.phase_started_on, p_today) as due_on,
           m.state as mark_state
      from journeys j
      join private.journey_steps s on s.line = j.line and s.phase = j.phase
      left join public.journey_marks m on m.journey_id = j.id and m.step_key = s.step_key and m.round = j.round
  )
  select s.journey_id, s.client_id, s.line, s.phase, s.round, s.position, s.step_key, s.name, s.actor, s.due_on
    from steps s
   where (not s.quarterly or extract(month from p_today) in (3, 6, 9, 12))
     and (s.phase <> 'ongoing' or s.target_kind = 'business_days' or s.due_on >= s.phase_started_on)
     and case
           when s.mark_state = 'open' then true
           when s.mark_state is not null then false
           when s.auto is null then true
           when s.auto = 'owner_defined' then not coalesce((s.facts ->> 'owner_defined')::boolean, false)
           when s.auto = 'monthly_review' then not coalesce(s.facts -> 'monthly_reviews' ? s.round, false)
           else s.facts ->> s.auto is null
         end;
$$;
revoke all on function private.journey_pending_steps(date) from public;

-- Avisos já enviados: um por jornada, tipo e chave.
create table private.journey_notices (
  journey_id uuid not null references public.client_journeys (id),
  -- step_late: etapa parada; materials_late: acessos e materiais; contract_ending: 30 dias.
  kind text not null check (kind in ('step_late', 'materials_late', 'contract_ending')),
  -- A etapa e a rodada, ou o fim do contrato avisado.
  notice_key text not null check (char_length(notice_key) <= 100),
  notified_at timestamptz not null default now(),
  primary key (journey_id, kind, notice_key)
);
comment on table private.journey_notices is
  'Avisos da jornada já enviados. Só private.notify_journey_alerts grava.';

alter table private.journey_notices enable row level security;
revoke all on private.journey_notices from public, anon, authenticated;

-- O job: avisa quem cuida do cliente (sem responsável, a equipe toda) e
-- devolve quantos avisos saíram. Cada aviso sai uma vez.
create function private.notify_journey_alerts(
  p_today date default (now() at time zone 'America/Sao_Paulo')::date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  item record;
  sent integer := 0;
  line_label text;
begin
  for item in
    with pending as (
      select p.*, row_number() over (partition by p.journey_id order by p.step_position) as rn
        from private.journey_pending_steps(p_today) p
    ),
    alerts as (
      -- A etapa atual passou do prazo-alvo (acessos e materiais têm aviso próprio).
      select p.journey_id, p.client_id, p.line, 'step_late' as kind, p.step_key || ':' || p.round as notice_key,
             p.step_name as title,
             'passou do prazo de ' || to_char(p.due_on, 'DD/MM') || ' · com ' ||
               case when p.actor = 'client' then 'o cliente' else 'a Boop' end as body
        from pending p
       where p.rn = 1 and p.due_on < p_today and p.step_key <> 'access_materials'
      union all
      -- Acessos e materiais sem chegar em 3 dias úteis.
      select p.journey_id, p.client_id, p.line, 'materials_late', p.step_key || ':' || p.round,
             p.step_name,
             'sem chegar em 3 dias úteis (prazo ' || to_char(p.due_on, 'DD/MM') || '): o onboarding atrasa junto'
        from pending p
       where p.step_key = 'access_materials' and p.due_on < p_today
      union all
      -- 30 dias antes do fim do contrato, no ongoing.
      select j.id, j.client_id, j.line, 'contract_ending', to_char(e.ends_on, 'YYYY-MM-DD'),
             'Fim do contrato',
             'em ' || to_char(e.ends_on, 'DD/MM/YYYY') || ': relatório do período e proposta de renovação'
        from public.client_journeys j
        join public.clients c on c.id = j.client_id and c.active
       cross join lateral (
         select coalesce(j.contract_ends_on, (private.journey_facts(j.client_id) ->> 'contract_ends_on')::date) as ends_on
       ) e
       where j.ended_on is null
         and j.phase = 'ongoing'
         and e.ends_on is not null
         and e.ends_on - p_today between 0 and 30
    )
    select a.*, k.name as client_name, k.owner_id
      from alerts a
      join public.clients k on k.id = a.client_id
     order by a.client_id, a.line, a.kind
  loop
    insert into private.journey_notices (journey_id, kind, notice_key)
    values (item.journey_id, item.kind, item.notice_key)
    on conflict do nothing;
    if not found then
      continue;
    end if;

    line_label := case when item.line = 'traffic' then 'Tráfego' else 'Social' end;
    insert into public.notifications (user_id, kind, actor_name, client_id, title, body, link)
    select p.id, 'journey_alert', 'Jornada', item.client_id,
           left(item.title, 300),
           left(line_label || ' · ' || item.body, 300),
           '/clientes/' || item.client_id::text
      from public.profiles p
     where item.owner_id is null or p.id = item.owner_id;
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;
revoke all on function private.notify_journey_alerts(date) from public;

-- Todo dia às 08:13 de São Paulo (11:13 UTC; o Brasil não tem horário de verão).
select cron.schedule(
  'journey-alerts',
  '13 11 * * *',
  $$select private.notify_journey_alerts()$$
);
