// Testa as migrations do briefing (20261107200007_briefing e as que vêm
// depois, como a do preparo: 20261108033945_briefing_prepare) num Postgres
// descartável: formulário v1, RLS do cliente e da equipe, cópia da pergunta,
// áudios no Storage, envio só com os obrigatórios, avisos e o bloqueio das
// aprovações. Precisa do psql e de um servidor local onde se possa criar um
// banco (nunca o Supabase):
//   BRIEFING_SQL_TEST_DB="host=/var/run/postgresql port=5432 user=postgres" \
//     node --test src/features/briefing/briefing-sql.test.mjs
// Sem a variável, o teste é pulado. Cria o banco `briefing_sql_test_<pid>`,
// com o mínimo das tabelas do app, roda as migrations (cada uma numa
// transação, como o Supabase aplica) e apaga o banco.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readdirSync, readFileSync } from "node:fs"
import { after, before, test } from "node:test"

const server = process.env.BRIEFING_SQL_TEST_DB
const database = `briefing_sql_test_${process.pid}`
const migrationsDir = new URL("../../../supabase/migrations/", import.meta.url)
const migrationNames = readdirSync(migrationsDir)
  .filter((name) => /^\d+_briefing(_[a-z_]+)?\.sql$/.test(name))
  .sort()
const migrations = migrationNames.map((name) => new URL(name, migrationsDir))

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

/** Mesmo que `as`, mas espera um erro e devolve a mensagem. */
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
create schema storage;
-- pg_cron, Vault e pg_net (transcrição e análise, #110 em diante).
create schema cron;
create schema vault;
create schema net;
create function cron.schedule(text, text, text) returns bigint language sql as $f$ select 1::bigint $f$;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds integer) returns bigint
  language sql as $f$ select 1::bigint $f$;
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('test.uid', true), '')::uuid $f$;
create table auth.users (id uuid primary key);
create table storage.buckets (id text primary key, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text, metadata jsonb, unique (bucket_id, name));
alter table storage.objects enable row level security;
create type public.notification_kind as enum ('message');
create type public.content_stage as enum ('client_review', 'approved', 'internal_review');
create type public.message_kind as enum ('text', 'approval', 'change_request');
create type public.task_status as enum ('todo', 'doing', 'done');
create type public.client_approval_result as enum ('approved', 'changes');
create table public.profiles (id uuid primary key);
create table public.clients (id uuid primary key, name text not null, active boolean not null default true, owner_id uuid references public.profiles (id));
create table public.client_members (client_id uuid not null references public.clients (id), user_id uuid not null, full_name text);
create table public.events (id uuid primary key default gen_random_uuid());
create table public.meetings (id uuid primary key default gen_random_uuid());
create table public.channels (id uuid primary key default gen_random_uuid(), client_id uuid, kind text);
create table public.content_posts (id uuid primary key, client_id uuid not null, stage public.content_stage not null);
create table public.projects (id uuid primary key, client_id uuid not null);
create table public.tasks (
  id uuid primary key, project_id uuid, title text, client_visible boolean, client_approval_required boolean,
  status public.task_status, client_approval public.client_approval_result, client_approval_note text,
  client_approval_by uuid, client_approval_at timestamptz
);
create table public.messages (
  id uuid primary key default gen_random_uuid(), channel_id uuid, post_id uuid, project_id uuid, task_id uuid,
  author_id uuid, kind public.message_kind, body text
);
create table public.notifications (
  id uuid primary key default gen_random_uuid(), user_id uuid not null, kind public.notification_kind not null,
  actor_id uuid, actor_name text, client_id uuid, title text, body text, link text not null check (link ~ '^/[^/\\\\]'),
  created_at timestamptz not null default now()
);
create function private.is_team_member() returns boolean language sql stable security definer set search_path = '' as $f$
  select exists (select 1 from public.profiles where id = (select auth.uid()))
$f$;
create function private.is_oauth_client() returns boolean language sql stable as $f$ select coalesce(current_setting('test.oauth', true), '') = 'on' $f$;
create function private.my_client_ids() returns setof uuid language sql stable security definer set search_path = '' as $f$
  select m.client_id from public.client_members m where m.user_id = (select auth.uid())
$f$;
create function private.portal_can_see_post(target uuid) returns boolean language sql stable security definer set search_path = '' as $f$
  select exists (select 1 from public.content_posts p where p.id = target and p.client_id in (select private.my_client_ids()))
