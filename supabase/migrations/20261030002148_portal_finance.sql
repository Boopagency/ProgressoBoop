-- Boop Admin: o financeiro do cliente no portal e os avisos de pagamento em
-- atraso.
--
-- 1. Portal. O cliente não lê as tabelas do financeiro: `portal_finance`
--    (security definer, search_path vazio, exige membro do cliente por
--    private.my_client_ids() e cliente ativo) devolve só as receitas de
--    cliente (`client_revenue`) dele, com descrição, valor, vencimento e data
--    do pagamento. Nada de observações, categoria, taxa, projeto, custos ou
--    outros clientes. O app calcula as ocorrências das recorrências (os meses
--    que ainda não viraram lançamento) com a mesma lógica do admin
--    (`src/features/finance/logic.ts`), então o "Em atraso" do portal é o
--    mesmo da página do cliente.
--
-- 2. Avisos automáticos. Todo dia às 08:07 de São Paulo (11:07 UTC), o
--    pg_cron chama private.notify_finance_overdue(), que acha as receitas de
--    cliente vencidas e não recebidas (lançamentos e ocorrências virtuais dos
--    últimos 12 meses, a mesma regra de `overdueItems`, espelhada em
--    private.finance_overdue_charges) e avisa:
--      - a equipe toda (sino e celular, `notifications`), 1 dia depois do
--        vencimento e de novo 7 dias depois;
--      - as contas do cliente (portal e celular, `client_notifications`), 3
--        dias depois, uma vez, se o cliente está ativo e com "Avisar o
--        cliente sobre pagamentos em atraso" ligado
--        (`clients.payment_reminders`, padrão ligado).
--    Cada etapa sai uma vez por cobrança e vencimento: o que já foi avisado
--    fica em private.finance_overdue_notices, com a chave da cobrança (a
--    recorrência e o mês, que vale para a ocorrência virtual e para o
--    lançamento que nasce dela, ou o id do lançamento avulso). Se o job não
--    rodar num dia, a etapa ainda sai nos 2 dias seguintes; atrasos mais
--    antigos do que isso (ex.: os que já existem quando esta migration entra)
--    não disparam aviso. Cobrança paga ou pulada não avisa.
--
-- Tudo no banco, sem rota do app nem segredo: a regra das ocorrências é
-- pequena (dia do mês ajustado ao fim do mês, recorrência ativa no mês, mês
-- já gravado não conta) e o teste
-- `src/features/finance/overdue-sql.test.mjs` compara os dois lados.
--
-- Aditivo para o código que está na main: dois tipos novos de aviso, uma
-- coluna nova com padrão, uma tabela privada, funções novas e um job novo.

-- Tipos dos avisos ------------------------------------------------------------

alter type public.notification_kind add value if not exists 'payment_overdue';
alter type public.client_notification_kind add value if not exists 'payment_overdue';

-- Interruptor por cliente -----------------------------------------------------

alter table public.clients
  add column payment_reminders boolean not null default true;

comment on column public.clients.payment_reminders is
  'Avisar o cliente (portal e celular) sobre pagamentos em atraso, e mostrar o aviso no portal. A equipe é sempre avisada.';

-- Regra das ocorrências (espelho de logic.ts) ---------------------------------

-- Vencimento da ocorrência: o dia da recorrência, ou o último dia do mês
-- (occurrenceDue).
create function private.finance_occurrence_due(p_day integer, p_period date)
returns date
language sql
immutable
set search_path = ''
as $$
  select make_date(
    extract(year from p_period)::integer,
    extract(month from p_period)::integer,
    least(p_day, extract(day from date_trunc('month', p_period) + interval '1 month - 1 day')::integer)
  );
$$;

revoke all on function private.finance_occurrence_due(integer, date) from public;

-- 350000 → 'R$ 3.500,00' (formatMoney).
create function private.format_brl(p_cents bigint)
returns text
language sql
immutable
set search_path = ''
as $$
  select 'R$ ' || translate(to_char(p_cents / 100.0, 'FM999,999,999,990.00'), ',.', '.,');
