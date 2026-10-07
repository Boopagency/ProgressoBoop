-- Boop Admin: financeiro gerencial.
--
-- Mesma lógica da planilha "Financeiro - Boop": cada lançamento tem uma
-- categoria gerencial (conta) que diz onde ele entra no DRE; recebimentos pelo
-- gateway (Asaas) guardam a taxa; as premissas (imposto, caixa mínimo,
-- divisão do resultado, sócios, alvo de pró-labore, saldo inicial) ficam numa
-- linha de parâmetros; e o fechamento do mês confere o saldo com o extrato e
-- trava os pagamentos daquele mês.
--
-- Compatível com a versão anterior do app: quem não manda a conta recebe uma
-- conta padrão pelo trigger.

create type public.finance_account as enum (
  -- Entradas
  'client_revenue',      -- Receita de cliente (DRE: receita bruta)
  'other_revenue',       -- Outras receitas (DRE: receita bruta)
  'owner_contribution',  -- Aporte de sócio (só caixa)
  -- Saídas
  'direct_cost',         -- Custo direto de cliente (DRE: custos diretos)
  'fixed_cost',          -- Custo fixo (DRE: custos fixos)
  'other_expense',       -- Outras despesas, avulsas (DRE)
  'tax',                 -- Imposto pago, DAS (fora do DRE: o DRE provisiona pela alíquota)
  'owner_draw',          -- Pró-labore (fora do DRE: é a divisão do resultado)
  'reinvestment'         -- Reinvestimento (fora do DRE: sai da verba de reinvestimento)
);

alter table public.finance_entries
  add column account public.finance_account,
  -- Taxa do gateway cobrada no recebimento (ou no pagamento). Valor líquido =
  -- valor − taxa (entradas) ou −(valor + taxa) (saídas).
  add column fee_cents bigint not null default 0
    check (fee_cents >= 0 and fee_cents <= 100000000000);

alter table public.finance_recurrences
  add column account public.finance_account;

-- Conta padrão de quem não informa: receita de cliente quando há cliente,
-- outras receitas sem cliente; despesas avulsas.
create function private.set_finance_account()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.account is null then
    new.account := case
      when new.kind = 'income' and new.client_id is not null then 'client_revenue'
      when new.kind = 'income' then 'other_revenue'
      else 'other_expense'
    end::public.finance_account;
  end if;
  return new;
end;
$$;

create trigger set_finance_account before insert or update on public.finance_entries
  for each row execute function private.set_finance_account();
create trigger set_finance_account before insert or update on public.finance_recurrences
  for each row execute function private.set_finance_account();

update public.finance_entries set account = null where account is null;
update public.finance_recurrences set account = null where account is null;

alter table public.finance_entries alter column account set not null;
alter table public.finance_recurrences alter column account set not null;

alter table public.finance_entries add constraint finance_entries_account_check check (
  (kind = 'income') = (account in ('client_revenue', 'other_revenue', 'owner_contribution'))
);
alter table public.finance_recurrences add constraint finance_recurrences_account_check check (
  (kind = 'income') = (account in ('client_revenue', 'other_revenue', 'owner_contribution'))
);

create index finance_entries_paid_on_idx on public.finance_entries (paid_on);
create index finance_entries_account_idx on public.finance_entries (account);

-- Parâmetros --------------------------------------------------------------------
-- Uma linha só (id = true). Percentuais em pontos-base (600 = 6%).

create table public.finance_settings (
  id boolean primary key default true check (id),
  -- Alíquota sobre a receita bruta (Simples Nacional). O DRE provisiona por ela.
  tax_rate_bps integer not null default 600 check (tax_rate_bps between 0 and 5000),
  -- A alíquota ainda é uma premissa (a confirmar com o contador)?
  tax_rate_confirmed boolean not null default false,
  -- Caixa mínimo = este número de meses de custo fixo.
  reserve_months smallint not null default 3 check (reserve_months between 0 and 24),
  -- Divisão do resultado depois do caixa mínimo; o resto é pró-labore.
  reserve_share_bps integer not null default 2000 check (reserve_share_bps between 0 and 10000),
  reinvest_share_bps integer not null default 1000 check (reinvest_share_bps between 0 and 10000),
  partners smallint not null default 3 check (partners between 1 and 20),
  -- Alvo de pró-labore mensal por sócio (calcula a receita necessária).
  owner_draw_target_cents bigint not null default 500000 check (owner_draw_target_cents between 0 and 100000000000),
  -- Saldo em conta no início (dia 1 de opening_on) e a partir de quando o saldo conta.
  opening_balance_cents bigint not null default 0
    check (opening_balance_cents between -100000000000 and 100000000000),
  opening_on date not null default '2026-09-01' check (extract(day from opening_on) = 1),
  -- Destaca contratos que terminam nestes dias.
  contract_alert_days smallint not null default 30 check (contract_alert_days between 0 and 365),
  updated_by uuid default auth.uid() references public.profiles (id) on delete set null,
  updated_at timestamptz not null default now(),
  constraint finance_settings_split_check check (reserve_share_bps + reinvest_share_bps <= 10000)
);
comment on table public.finance_settings is
  'Premissas do financeiro (imposto, caixa mínimo, divisão do resultado, sócios, saldo inicial). Uma linha só.';

