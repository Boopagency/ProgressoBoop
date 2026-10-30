// Compara a regra dos atrasos em SQL (migration 20261030120000_portal_finance)
// com a do app (logic.ts), num Postgres descartável. Precisa do psql e de um
// servidor local onde se possa criar um banco (nunca o Supabase):
//   FINANCE_SQL_TEST_DB="host=/var/run/postgresql port=5432 user=postgres" \
//     node --test src/features/finance/overdue-sql.test.mjs
// Sem a variável, o teste é pulado. Cria o banco `finance_sql_test_<pid>`, com
// o mínimo das tabelas do app, roda a migration inteira e apaga o banco no fim.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { after, before, test } from "node:test"

import { load } from "./test-setup.mjs"

const server = process.env.FINANCE_SQL_TEST_DB
const database = `finance_sql_test_${process.pid}`
const migration = new URL("../../../supabase/migrations/20261030120000_portal_finance.sql", import.meta.url)

function psql(sql, { db = database, singleTransaction = false } = {}) {
  const args = [`${server} dbname=${db}`, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-At"]
  if (singleTransaction) args.push("--single-transaction")
  return execFileSync("psql", args, { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()
}

const json = (sql) => JSON.parse(psql(`select coalesce(json_agg(t), '[]') from (${sql}) t;`) || "[]")
const quote = (value) => (value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`)

// O mínimo do schema do app que a migration usa.
const BOOTSTRAP = `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create schema private;
create schema auth;
create schema cron;
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('test.uid', true), '')::uuid $f$;
create function cron.schedule(text, text, text) returns bigint language sql as $f$ select 1::bigint $f$;
create type public.notification_kind as enum ('message');
create type public.client_notification_kind as enum ('team_message');
create type public.finance_kind as enum ('income', 'expense');
create type public.finance_account as enum ('client_revenue', 'other_revenue', 'owner_contribution', 'direct_cost', 'fixed_cost', 'other_expense', 'tax', 'owner_draw', 'reinvestment');
create table public.clients (id uuid primary key, name text not null, active boolean not null default true);
create table public.profiles (id uuid primary key);
create table public.client_members (client_id uuid not null references public.clients (id), user_id uuid not null);
create table public.finance_recurrences (
  id uuid primary key, kind public.finance_kind not null, account public.finance_account not null,
  description text not null, amount_cents bigint not null, day_of_month smallint not null,
  client_id uuid references public.clients (id), starts_on date not null, ends_on date,
  created_at timestamptz not null default now()
);
create table public.finance_entries (
  id uuid primary key, kind public.finance_kind not null, account public.finance_account not null,
  description text not null, amount_cents bigint not null, due_on date not null, paid_on date,
  skipped boolean not null default false, client_id uuid references public.clients (id),
  recurrence_id uuid references public.finance_recurrences (id) on delete set null, period date,
  unique (recurrence_id, period)
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, kind public.notification_kind not null,
  actor_name text, client_id uuid, title text, body text, link text not null, created_at timestamptz not null default now()
);
create table public.client_notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, client_id uuid not null,
  kind public.client_notification_kind not null, actor_name text, title text, body text,
  link text not null check (link ~ '^/portal(/|\\?|$)'), created_at timestamptz not null default now()
);
create function private.my_client_ids() returns setof uuid language sql stable as $f$
  select m.client_id from public.client_members m where m.user_id = auth.uid()
$f$;
create function private.notify_client_members(
  p_client uuid, p_actor uuid, p_kind public.client_notification_kind, p_title text, p_body text, p_link text,
  p_channel uuid default null, p_message uuid default null, p_post uuid default null, p_project uuid default null, p_task uuid default null
) returns void language plpgsql as $f$
begin
  if not exists (select 1 from public.clients c where c.id = p_client and c.active) then return; end if;
  insert into public.client_notifications (user_id, client_id, kind, title, body, link)
  select m.user_id, p_client, p_kind, left(p_title, 300), left(p_body, 300), p_link
    from public.client_members m where m.client_id = p_client and m.user_id is distinct from p_actor;
end;
$f$;
`

const C1 = "11111111-1111-4111-8111-111111111111"
const C2 = "22222222-2222-4222-8222-222222222222"
const C3 = "33333333-3333-4333-8333-333333333333"
const MEMBER = "44444444-4444-4444-8444-444444444444"
const TEAM = ["55555555-5555-4555-8555-555555555555", "66666666-6666-4666-8666-666666666666"]
const uuid = (n) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`

const base = { kind: "income", account: "client_revenue", category: null, project_id: null, notes: null, created_by: "", created_at: "", updated_at: "" }
const recurrences = [
  // Dia 31: fevereiro, meses de 30 e de 31 dias.
  { ...base, id: uuid(1), description: "Mensalidade", amount_cents: 350000, day_of_month: 31, client_id: C1, starts_on: "2025-11-01", ends_on: null },
  // Termina em agosto.
  { ...base, id: uuid(2), description: "Projeto site", amount_cents: 123456, day_of_month: 10, client_id: C1, starts_on: "2026-05-01", ends_on: "2026-08-01" },
  // Outro cliente, com o aviso desligado.
  { ...base, id: uuid(3), description: "Fee", amount_cents: 99, day_of_month: 30, client_id: C2, starts_on: "2026-01-01", ends_on: null },
  // Custo do cliente e receita sem cliente: fora.
  { ...base, id: uuid(4), kind: "expense", account: "direct_cost", description: "Freela", amount_cents: 5000, day_of_month: 5, client_id: C1, starts_on: "2026-01-01", ends_on: null },
  { ...base, id: uuid(5), account: "other_revenue", description: "Palestra", amount_cents: 5000, day_of_month: 5, client_id: null, starts_on: "2026-01-01", ends_on: null },
  // Começa no futuro.
  { ...base, id: uuid(6), description: "Novo contrato", amount_cents: 10000000, day_of_month: 1, client_id: C3, starts_on: "2027-01-01", ends_on: null },
]
const entry = (n, fields) => ({
  ...base, id: uuid(100 + n), description: "Avulso", amount_cents: 100000, fee_cents: 0, due_on: "2026-10-10",
  paid_on: null, skipped: false, client_id: C1, recurrence_id: null, period: null, ...fields,
})
const entries = [
  // Mensalidade: fevereiro pago, março pulado, abril com outro valor (em aberto), maio passado para outro cliente.
  entry(1, { recurrence_id: uuid(1), period: "2026-02-01", due_on: "2026-02-28", paid_on: "2026-03-02", amount_cents: 350000, description: "Mensalidade" }),
  entry(2, { recurrence_id: uuid(1), period: "2026-03-01", due_on: "2026-03-31", skipped: true, amount_cents: 350000, description: "Mensalidade" }),
  entry(3, { recurrence_id: uuid(1), period: "2026-04-01", due_on: "2026-04-30", amount_cents: 400000, description: "Mensalidade (reajuste)" }),
  entry(4, { recurrence_id: uuid(1), period: "2026-05-01", due_on: "2026-05-31", client_id: C2, amount_cents: 350000, description: "Mensalidade" }),
  // Avulsos: em aberto (antigo, fora dos 12 meses das recorrências), pago, pulado, de outra conta, de C3 vencendo hoje.
  entry(5, { description: "Ensaio", due_on: "2025-06-15", amount_cents: 80000 }),
  entry(6, { description: "Pago", due_on: "2026-10-01", paid_on: "2026-10-01" }),
  entry(7, { description: "Pulado", due_on: "2026-10-02", skipped: true }),
  entry(8, { description: "Reembolso", account: "other_revenue", due_on: "2026-10-03" }),
  entry(9, { description: "Hoje", client_id: C3, due_on: "2026-10-29", amount_cents: 1 }),
  entry(10, { description: "Mudou de data", client_id: C3, due_on: "2026-10-20", amount_cents: 70000 }),
]

function insertFixtures() {
  const rows = [
    `insert into public.clients (id, name, active) values (${quote(C1)}, 'Velmont', true), (${quote(C2)}, 'Hertmann', true), (${quote(C3)}, 'Inativa', false);`,
    `update public.clients set payment_reminders = false where id = ${quote(C2)};`,
    `insert into public.profiles (id) values ${TEAM.map((id) => `(${quote(id)})`).join(", ")};`,
    `insert into public.client_members (client_id, user_id) values (${quote(C1)}, ${quote(MEMBER)}), (${quote(C2)}, ${quote(MEMBER)}), (${quote(C3)}, ${quote(MEMBER)});`,
    ...recurrences.map(
      (r) =>
        `insert into public.finance_recurrences (id, kind, account, description, amount_cents, day_of_month, client_id, starts_on, ends_on) values (${[
          r.id, r.kind, r.account, r.description, r.amount_cents, r.day_of_month, r.client_id, r.starts_on, r.ends_on,
        ].map(quote).join(", ")});`
    ),
    ...entries.map(
      (e) =>
        `insert into public.finance_entries (id, kind, account, description, amount_cents, due_on, paid_on, skipped, client_id, recurrence_id, period) values (${[
          e.id, e.kind, e.account, e.description, e.amount_cents, e.due_on, e.paid_on, e.skipped, e.client_id, e.recurrence_id, e.period,
        ].map(quote).join(", ")});`
    ),
  ]
  psql(rows.join("\n"))
}

const { chargeKey, clientOverdue, clientStatement, noticeKey, occurrenceDue, overdueNoticesDue } = await load("@/features/finance/logic")
const { formatMoney } = await load("@/features/finance/money")
const { parsePortalFinance } = await load("@/features/portal/finance-logic")
const { addDaysToKey } = await load("@/lib/dates")

const skip = server ? false : "defina FINANCE_SQL_TEST_DB para rodar"

before(() => {
  if (!server) return
  psql(`create database ${database};`, { db: "postgres" })
  psql(BOOTSTRAP)
  psql(readFileSync(migration, "utf8"), { singleTransaction: true })
  insertFixtures()
})

after(() => {
  if (server) psql(`drop database if exists ${database} with (force);`, { db: "postgres" })
})

/** O que o app considera em atraso, de todos os clientes (só receitas de cliente). */
function appCharges(today) {
  return [C1, C2, C3]
    .flatMap((client) => clientOverdue(client, entries, recurrences, today).filter((item) => item.account === "client_revenue"))
    .map((item) => ({ charge_key: chargeKey(item), client_id: item.client_id, description: item.description, amount_cents: item.amount_cents, due_on: item.due_on }))
    .sort((a, b) => (a.charge_key < b.charge_key ? -1 : 1))
}

function sqlCharges(today) {
  return json(
    `select charge_key, client_id, description, amount_cents, to_char(due_on, 'YYYY-MM-DD') as due_on
       from private.finance_overdue_charges(${quote(today)}::date) order by charge_key`
  )
}

test("vencimento da ocorrência e valor em reais: SQL igual ao app", { skip }, () => {
  const cases = [
    [31, "2026-02-01"], [31, "2028-02-01"], [30, "2026-02-01"], [31, "2026-04-01"], [31, "2026-05-01"], [29, "2026-02-01"], [1, "2026-03-01"], [15, "2026-11-01"],
  ]
  const days = json(cases.map(([day, period]) => `select to_char(private.finance_occurrence_due(${day}, ${quote(period)}::date), 'YYYY-MM-DD') as due`).join(" union all "))
  assert.deepEqual(days.map((row) => row.due), cases.map(([day, period]) => occurrenceDue({ day_of_month: day }, period)))
  const amounts = [0, 1, 99, 100, 350000, 123456, 100000000, 123456789012]
  const money = json(amounts.map((cents, n) => `select ${n} as n, private.format_brl(${cents}) as text`).join(" union all ") + " order by n")
  assert.deepEqual(money.map((row) => row.text), amounts.map(formatMoney))
})

test("cobranças em atraso: SQL igual ao app em vários dias", { skip }, () => {
  for (const today of ["2026-02-28", "2026-03-01", "2026-04-30", "2026-05-01", "2026-06-11", "2026-08-11", "2026-09-01", "2026-10-29", "2026-11-01", "2027-02-01", "2027-06-15"]) {
    assert.deepEqual(sqlCharges(today), appCharges(today), `dia ${today}`)
  }
})

test("portal_finance devolve só o que é do cliente e dá o mesmo atraso", { skip }, () => {
  const today = "2026-10-29"
  const call = (client, uid = MEMBER) =>
    JSON.parse(psql(`select set_config('test.uid', ${quote(uid)}, false); select coalesce(public.portal_finance(${quote(client)})::text, 'null');`).split("\n").pop())
  const raw = call(C1)
  assert.equal(raw.reminders, true)
  assert.deepEqual(Object.keys(raw.entries[0]).sort(), ["amount_cents", "description", "due_on", "id", "paid_on", "period", "recurrence_id"])
  assert.deepEqual(Object.keys(raw.recurrences[0]).sort(), ["amount_cents", "day_of_month", "description", "ends_on", "id", "starts_on"])
  // Nada de custo, de outra conta ou de outro cliente.
  assert.deepEqual(raw.recurrences.map((r) => r.id).sort(), [uuid(1), uuid(2)])
  assert.ok(!raw.entries.some((e) => [uuid(102), uuid(104), uuid(107), uuid(108)].includes(e.id)))
  const data = parsePortalFinance(C1, raw)
  const portal = clientStatement(C1, data.entries, data.recurrences, today).overdue.map(chargeKey).sort()
  assert.deepEqual(portal, sqlCharges(today).filter((row) => row.client_id === C1).map((row) => row.charge_key).sort())
  assert.equal(call(C2).reminders, false)
  // Inativo, sem vínculo ou sem sessão: vazio.
  assert.equal(call(C3), null)
  assert.equal(call(C1, TEAM[0]), null)
})

test("job diário: mesmas etapas que o app, uma vez só, e mudança de vencimento arma de novo", { skip }, () => {
  const reminders = { [C1]: true, [C2]: false, [C3]: false }
  const expected = []
  const sent = new Set()
  let day = "2026-10-01"
  for (; day <= "2026-11-15"; day = addDaysToKey(day, 1)) {
    for (const client of [C1, C2, C3]) {
      for (const item of clientOverdue(client, entries, recurrences, day).filter((row) => row.account === "client_revenue")) {
        for (const stage of overdueNoticesDue(item, day, sent, reminders[client])) {
          sent.add(noticeKey(chargeKey(item), stage, item.due_on))
          expected.push(`${day} ${chargeKey(item)} ${stage}`)
        }
      }
    }
    psql(`select private.notify_finance_overdue(${quote(day)}::date);`)
    // Rodar duas vezes no mesmo dia não repete nada.
    assert.equal(psql(`select private.notify_finance_overdue(${quote(day)}::date);`), "0")
  }
  const got = json(`select charge_key, stage from private.finance_overdue_notices`).map((row) => `${row.charge_key} ${row.stage}`)
  assert.deepEqual(got.sort(), expected.map((line) => line.split(" ").slice(1).join(" ")).sort())
  assert.ok(expected.length >= 4, "o cenário precisa gerar avisos")
  if (process.env.FINANCE_SQL_TEST_VERBOSE) console.log(expected.join("\n"))

  // Equipe: um aviso por pessoa por etapa; cliente: só o C1 (C2 desligado, C3 inativo).
  const teamStages = expected.filter((line) => !line.endsWith("client_due")).length
  assert.equal(Number(psql(`select count(*) from public.notifications where kind = 'payment_overdue'`)), teamStages * TEAM.length)
  const clientStages = expected.filter((line) => line.endsWith("client_due"))
  assert.ok(clientStages.length > 0)
  assert.deepEqual(
    json(`select distinct client_id from public.client_notifications where kind = 'payment_overdue'`).map((row) => row.client_id),
    [C1]
  )
  assert.equal(Number(psql(`select count(*) from public.client_notifications where kind = 'payment_overdue'`)), clientStages.length)
  const sample = json(`select title, body, link from public.client_notifications where kind = 'payment_overdue' order by created_at, title limit 1`)[0]
  assert.match(sample.body, /^R\$ [\d.]+,\d{2} · venceu em \d{2}\/\d{2}$/)
  assert.equal(sample.link, `/portal/financeiro?cliente=${C1}`)
  const team = json(`select body, link from public.notifications where kind = 'payment_overdue' order by created_at limit 1`)[0]
  assert.match(team.body, /^R\$ [\d.]+,\d{2} · venceu (ontem|há \d+ dias)$/)
  assert.match(team.link, /^\/financeiro\/lancamentos\?cliente=[0-9a-f-]{36}&situacao=atrasado$/)

  // A equipe mudou o vencimento de um avulso: os avisos saem de novo para a data nova.
  psql(`update public.finance_entries set due_on = '2026-11-20' where id = ${quote(uuid(110))};`)
  assert.equal(psql(`select private.notify_finance_overdue('2026-11-21'::date);`), "1")
  // Pago: nada mais.
  psql(`update public.finance_entries set paid_on = '2026-11-22' where id = ${quote(uuid(110))};`)
  assert.equal(psql(`select private.notify_finance_overdue('2026-11-27'::date);`), "0")
})
