// Testa a migration da jornada (20261108210000_journey) num Postgres
// descartável: a cópia do catálogo igual à do código, o RLS (só a equipe), as
// travas das marcações, a leitura do portal, as etapas que faltam e os prazos
// iguais aos de logic.ts e os avisos do job (uma vez cada). Precisa do psql e
// de um servidor local onde se possa criar um banco (nunca o Supabase):
//   JOURNEY_SQL_TEST_DB="host=/var/run/postgresql port=5432 user=postgres" \
//     node --test src/features/journey/journey-sql.test.mjs
// Sem a variável, o teste é pulado. Cria o banco `journey_sql_test_<pid>`,
// com o mínimo das tabelas do app, roda a migration numa transação (como o
// Supabase aplica) e apaga o banco no fim.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { after, before, test } from "node:test"

import { load } from "../finance/test-setup.mjs"

const { JOURNEY_CATALOG } = await load("@/features/journey/catalog")
const logic = await load("@/features/journey/logic")

const server = process.env.JOURNEY_SQL_TEST_DB
const database = `journey_sql_test_${process.pid}`
const migrationsDir = new URL("../../../supabase/migrations/", import.meta.url)
const migrations = readdirSync(migrationsDir)
  .filter((name) => /^\d+_journey(_[a-z_]+)?\.sql$/.test(name))
  .sort()
  .map((name) => new URL(name, migrationsDir))