$$;

revoke all on function private.format_brl(bigint) from public;

-- Receitas de cliente vencidas antes de `p_today` e não recebidas (nem
-- puladas): os lançamentos gravados e, das recorrências, os meses dos últimos
-- 12 (e o atual) que ainda não viraram lançamento. A mesma regra de
-- overdueItems + clientOverdue, só com a conta `client_revenue`.
create function private.finance_overdue_charges(p_today date)
returns table (
  charge_key text,
  client_id uuid,
  description text,
  amount_cents bigint,
  due_on date
)
language sql
stable
security definer
set search_path = ''
as $$
  select case
           when e.recurrence_id is not null and e.period is not null
             then 'r:' || e.recurrence_id::text || ':' || to_char(e.period, 'YYYY-MM-DD')
           else e.id::text
         end,
         e.client_id, e.description, e.amount_cents, e.due_on
    from public.finance_entries e
   where e.account = 'client_revenue'
     and e.client_id is not null
     and not e.skipped
     and e.paid_on is null
     and e.due_on < p_today
  union all
  select 'r:' || r.id::text || ':' || to_char(m.period, 'YYYY-MM-DD'),
         r.client_id, r.description, r.amount_cents,
         private.finance_occurrence_due(r.day_of_month, m.period)
    from public.finance_recurrences r
   cross join lateral (
     select g::date as period
       from generate_series(
         (date_trunc('month', p_today) - interval '12 months')::timestamp,
         date_trunc('month', p_today)::timestamp,
         interval '1 month'
       ) g
   ) m
   where r.account = 'client_revenue'
     and r.client_id is not null
     and r.starts_on <= m.period
     and (r.ends_on is null or m.period <= r.ends_on)
     and not exists (
       select 1 from public.finance_entries e where e.recurrence_id = r.id and e.period = m.period
     )
     and private.finance_occurrence_due(r.day_of_month, m.period) < p_today;
$$;

revoke all on function private.finance_overdue_charges(date) from public;

-- Avisos já enviados ----------------------------------------------------------

create table private.finance_overdue_notices (
  -- 'r:<recorrência>:<mês>' ou o id do lançamento avulso.
  charge_key text not null check (char_length(charge_key) <= 100),
  -- team_due: equipe, 1 dia depois; client_due: cliente, 3 dias depois;
  -- team_week: equipe, 7 dias depois.
  stage text not null check (stage in ('team_due', 'client_due', 'team_week')),
  -- O vencimento avisado: mudar a data da cobrança arma os avisos de novo.
  due_on date not null,
  client_id uuid not null references public.clients (id) on delete cascade,
  notified_at timestamptz not null default now(),
  primary key (charge_key, stage, due_on)
);
comment on table private.finance_overdue_notices is
  'Avisos de pagamento em atraso já enviados (uma linha por cobrança, etapa e vencimento). Só private.notify_finance_overdue grava.';

create index finance_overdue_notices_client_id_idx on private.finance_overdue_notices (client_id);

alter table private.finance_overdue_notices enable row level security;
revoke all on private.finance_overdue_notices from public, anon, authenticated;

-- Job diário ------------------------------------------------------------------