-- Premissas da planilha (aba PARÂMETROS).
insert into public.finance_settings default values;

-- Fechamento do mês -------------------------------------------------------------
-- Depois de conferir os lançamentos com o extrato: o mês passa a "realizado
-- conferido" e os pagamentos dele não mudam mais (reabrir = apagar o fechamento).

create table public.finance_closings (
  period date primary key check (extract(day from period) = 1),
  -- Saldo pelos lançamentos e saldo do extrato no fim do mês.
  ledger_balance_cents bigint not null,
  bank_balance_cents bigint not null,
  notes text check (char_length(notes) <= 2000),
  closed_by uuid not null default auth.uid() references public.profiles (id),
  closed_at timestamptz not null default now()
);
comment on table public.finance_closings is 'Meses fechados (conferidos com o extrato).';

create function private.month_is_closed(day date)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select day is not null and exists (
    select 1 from public.finance_closings c where c.period = date_trunc('month', day)::date
  );
$$;

-- Pagamentos de mês fechado não mudam (valor, taxa, data, conta, tipo, pular,
-- excluir). Descrição, observação, categoria e vínculos podem mudar.
create function private.check_finance_lock()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  money_changed boolean;
begin
  if tg_op = 'DELETE' then
    if private.month_is_closed(old.paid_on) then
      raise exception 'closed_month' using errcode = 'P0001', detail = old.paid_on::text;
    end if;
    return old;
  end if;
  if tg_op = 'UPDATE' then
    money_changed := new.amount_cents is distinct from old.amount_cents
      or new.fee_cents is distinct from old.fee_cents
      or new.paid_on is distinct from old.paid_on
      or new.kind is distinct from old.kind
      or new.account is distinct from old.account
      or new.skipped is distinct from old.skipped;
    if money_changed and private.month_is_closed(old.paid_on) then
      raise exception 'closed_month' using errcode = 'P0001', detail = old.paid_on::text;
    end if;
    if money_changed and private.month_is_closed(new.paid_on) then
      raise exception 'closed_month' using errcode = 'P0001', detail = new.paid_on::text;
    end if;
    return new;
  end if;
  if private.month_is_closed(new.paid_on) then
    raise exception 'closed_month' using errcode = 'P0001', detail = new.paid_on::text;
  end if;
  return new;
end;
$$;

create trigger check_finance_lock before insert or update or delete on public.finance_entries
  for each row execute function private.check_finance_lock();

-- updated_at e autoria dos parâmetros.
create function private.set_settings_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.id := true;
  new.updated_at := now();
  new.updated_by := auth.uid();
  return new;
end;
$$;

create trigger set_settings_fields before update on public.finance_settings
  for each row execute function private.set_settings_fields();

-- Histórico: a conta e a taxa também contam como mudança.
create or replace function private.log_finance_activity()
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
    -- Mês de recorrência gravado agora: a mudança logo em seguida é que conta.
    if new_row ->> 'recurrence_id' is not null then
      return null;
    end if;
    perform private.log_activity(kind, new.id, new.description, new.project_id, new.client_id, 'created', '{}'::jsonb);
  elsif tg_op = 'DELETE' then
    perform private.log_activity(kind, old.id, old.description, old.project_id, old.client_id, 'deleted', '{}'::jsonb);
  else
    foreach field in array array[
      'description', 'amount_cents', 'fee_cents', 'due_on', 'paid_on', 'skipped', 'day_of_month', 'ends_on',
      'client_id', 'project_id', 'account', 'category'
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

-- RLS -------------------------------------------------------------------------

alter table public.finance_settings enable row level security;
alter table public.finance_closings enable row level security;

create policy "equipe vê os parâmetros" on public.finance_settings
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe edita os parâmetros" on public.finance_settings
  for update to authenticated
  using ((select private.is_team_member())) with check ((select private.is_team_member()));

create policy "equipe vê os fechamentos" on public.finance_closings
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe fecha o mês" on public.finance_closings
  for insert to authenticated
  with check ((select private.is_team_member()) and closed_by = (select auth.uid()));
create policy "equipe reabre o mês" on public.finance_closings
  for delete to authenticated using ((select private.is_team_member()));