function psql(sql, { db = database, singleTransaction = false } = {}) {
  const args = [`${server} dbname=${db}`, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-At"]
  if (singleTransaction) args.push("--single-transaction")
  return execFileSync("psql", args, { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()
}

const quote = (value) => (value === null || value === undefined ? "null" : `'${String(value).replace(/'/g, "''")}'`)

/** Roda como uma conta logada (role authenticated, com o RLS valendo). Devolve a última linha. */
function as(uid, sql) {
  const out = psql(`set role authenticated; select set_config('test.uid', ${quote(uid)}, false);\n${sql}`)
  return out.split("\n").pop() ?? ""
}

function failsAs(uid, sql) {
  try {
    as(uid, sql)
  } catch (error) {
    return String(error.stderr ?? error.message)
  }
  assert.fail(`deveria ter falhado: ${sql}`)
}

// O mínimo do schema do app (e do Supabase) que a migration usa.
const BOOTSTRAP = `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create schema private;
create schema auth;
create schema cron;
create table cron.jobs (name text, schedule text, command text);
create function cron.schedule(p_name text, p_schedule text, p_command text) returns bigint language sql as $f$
  insert into cron.jobs values (p_name, p_schedule, p_command) returning 1::bigint
$f$;
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('test.uid', true), '')::uuid $f$;
create type public.notification_kind as enum ('message');
create type public.deal_stage as enum ('lead', 'won', 'lost');
create type public.finance_account as enum ('client_revenue', 'fixed_cost');
create type public.briefing_status as enum ('preparing', 'not_started', 'in_progress', 'submitted', 'immersion_done', 'document_sent', 'validated');
create table public.profiles (id uuid primary key);
create table public.clients (id uuid primary key, name text not null, active boolean not null default true, owner_id uuid references public.profiles (id));
create table public.client_members (client_id uuid not null references public.clients (id), user_id uuid not null, created_at timestamptz not null default now());
create table public.deals (id uuid primary key default gen_random_uuid(), client_id uuid, stage public.deal_stage not null, closed_on date, updated_at timestamptz not null default now());
create table public.finance_entries (id uuid primary key default gen_random_uuid(), client_id uuid, account public.finance_account not null, paid_on date, skipped boolean not null default false);
create table public.finance_recurrences (id uuid primary key default gen_random_uuid(), client_id uuid, account public.finance_account not null, ends_on date);
create table public.client_briefings (client_id uuid primary key, status public.briefing_status not null, released_at timestamptz not null default now(),
  submitted_at timestamptz, immersion_at timestamptz, updated_at timestamptz not null default now());
create table public.social_accounts (client_id uuid not null, network text not null, status text not null, connected_at timestamptz not null default now());
create table public.content_posts (id uuid primary key default gen_random_uuid(), client_id uuid not null, published_at timestamptz);
create table public.client_reviews (client_id uuid not null, period date not null, done boolean not null default false);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, kind public.notification_kind not null,
  actor_name text, client_id uuid, title text, body text, link text not null check (link ~ '^/[^/\\\\]'),
  created_at timestamptz not null default now()
);
create function private.is_team_member() returns boolean language sql stable security definer set search_path = '' as $f$
  select exists (select 1 from public.profiles where id = (select auth.uid()))
$f$;
create function private.my_client_ids() returns setof uuid language sql stable security definer set search_path = '' as $f$
  select m.client_id from public.client_members m where m.user_id = (select auth.uid())
$f$;
`

// Depois da migration: as permissões que o Supabase dá às tabelas novas.
const GRANTS = `
grant usage on schema public, private, auth to authenticated, anon;
grant select, insert, update on all tables in schema public to authenticated;
grant execute on all functions in schema auth to authenticated;
`

const OWNER = "55555555-5555-4555-8555-555555555555"
const TEAMMATE = "66666666-6666-4666-8666-666666666666"
const MEMBER = "33333333-3333-4333-8333-333333333333"
const OTHER_MEMBER = "44444444-4444-4444-8444-444444444444"

// Clientes de exemplo, cada um numa situação.
const A = "a0000000-0000-4000-8000-000000000001" // social, Entrada, com responsável
const B = "b0000000-0000-4000-8000-000000000002" // social, Ongoing, contrato acabando, sem responsável
const C = "c0000000-0000-4000-8000-000000000003" // tráfego, Onboarding
const D = "d0000000-0000-4000-8000-000000000004" // inativo
const E = "e0000000-0000-4000-8000-000000000005" // social, Ongoing começado no meio do mês

const J = {
  A: "a1000000-0000-4000-8000-000000000001",
  B: "b1000000-0000-4000-8000-000000000002",
  C: "c1000000-0000-4000-8000-000000000003",
  D: "d1000000-0000-4000-8000-000000000004",
  E: "e1000000-0000-4000-8000-000000000005",
}

const skip = !server

before(() => {
  if (skip) return
  psql(`create database ${database}`, { db: "postgres" })
  psql(BOOTSTRAP)
  for (const migration of migrations) psql(readFileSync(migration, "utf8"), { singleTransaction: true })
  psql(GRANTS)
  psql(`
    insert into public.profiles values ('${OWNER}'), ('${TEAMMATE}');
    insert into public.clients (id, name, active, owner_id) values
      ('${A}', 'Alfa', true, '${OWNER}'), ('${B}', 'Beta', true, null), ('${C}', 'Gama', true, '${OWNER}'),
      ('${D}', 'Delta', false, null), ('${E}', 'Épsilon', true, '${TEAMMATE}');
    insert into public.client_members (client_id, user_id) values ('${A}', '${MEMBER}'), ('${C}', '${OTHER_MEMBER}');
    insert into public.deals (client_id, stage, closed_on) values ('${A}', 'won', '2026-11-02');
    insert into public.finance_recurrences (client_id, account, ends_on) values ('${B}', 'client_revenue', '2026-12-01');
    insert into public.client_reviews (client_id, period, done) values ('${B}', '2026-11-01', true), ('${E}', '2026-11-01', true);
    insert into public.client_journeys (id, client_id, line, phase, mode, phase_started_on, started_on, contract_ends_on) values
      ('${J.A}', '${A}', 'social', 'entry', 'full', '2026-11-02', '2026-11-02', null),
      ('${J.B}', '${B}', 'social', 'ongoing', 'full', '2026-09-01', '2026-06-01', null),
      ('${J.C}', '${C}', 'traffic', 'onboarding', 'full', '2026-11-06', '2026-11-02', null),
      ('${J.D}', '${D}', 'social', 'entry', 'full', '2026-10-01', '2026-10-01', null),
      ('${J.E}', '${E}', 'social', 'ongoing', 'compact', '2026-11-05', '2026-10-01', null);
  `)
})

after(() => {
  if (skip) return
  psql(`drop database if exists ${database} with (force)`, { db: "postgres" })
})

test("a cópia do catálogo no banco é igual à do código", { skip }, () => {
  const rows = JSON.parse(
    psql(`select coalesce(json_agg(row_to_json(s) order by s.line, s.phase, s.position), '[]') from private.journey_steps s`)
  )
  for (const def of Object.values(JOURNEY_CATALOG)) {
    for (const phase of def.phases) {
      const dbSteps = rows.filter((row) => row.line === def.line && row.phase === phase.phase)
      assert.deepEqual(
        dbSteps.map((row) => row.step_key),
        phase.steps.map((step) => step.key),
        `ordem das etapas: ${def.line}/${phase.phase}`
      )
      phase.steps.forEach((step, index) => {
        const row = dbSteps[index]
        const target = step.target
        assert.deepEqual(
          {
            name: row.name,
            actor: row.actor,
            gate: row.gate,
            auto: row.auto,
            kind: row.target_kind,
            full: row.target_full,
            compact: row.target_compact,
            quarterly: row.quarterly,
          },
          {
            name: step.name,
            actor: step.actor,
            gate: Boolean(step.gate),
            auto: step.auto ?? null,
            kind: target.kind,
            full: target.kind === "business_days" ? target.full : target.day,
            compact: target.kind === "business_days" ? target.compact : target.day,
            quarterly: Boolean(step.quarterly),
          },
          `${def.line}/${step.key}`
        )
      })
    }
  }
  const total = Object.values(JOURNEY_CATALOG).reduce((sum, def) => sum + def.phases.reduce((n, phase) => n + phase.steps.length, 0), 0)
  assert.equal(rows.length, total)
})

test("a migration não tem palavras que travam a ferramenta do Supabase", { skip }, () => {
  for (const migration of migrations) {
    assert.doesNotMatch(readFileSync(migration, "utf8"), /\b(drop|delete|truncate)\b/i, migration.pathname)
  }
})

test("só a equipe lê e grava a jornada", { skip }, () => {
  assert.equal(as(OWNER, "select count(*) from public.client_journeys"), "5")
  assert.equal(as(MEMBER, "select count(*) from public.client_journeys"), "0")
  assert.equal(as(MEMBER, "select count(*) from public.journey_marks"), "0")
  assert.equal(as(MEMBER, "select public.team_journeys()::text"), "[]")
  assert.match(
    failsAs(MEMBER, `insert into public.client_journeys (client_id, line, phase, phase_started_on, started_on) values ('${A}', 'traffic', 'entry', '2026-11-08', '2026-11-08')`),
    /row-level security/
  )
  assert.match(
    failsAs(MEMBER, `insert into public.journey_marks (journey_id, step_key, round, state) values ('${J.A}', 'kickoff', '2026-11-02', 'done')`),
    /row-level security/
  )
  // Conta logada sem perfil da equipe não vê nada.
  assert.equal(as(null, "select count(*) from public.client_journeys"), "0")
  // A cópia do catálogo e os avisos ficam fora da API.
  assert.match(failsAs(OWNER, "select count(*) from private.journey_steps"), /permission denied/)
  assert.match(failsAs(OWNER, "select count(*) from private.journey_notices"), /permission denied/)
})

test("criar e marcar: o cliente existe, quem e quando são do banco, portão não pula", { skip }, () => {
  assert.match(
    failsAs(OWNER, `insert into public.client_journeys (client_id, line, phase, phase_started_on, started_on) values (gen_random_uuid(), 'social', 'entry', '2026-11-08', '2026-11-08')`),
    /client_not_found/
  )
  as(TEAMMATE, `insert into public.client_journeys (id, client_id, line, phase, phase_started_on, started_on) values ('f1000000-0000-4000-8000-000000000006', '${E}', 'traffic', 'entry', '2026-11-08', '2026-11-08')`)
  assert.equal(psql(`select created_by from public.client_journeys where id = 'f1000000-0000-4000-8000-000000000006'`), TEAMMATE)
  assert.match(
    failsAs(OWNER, `insert into public.client_journeys (client_id, line, phase, phase_started_on, started_on) values ('${E}', 'traffic', 'entry', '2026-11-08', '2026-11-08')`),
    /duplicate key/
  )
  assert.match(failsAs(OWNER, `update public.client_journeys set line = 'social' where id = 'f1000000-0000-4000-8000-000000000006'`), /journey_fixed/)

  as(OWNER, `insert into public.journey_marks (journey_id, step_key, round, state, marked_by, marked_at) values ('${J.A}', 'kickoff', '2026-11-02', 'not_applicable', '${TEAMMATE}', '2020-01-01')`)
  assert.equal(psql(`select marked_by || ' ' || (marked_at > now() - interval '1 minute') from public.journey_marks where journey_id = '${J.A}' and step_key = 'kickoff'`), `${OWNER} true`)
  assert.match(
    failsAs(OWNER, `insert into public.journey_marks (journey_id, step_key, round, state) values ('${J.A}', 'contract_signed', '2026-11-02', 'not_applicable')`),
    /gate_required/
  )
  // Etapa de outra linha (o Instagram é só do social).
  assert.match(
    failsAs(OWNER, `insert into public.journey_marks (journey_id, step_key, round, state) values ('${J.C}', 'instagram_connected', '2026-11-06', 'done')`),
    /unknown_step/
  )
  assert.match(failsAs(OWNER, `update public.journey_marks set round = '2026-11-03' where journey_id = '${J.A}'`), /mark_fixed/)
  // Volta ao que era: o kickoff fica pendente para os testes de baixo.
  as(OWNER, `update public.journey_marks set state = 'open' where journey_id = '${J.A}' and step_key = 'kickoff'`)
})

test("o portal lê só a versão resumida da própria jornada", { skip }, () => {
  const mine = JSON.parse(as(MEMBER, `select public.portal_journey('${A}')::text`))
  assert.equal(mine.length, 1)
  assert.equal(mine[0].line, "social")
  assert.equal(mine[0].phase, "entry")
  assert.deepEqual(Object.keys(mine[0].marks[0]).sort(), ["round", "state", "step_key"])
  assert.equal(mine[0].facts.deal_won, "2026-11-02")
  assert.equal(as(OTHER_MEMBER, `select public.portal_journey('${A}')::text`), "[]")
  assert.equal(as(MEMBER, `select public.portal_journey('${D}')::text`), "[]")
})

/** As etapas que faltam e a etapa atual pelo código, com os dados que o banco devolve à equipe. */
function fromCode(today) {
  const records = JSON.parse(as(OWNER, "select public.team_journeys()::text")).map((row) => ({
    ...row,
    marks: row.marks,
    facts: logic.parseFacts(row.facts),
  }))
  const active = records.filter((record) => record.ended_on === null && record.client_id !== D)
  return Object.fromEntries(
    active.map((record) => {
      const status = logic.evaluateJourney(record, today)
      return [record.id, status.pending.map((step) => `${step.step.key}@${step.due}`)]
    })
  )
}

function fromDatabase(today) {
  const rows = psql(
    `select journey_id || '|' || step_key || '@' || due_on from private.journey_pending_steps('${today}') order by journey_id, step_position`
  )
  const result = {}
  for (const line of rows ? rows.split("\n") : []) {
    const [journey, step] = line.split("|")
    ;(result[journey] ??= []).push(step)
  }
  return result
}

test("as etapas que faltam e os prazos do banco são os mesmos do código", { skip }, () => {
  as(OWNER, `
    insert into public.journey_marks (journey_id, step_key, round, state) values
      ('${J.B}', 'month_numbers', '2026-11', 'done'),
      ('${J.B}', 'next_themes', '2026-11', 'done'),
      ('${J.C}', 'ads_access', '2026-11-06', 'not_applicable'),
      ('${J.E}', 'monthly_report', '2026-11', 'open');
  `)
  for (const today of ["2026-11-09", "2026-11-20", "2026-12-02"]) {
    const code = fromCode(today)
    const db = fromDatabase(today)
    for (const id of Object.keys(code)) {
      assert.deepEqual(db[id] ?? [], code[id], `${today}: jornada ${id}`)
    }
    // O cliente inativo fica fora do job.
    assert.equal(db[J.D], undefined)
  }

  const nov9 = fromCode("2026-11-09")
  // Alfa, Entrada: negócio ganho e responsável (automáticos) feitos; o contrato é a etapa atual.
  assert.equal(nov9[J.A][0], "contract_signed@2026-11-04")
  assert.ok(!nov9[J.A].some((step) => step.startsWith("deal_won") || step.startsWith("owner_defined")))
  // Beta, Ongoing de novembro: a revisão do mês marca o relatório sozinha.
  assert.ok(!nov9[J.B].some((step) => step.startsWith("monthly_report")))
  assert.equal(nov9[J.B][0], "themes_approval@2026-11-07")
  // Épsilon começou o ongoing no dia 5: o que vencia antes não conta; o relatório foi reaberto à mão.
  assert.equal(nov9[J.E][0], "themes_approval@2026-11-07")
  assert.ok(nov9[J.E].includes("monthly_report@2026-11-13"))
  // Dezembro tem a reunião trimestral.
  assert.ok(fromCode("2026-12-02")[J.B].includes("quarterly_meeting@2026-12-28"))
})

test("os avisos do job saem uma vez, para quem cuida do cliente", { skip }, () => {
  assert.equal(psql(`select private.notify_journey_alerts('2026-11-09')`), "5")
  assert.equal(psql(`select private.notify_journey_alerts('2026-11-09')`), "0")
  const notices = psql(`
    select k.name || '|' || n.user_id || '|' || n.title || '|' || n.body
      from public.notifications n join public.clients k on k.id = n.client_id
     where n.kind = 'journey_alert' order by k.name, n.title, n.user_id
  `).split("\n")
  assert.deepEqual(notices, [
    `Alfa|${OWNER}|Acessos e materiais|Social · sem chegar em 3 dias úteis (prazo 05/11): o onboarding atrasa junto`,
    `Alfa|${OWNER}|Contrato assinado|Social · passou do prazo de 04/11 · com o cliente`,
    // Sem responsável, a equipe toda. O contrato (fim da recorrência: 31/12) ainda não está a 30 dias.
    `Beta|${OWNER}|Cliente aprova os temas|Social · passou do prazo de 07/11 · com o cliente`,
    `Beta|${TEAMMATE}|Cliente aprova os temas|Social · passou do prazo de 07/11 · com o cliente`,
    `Épsilon|${TEAMMATE}|Cliente aprova os temas|Social · passou do prazo de 07/11 · com o cliente`,
    // A jornada de tráfego criada no teste de cima: sem negócio ganho.
    `Épsilon|${TEAMMATE}|Negócio ganho|Tráfego · passou do prazo de 08/11 · com a Boop`,
  ])
  assert.equal(psql(`select count(*) from private.journey_notices`), "5")
  assert.match(psql(`select link from public.notifications where client_id = '${A}' limit 1`), new RegExp(`^/clientes/${A}$`))

  // O fim do contrato: 30 dias antes avisa (uma vez).
  assert.equal(psql(`select private.notify_journey_alerts('2026-12-02')`), "3")
  assert.equal(
    psql(`select count(*) from public.notifications where kind = 'journey_alert' and title = 'Fim do contrato' and client_id = '${B}'`),
    "2"
  )
  assert.equal(psql(`select private.notify_journey_alerts('2026-12-03')`), "0")
  assert.equal(psql(`select command from cron.jobs where name = 'journey-alerts'`), "select private.notify_journey_alerts()")
})