-- Etapas que vencem hoje (com 2 dias de folga, se o job não rodou) e ainda não
-- saíram. Devolve quantos avisos (cobrança e etapa) saíram.
create function private.notify_finance_overdue(
  p_today date default (now() at time zone 'America/Sao_Paulo')::date
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  charge record;
  late_text text;
  sent integer := 0;
begin
  delete from private.finance_overdue_notices n where n.due_on < p_today - 400;

  for charge in
    select c.charge_key, c.client_id, c.description, c.amount_cents, c.due_on,
           p_today - c.due_on as days_late,
           s.stage, s.audience,
           k.active and k.payment_reminders as reminders
      from private.finance_overdue_charges(p_today) c
      join public.clients k on k.id = c.client_id
      join (values ('team_due', 'team', 1), ('client_due', 'client', 3), ('team_week', 'team', 7))
        as s (stage, audience, after_days)
        on p_today - c.due_on between s.after_days and s.after_days + 2
     where not exists (
       select 1 from private.finance_overdue_notices n
        where n.charge_key = c.charge_key and n.stage = s.stage and n.due_on = c.due_on
     )
     order by c.due_on, c.charge_key, s.after_days
  loop
    if charge.audience = 'client' and not charge.reminders then
      continue;
    end if;
    insert into private.finance_overdue_notices (charge_key, stage, due_on, client_id)
    values (charge.charge_key, charge.stage, charge.due_on, charge.client_id)
    on conflict do nothing;
    if not found then
      continue;
    end if;

    if charge.audience = 'team' then
      late_text := case when charge.days_late = 1 then 'venceu ontem' else 'venceu há ' || charge.days_late || ' dias' end;
      insert into public.notifications (user_id, kind, actor_name, client_id, title, body, link)
      select p.id, 'payment_overdue', 'Financeiro', charge.client_id, left(charge.description, 300),
             private.format_brl(charge.amount_cents) || ' · ' || late_text,
             '/financeiro/lancamentos?cliente=' || charge.client_id::text || '&situacao=atrasado'
        from public.profiles p;
    else
      perform private.notify_client_members(
        charge.client_id, null, 'payment_overdue', charge.description,
        private.format_brl(charge.amount_cents) || ' · venceu em ' || to_char(charge.due_on, 'DD/MM'),
        '/portal/financeiro?cliente=' || charge.client_id::text
      );
    end if;
    sent := sent + 1;
  end loop;

  return sent;
end;
$$;

revoke all on function private.notify_finance_overdue(date) from public;

-- Todo dia às 08:07 de São Paulo (11:07 UTC; o Brasil não tem horário de verão).
select cron.schedule(
  'finance-overdue-notices',
  '7 11 * * *',
  $$select private.notify_finance_overdue()$$
);

-- Portal ------------------------------------------------------------------------

-- O financeiro do cliente no portal: o interruptor dos avisos, os lançamentos
-- e as recorrências de receita de cliente dele (só os campos liberados) e os
-- meses das recorrências que já viraram lançamento fora da conta (pulados ou
-- passados para outro cliente), para não voltarem como pendentes. Cliente de
-- outra conta, ou inativo, volta vazio.
create function public.portal_finance(target_client uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'reminders', c.payment_reminders,
    'entries', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', e.id, 'description', e.description, 'amount_cents', e.amount_cents,
               'due_on', e.due_on, 'paid_on', e.paid_on, 'recurrence_id', e.recurrence_id, 'period', e.period
             ) order by e.due_on, e.id)
        from public.finance_entries e
       where e.account = 'client_revenue'
         and e.client_id = c.id
         and not e.skipped
    ), '[]'::jsonb),
    'recurrences', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', r.id, 'description', r.description, 'amount_cents', r.amount_cents,
               'day_of_month', r.day_of_month, 'starts_on', r.starts_on, 'ends_on', r.ends_on
             ) order by r.created_at, r.id)
        from public.finance_recurrences r
       where r.account = 'client_revenue'
         and r.client_id = c.id
    ), '[]'::jsonb),
    'taken', coalesce((
      select jsonb_agg(jsonb_build_object('recurrence_id', e.recurrence_id, 'period', e.period))
        from public.finance_entries e
        join public.finance_recurrences r on r.id = e.recurrence_id
       where r.account = 'client_revenue'
         and r.client_id = c.id
         and e.period is not null
         and (e.skipped or e.account <> 'client_revenue' or e.client_id is distinct from c.id)
    ), '[]'::jsonb)
  )
    from public.clients c
   where c.id = target_client
     and c.active
     and c.id in (select private.my_client_ids());
$$;

revoke execute on function public.portal_finance(uuid) from public, anon;
grant execute on function public.portal_finance(uuid) to authenticated;