$f$;
create function private.portal_can_see_project(target uuid) returns boolean language sql stable security definer set search_path = '' as $f$
  select exists (select 1 from public.projects p where p.id = target and p.client_id in (select private.my_client_ids()))
$f$;
create function private.step_awaiting_client(required boolean, visible boolean, status public.task_status, approval public.client_approval_result)
returns boolean language sql immutable as $f$ select required and visible and status = 'done' and approval is null $f$;
`

// Depois da migration: as permissões que o Supabase dá às tabelas novas.
const GRANTS = `
grant usage on schema public, private, storage, auth to authenticated, anon;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant select, insert, update, delete on storage.objects to authenticated;
grant execute on all functions in schema auth to authenticated;
`

const CLIENT = "11111111-1111-4111-8111-111111111111"
const OTHER_CLIENT = "22222222-2222-4222-8222-222222222222"
const MEMBER = "33333333-3333-4333-8333-333333333333"
const OTHER_MEMBER = "44444444-4444-4444-8444-444444444444"
const OWNER = "55555555-5555-4555-8555-555555555555"
const TEAM = "66666666-6666-4666-8666-666666666666"
const POST = "77777777-7777-4777-8777-777777777777"
const PROJECT = "88888888-8888-4888-8888-888888888888"
const STEP = "99999999-9999-4999-8999-999999999999"
const BRIEFING = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const AUDIO_FILE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"

const skip = server ? false : "defina BRIEFING_SQL_TEST_DB para rodar"

before(() => {
  if (!server) return
  psql(`create database ${database};`, { db: "postgres" })
  psql(BOOTSTRAP)
  assert.ok(migrations.length >= 2, "faltam as migrations do briefing")
  for (const migration of migrations) psql(readFileSync(migration, "utf8"), { singleTransaction: true })
  psql(GRANTS)
  psql(`
    insert into auth.users (id) values ${[OWNER, TEAM, MEMBER, OTHER_MEMBER].map((id) => `(${quote(id)})`).join(", ")};
    insert into public.profiles (id) values (${quote(OWNER)}), (${quote(TEAM)});
    insert into public.clients (id, name, owner_id) values (${quote(CLIENT)}, 'Doceria E2E', ${quote(OWNER)}), (${quote(OTHER_CLIENT)}, 'Outra E2E', null);
    insert into public.client_members (client_id, user_id, full_name) values (${quote(CLIENT)}, ${quote(MEMBER)}, 'Ana'), (${quote(OTHER_CLIENT)}, ${quote(OTHER_MEMBER)}, 'Bia');
    insert into public.channels (client_id, kind) values (${quote(CLIENT)}, 'client');
    insert into public.content_posts (id, client_id, stage) values (${quote(POST)}, ${quote(CLIENT)}, 'client_review');
    insert into public.projects (id, client_id) values (${quote(PROJECT)}, ${quote(CLIENT)});
    insert into public.tasks (id, project_id, title, client_visible, client_approval_required, status)
    values (${quote(STEP)}, ${quote(PROJECT)}, 'Logo', true, true, 'done');
  `)
})

after(() => {
  if (server && !process.env.BRIEFING_SQL_TEST_KEEP) psql(`drop database if exists ${database} with (force);`, { db: "postgres" })
})

const questionId = (key) => psql(`select id from public.briefing_questions where key = ${quote(key)}`)

test("formulário v1: 30 perguntas em 6 blocos, mais a identificação", { skip }, () => {
  assert.equal(psql(`select count(*) from public.briefing_templates where active`), "1")
  assert.equal(psql(`select string_agg(position::text || ':' || estimated_minutes, ',' order by position) from public.briefing_blocks`), "0:1,1:6,2:5,3:3,4:4,5:3,6:3")
  assert.equal(psql(`select count(*) from public.briefing_questions q join public.briefing_blocks b on b.id = q.block_id where b.position > 0`), "30")
  assert.equal(psql(`select count(*) from public.briefing_questions where hint is null or hint = ''`), "0")
  assert.equal(psql(`select jsonb_array_length(options -> 'cards') from public.briefing_questions where key = 'brand_tone'`), "8")
  assert.equal(psql(`select count(*) from public.briefing_questions where key = 'brand_tone' and not exists (select 1 from jsonb_array_elements(options -> 'cards') c where coalesce(c ->> 'example', '') = '')`), "1")
  // O bloco 6 é todo opcional; o 1 tem um opcional só (o ticket médio).
  assert.equal(psql(`select count(*) from public.briefing_questions q join public.briefing_blocks b on b.id = q.block_id where b.position = 6 and q.required`), "0")
  assert.equal(psql(`select string_agg(q.key, ',') from public.briefing_questions q join public.briefing_blocks b on b.id = q.block_id where b.position = 1 and not q.required`), "average_ticket")
})

test("equipe libera; cliente vê só o dele e o formulário dele", { skip }, () => {
  // Sem briefing: o cliente não vê o formulário nem nada travado.
  assert.equal(as(MEMBER, `select count(*) from public.briefing_questions;`), "0")
  assert.equal(psql(`select private.briefing_locked(${quote(CLIENT)})`), "f")
  // Cliente não libera o próprio briefing.
  const template = psql(`select id from public.briefing_templates where active`)
  failsAs(MEMBER, `insert into public.client_briefings (client_id, template_id, due_on) values (${quote(CLIENT)}, ${quote(template)}, '2026-11-13');`)

  as(TEAM, `insert into public.client_briefings (id, client_id, template_id, due_on, identification)
    select ${quote(BRIEFING)}, ${quote(CLIENT)}, id, '2026-11-13', '{"brand_name": "Doceria E2E"}' from public.briefing_templates where active;`)
  assert.equal(psql(`select released_by from public.client_briefings where id = ${quote(BRIEFING)}`), TEAM)
  assert.equal(psql(`select private.briefing_locked(${quote(CLIENT)})`), "t")
  assert.equal(as(MEMBER, `select count(*) from public.client_briefings;`), "1")
  assert.equal(as(MEMBER, `select count(*) from public.briefing_questions;`), "31")
  assert.equal(as(OTHER_MEMBER, `select count(*) from public.client_briefings;`), "0")
  assert.equal(as(OTHER_MEMBER, `select count(*) from public.briefing_questions;`), "0")
  // O conector do Claude não vê nada.
  assert.equal(psql(`set test.oauth = 'on'; set role authenticated; select set_config('test.uid', ${quote(TEAM)}, false); select count(*) from public.client_briefings;`).split("\n").pop(), "0")
})

test("cliente marca onde parou, mas não mexe no prazo nem envia direto", { skip }, () => {
  const offer = questionId("offer")
  as(MEMBER, `update public.client_briefings set status = 'in_progress', current_question_id = ${quote(offer)}, last_seen_at = now();`)
  assert.equal(psql(`select status || ' ' || (started_at is not null) from public.client_briefings`), "in_progress true")
  assert.match(failsAs(MEMBER, `update public.client_briefings set due_on = '2027-01-01';`), /briefing_forbidden/)
  assert.match(failsAs(MEMBER, `update public.client_briefings set status = 'submitted';`), /briefing_forbidden/)
  assert.match(failsAs(MEMBER, `update public.client_briefings set completed_block_ids = '{}'::uuid[] || gen_random_uuid();`), /briefing_forbidden/)
  // Outro cliente não muda nada (0 linhas).
  as(OTHER_MEMBER, `update public.client_briefings set last_seen_at = '2020-01-01';`)
  assert.notEqual(psql(`select last_seen_at::date from public.client_briefings`), "2020-01-01")
})

test("resposta guarda a cópia da pergunta; editar a pergunta não muda a enviada", { skip }, () => {
  const offer = questionId("offer")
  as(MEMBER, `insert into public.briefing_answers (briefing_id, question_id, text, question_snapshot, answered_by)
    values (${quote(BRIEFING)}, ${quote(offer)}, 'Bolos e doces', '{"text": "falso"}', ${quote(TEAM)});`)
  const row = JSON.parse(psql(`select json_build_object('snapshot', question_snapshot, 'by', answered_by) from public.briefing_answers where question_id = ${quote(offer)}`))
  assert.equal(row.snapshot.text, "O que você vende? Fala dos principais produtos ou serviços.")
  assert.equal(row.snapshot.kind, "audio")
  assert.equal(row.snapshot.block_title, "Negócio e prioridades")
  assert.equal(row.by, MEMBER)
  // Arquivo fora da pasta do briefing: recusado.
  assert.match(
    failsAs(MEMBER, `insert into public.briefing_answers (briefing_id, question_id, files) values (${quote(BRIEFING)}, ${quote(questionId("media"))}, '[{"path": "${OTHER_CLIENT}/x/y.png"}]');`),
    /invalid_file/
  )
  // Pergunta de outro modelo (ou inexistente): recusada.
  failsAs(MEMBER, `insert into public.briefing_answers (briefing_id, question_id) values (${quote(BRIEFING)}, gen_random_uuid());`)
  // Outro cliente não responde neste briefing.
  failsAs(OTHER_MEMBER, `insert into public.briefing_answers (briefing_id, question_id, text) values (${quote(BRIEFING)}, ${quote(questionId("brand_age"))}, 'x');`)
})

test("áudio: arquivo no Storage do cliente, tipo do Storage e transcrição pendente só para a equipe", { skip }, () => {
  const path = `${CLIENT}/${BRIEFING}/${AUDIO_FILE}`
  // Cliente envia na pasta do briefing dele; em outra, não.
  as(MEMBER, `insert into storage.objects (bucket_id, name, metadata) values ('briefing', ${quote(path)}, '{"mimetype": "audio/webm", "size": 2048}');`)
  failsAs(MEMBER, `insert into storage.objects (bucket_id, name) values ('briefing', '${OTHER_CLIENT}/${BRIEFING}/${AUDIO_FILE}');`)
  failsAs(OTHER_MEMBER, `insert into storage.objects (bucket_id, name) values ('briefing', '${CLIENT}/${BRIEFING}/x');`)
  assert.equal(as(OTHER_MEMBER, `select count(*) from storage.objects where bucket_id = 'briefing';`), "0")
  assert.equal(as(TEAM, `select count(*) from storage.objects where bucket_id = 'briefing';`), "1")

  const answer = psql(`select id from public.briefing_answers where question_id = ${quote(questionId("offer"))}`)
  as(MEMBER, `insert into public.briefing_answer_audios (answer_id, briefing_id, storage_path, duration_ms, mime_type, size_bytes)
    values (${quote(answer)}, ${quote(BRIEFING)}, ${quote(path)}, 42000, 'text/html', 1);`)
  assert.equal(psql(`select mime_type || ' ' || size_bytes || ' ' || created_by from public.briefing_answer_audios`), `audio/webm 2048 ${MEMBER}`)
  // Mais de 3 minutos (com folga) ou arquivo que não existe: recusado.
  failsAs(MEMBER, `insert into public.briefing_answer_audios (answer_id, briefing_id, storage_path, duration_ms) values (${quote(answer)}, ${quote(BRIEFING)}, '${CLIENT}/${BRIEFING}/${STEP}', 1000);`)
  failsAs(MEMBER, `insert into public.briefing_answer_audios (answer_id, briefing_id, storage_path, duration_ms) values (${quote(answer)}, ${quote(BRIEFING)}, ${quote(path)}, 200000);`)

  assert.equal(psql(`select status || ' ' || attempts from public.briefing_transcriptions`), "pending 0")
  assert.equal(as(MEMBER, `select count(*) from public.briefing_transcriptions;`), "0")
  assert.equal(as(TEAM, `select count(*) from public.briefing_transcriptions;`), "1")
  failsAs(MEMBER, `insert into public.briefing_summaries (answer_id) values (${quote(answer)});`)
  assert.equal(as(MEMBER, `select count(*) from public.briefing_answer_audios;`), "1")
})

test("bloqueio: aprovar post e etapa recusa enquanto o briefing está aberto", { skip }, () => {
  assert.match(failsAs(MEMBER, `select public.portal_review_post(${quote(POST)}, 'approve');`), /briefing_pending/)
  assert.match(failsAs(MEMBER, `select public.portal_review_step(${quote(STEP)}, 'approve');`), /briefing_pending/)
  assert.equal(psql(`select stage from public.content_posts`), "client_review")
})

test("fechar bloco confere os obrigatórios e avisa quem cuida do cliente uma vez", { skip }, () => {
  const block1 = psql(`select id from public.briefing_blocks where position = 1`)
  assert.match(failsAs(MEMBER, `select public.portal_complete_briefing_block(${quote(BRIEFING)}, ${quote(block1)});`), /required_missing/)

  const values = {
    brand_age: `value = '"1_3y"'`,
    focus_offer: `text = 'Kit festa'`,
    price_position: `value = '"average"'`,
    discovery: `value = '{"choices": ["client_referral"]}'`,
    sales_channel: `value = '"whatsapp"'`,
    goal_90d: `value = '"more_quotes"'`,
  }
  for (const [key, set] of Object.entries(values)) {
    as(MEMBER, `insert into public.briefing_answers (briefing_id, question_id) values (${quote(BRIEFING)}, ${quote(questionId(key))});
      update public.briefing_answers set ${set} where question_id = ${quote(questionId(key))};`)
  }
  // Pulada não conta como respondida.
  as(MEMBER, `insert into public.briefing_answers (briefing_id, question_id, skipped, text) values (${quote(BRIEFING)}, ${quote(questionId("why_boop"))}, true, 'x');`)
  assert.match(failsAs(MEMBER, `select public.portal_complete_briefing_block(${quote(BRIEFING)}, ${quote(block1)});`), /required_missing/)
  as(MEMBER, `update public.briefing_answers set skipped = false where question_id = ${quote(questionId("why_boop"))};`)

  assert.equal(as(MEMBER, `select public.portal_complete_briefing_block(${quote(BRIEFING)}, ${quote(block1)});`), "t")
  assert.equal(as(MEMBER, `select public.portal_complete_briefing_block(${quote(BRIEFING)}, ${quote(block1)});`), "f")
  assert.equal(
    psql(`select string_agg(user_id || ' ' || kind || ' ' || title || ' ' || body || ' ' || actor_name || ' ' || link, ';') from public.notifications`),
    `${OWNER} briefing_block_done Doceria E2E Negócio e prioridades Ana /clientes/${CLIENT}?aba=briefing`
  )
  failsAs(OTHER_MEMBER, `select public.portal_complete_briefing_block(${quote(BRIEFING)}, ${quote(block1)});`)
})

test("enviar só com os obrigatórios; depois o cliente não muda mais e o portal abre", { skip }, () => {
  assert.match(failsAs(MEMBER, `select public.portal_submit_briefing(${quote(BRIEFING)});`), /required_missing/)
  const missing = psql(`select string_agg(q.key, ',' order by b.position, q.position) from private.briefing_missing_required(${quote(BRIEFING)}) m
    join public.briefing_questions q on q.id = m join public.briefing_blocks b on b.id = q.block_id`)
  assert.equal(
    missing,
    "identification,dream_client,sale_conversation,common_questions,hesitation,chosen_story,brand_tone,challenge_level,call_to_action,approver,production,recording_frequency"
  )
  for (const key of missing.split(",")) {
    as(MEMBER, `insert into public.briefing_answers (briefing_id, question_id, value) values (${quote(BRIEFING)}, ${quote(questionId(key))}, '{"ok": true}');`)
  }
  assert.match(as(MEMBER, `select public.portal_submit_briefing(${quote(BRIEFING)});`), /^\d{4}-/)
  assert.equal(psql(`select status from public.client_briefings`), "submitted")
  assert.equal(psql(`select private.briefing_locked(${quote(CLIENT)})`), "f")
  assert.equal(psql(`select count(*) from public.notifications where kind = 'briefing_submitted' and user_id = ${quote(OWNER)}`), "1")

  // Enviado: o cliente lê, mas não grava nem apaga.
  const snapshotBefore = psql(`select question_snapshot ->> 'text' from public.briefing_answers where question_id = ${quote(questionId("offer"))}`)
  as(MEMBER, `update public.briefing_answers set text = 'mudou';`)
  assert.equal(psql(`select count(*) from public.briefing_answers where text = 'mudou'`), "0")
  as(MEMBER, `delete from public.briefing_answer_audios;`)
  assert.equal(psql(`select count(*) from public.briefing_answer_audios`), "1")
  failsAs(MEMBER, `insert into storage.objects (bucket_id, name) values ('briefing', '${CLIENT}/${BRIEFING}/novo');`)
  assert.equal(as(MEMBER, `select count(*) from storage.objects where bucket_id = 'briefing';`), "1")
  failsAs(MEMBER, `select public.portal_submit_briefing(${quote(BRIEFING)});`)

  // A equipe edita a pergunta: a resposta enviada guarda a cópia de antes.
  as(TEAM, `update public.briefing_questions set text = 'Texto novo' where key = 'offer';`)
  as(TEAM, `update public.briefing_answers set text = 'corrigido pela equipe' where question_id = ${quote(questionId("offer"))};`)
  assert.equal(psql(`select question_snapshot ->> 'text' from public.briefing_answers where question_id = ${quote(questionId("offer"))}`), snapshotBefore)
  assert.equal(psql(`select answered_by from public.briefing_answers where question_id = ${quote(questionId("offer"))}`), MEMBER)

  // Aprovar volta a funcionar.
  assert.match(as(MEMBER, `select public.portal_review_post(${quote(POST)}, 'approve');`), /^[0-9a-f-]{36}$/)

  // Formulário: nunca se apaga (sem política de delete).
  as(TEAM, `delete from public.briefing_questions where key = 'offer';`)
  assert.equal(psql(`select count(*) from public.briefing_questions where key = 'offer'`), "1")
})

// Preparar sem liberar e a equipe responder pelo cliente (20261108033945_briefing_prepare).
const PREPARED = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const LOGO_FILE = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"

test("a migration do preparo não tem drop, delete nem truncate", { skip }, () => {
  const name = migrationNames.find((item) => item.endsWith("_briefing_prepare.sql"))
  assert.ok(name, "falta a migration do preparo")
  const text = readFileSync(new URL(name, migrationsDir), "utf8")
  assert.doesNotMatch(text, /\b(drop|delete|truncate)\b/i)
})

test("preparando: o portal não trava e o cliente não vê nada", { skip }, () => {
  as(TEAM, `insert into public.client_briefings (id, client_id, template_id, due_on, status, identification)
    select ${quote(PREPARED)}, ${quote(OTHER_CLIENT)}, id, '2026-11-20', 'preparing', '{"brand_name": "Outra E2E"}' from public.briefing_templates where active;`)
  assert.equal(psql(`select private.briefing_locked(${quote(OTHER_CLIENT)})`), "f")
  assert.equal(as(OTHER_MEMBER, `select count(*) from public.client_briefings;`), "0")
  assert.equal(as(OTHER_MEMBER, `select count(*) from public.briefing_questions;`), "0")
  assert.equal(as(OTHER_MEMBER, `select count(*) from public.briefing_templates;`), "0")
  // O cliente não responde nem envia arquivo no briefing em preparação.
  failsAs(OTHER_MEMBER, `insert into public.briefing_answers (briefing_id, question_id, text) values (${quote(PREPARED)}, ${quote(questionId("offer"))}, 'x');`)
  failsAs(OTHER_MEMBER, `insert into storage.objects (bucket_id, name) values ('briefing', '${OTHER_CLIENT}/${PREPARED}/x');`)
  failsAs(OTHER_MEMBER, `select public.portal_submit_briefing(${quote(PREPARED)});`)
  // Aprovar continua aberto para esse cliente (o post é de outro cliente; aqui basta a trava).
  assert.equal(as(OTHER_MEMBER, `select count(*) from public.client_briefings where status::text = 'preparing';`), "0")
})

test("a equipe responde pelo cliente, com arquivo e paleta, e a resposta fica marcada", { skip }, () => {
  const logo = `${OTHER_CLIENT}/${PREPARED}/files/${LOGO_FILE}`
  as(TEAM, `insert into storage.objects (bucket_id, name, metadata) values ('briefing', ${quote(logo)}, '{"mimetype": "image/webp", "size": 8366}');`)
  // Fora da pasta de um briefing que existe: recusado.
  failsAs(TEAM, `insert into storage.objects (bucket_id, name) values ('briefing', '${OTHER_CLIENT}/${BRIEFING}/x');`)
  failsAs(TEAM, `insert into storage.objects (bucket_id, name) values ('briefing', 'solto.png');`)
  // O conector do Claude não envia, mesmo com a sessão da equipe.
  assert.match(
    String(
      (() => {
        try {
          psql(`set test.oauth = 'on'; set role authenticated; select set_config('test.uid', ${quote(TEAM)}, false);
            insert into storage.objects (bucket_id, name) values ('briefing', '${OTHER_CLIENT}/${PREPARED}/files/outro');`)
        } catch (error) {
          return error.stderr ?? error.message
        }
        return ""
      })()
    ),
    /row-level security/
  )

  const identity = questionId("identity")
  as(TEAM, `insert into public.briefing_answers (briefing_id, question_id, files, value, answered_by)
    values (${quote(PREPARED)}, ${quote(identity)},
      '[{"path": "${logo}", "name": "velmont-logo.webp", "mime_type": "image/webp", "size_bytes": 8366}]',
      '{"extras": {"palette": {"colors": [{"hex": "#210b12", "use": "use"}, {"hex": "#ddc5a1", "use": "use"}]}}}',
      ${quote(OTHER_MEMBER)});`)
  const row = JSON.parse(
    psql(`select json_build_object('team', filled_by_team, 'by', team_filled_by, 'at', team_filled_at is not null, 'answered', answered_by,
      'snapshot', question_snapshot ->> 'kind') from public.briefing_answers where briefing_id = ${quote(PREPARED)} and question_id = ${quote(identity)}`)
  )
  assert.deepEqual(row, { team: true, by: TEAM, at: true, answered: null, snapshot: "upload" })
  // Uma obrigatória respondida pela equipe conta como respondida.
  const before = Number(psql(`select count(*) from private.briefing_missing_required(${quote(PREPARED)})`))
  as(TEAM, `insert into public.briefing_answers (briefing_id, question_id, value) values (${quote(PREPARED)}, ${quote(questionId("brand_age"))}, '{"choice": "3_10y"}');`)
  assert.equal(Number(psql(`select count(*) from private.briefing_missing_required(${quote(PREPARED)})`)), before - 1)
  // Arquivo de outro briefing numa resposta: recusado também para a equipe.
  assert.match(
    failsAs(TEAM, `update public.briefing_answers set files = '[{"path": "${CLIENT}/${BRIEFING}/x"}]' where briefing_id = ${quote(PREPARED)} and question_id = ${quote(identity)};`),
    /invalid_file/
  )
})

test("liberar: o portal trava, o cliente vê o que a Boop preencheu e confirma", { skip }, () => {
  as(TEAM, `update public.client_briefings set status = 'not_started', released_at = now(), due_on = '2026-11-20' where id = ${quote(PREPARED)};`)
  assert.equal(psql(`select private.briefing_locked(${quote(OTHER_CLIENT)})`), "t")
  assert.equal(as(OTHER_MEMBER, `select count(*) from public.client_briefings;`), "1")
  const identity = questionId("identity")
  assert.equal(as(OTHER_MEMBER, `select filled_by_team from public.briefing_answers where question_id = ${quote(identity)};`), "t")
  // O cliente lê o logo que a equipe enviou.
  assert.equal(as(OTHER_MEMBER, `select count(*) from storage.objects where bucket_id = 'briefing';`), "1")

  // Confirmar (gravar de novo, igual) tira a marca; o histórico da equipe fica.
  as(OTHER_MEMBER, `update public.briefing_answers set skipped = false where question_id = ${quote(identity)};`)
  const row = JSON.parse(
    psql(`select json_build_object('team', filled_by_team, 'by', team_filled_by, 'answered', answered_by)
      from public.briefing_answers where briefing_id = ${quote(PREPARED)} and question_id = ${quote(identity)}`)
  )
  assert.deepEqual(row, { team: false, by: TEAM, answered: OTHER_MEMBER })
  // O cliente não finge que foi a equipe.
  as(OTHER_MEMBER, `update public.briefing_answers set filled_by_team = true, team_filled_by = ${quote(OTHER_MEMBER)} where question_id = ${quote(questionId("brand_age"))} and briefing_id = ${quote(PREPARED)};`)
  assert.equal(psql(`select filled_by_team || ' ' || team_filled_by from public.briefing_answers where briefing_id = ${quote(PREPARED)} and question_id = ${quote(questionId("brand_age"))}`), `false ${TEAM}`)

  // Depois de liberado a equipe ainda completa o que sabe.
  as(TEAM, `insert into public.briefing_answers (briefing_id, question_id, value) values (${quote(PREPARED)}, ${quote(questionId("competitors"))}, '{"links": ["@marca"]}');`)
  assert.equal(psql(`select filled_by_team from public.briefing_answers where briefing_id = ${quote(PREPARED)} and question_id = ${quote(questionId("competitors"))}`), "t")
})
