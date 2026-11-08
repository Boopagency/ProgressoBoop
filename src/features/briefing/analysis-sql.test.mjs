// Testa a fila da análise do briefing (migration 20261108210000_briefing_analysis)
// num Postgres descartável, como os outros testes de SQL do briefing. Precisa do
// psql e de um servidor local onde se possa criar um banco (nunca o Supabase):
//   BRIEFING_SQL_TEST_DB="host=/var/run/postgresql port=5432 user=postgres" \
//     node --test src/features/briefing/analysis-sql.test.mjs
// Sem a variável, o teste é pulado. Cria o banco `briefing_analysis_test_<pid>`
// com o mínimo do schema, roda a migration da transcrição (#110) e a nova, e
// apaga o banco no fim.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { after, before, test } from "node:test"

const server = process.env.BRIEFING_SQL_TEST_DB
const database = `briefing_analysis_test_${process.pid}`
const migrations = [
  new URL("../../../supabase/migrations/20261108155416_briefing_transcription.sql", import.meta.url),
  new URL("../../../supabase/migrations/20261108210000_briefing_analysis.sql", import.meta.url),
]

function psql(sql, { db = database } = {}) {
  const args = [`${server} dbname=${db}`, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-At"]
  return execFileSync("psql", args, { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()
}

const json = (sql) => JSON.parse(psql(`select coalesce(json_agg(t), '[]') from (${sql}) t;`) || "[]")
const one = (sql) => json(sql)[0]
const as = ({ team = false, user = "" }, sql) =>
  `set test.team = '${team ? "on" : "off"}'; set test.uid = '${user}'; ${sql}`
function fails(sql, pattern) {
  assert.throws(() => psql(sql), (error) => pattern.test(String(error.stderr)))
}

const SECRET = "segredo-de-teste"
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const TEMPLATE = "11111111-1111-4111-8111-111111111111"
const BLOCK = "22222222-2222-4222-8222-222222222222"
const BRIEFING = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const MEMBER = "99999999-9999-4999-8999-999999999999"
const Q = (n) => `33333333-3333-4333-8333-00000000000${n}`
const A = (n) => `44444444-4444-4444-8444-00000000000${n}`
const AUDIO = "eeeeeeee-eeee-4eee-8eee-000000000001"

const BOOTSTRAP = `
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;
create schema private;
create schema cron;
create schema vault;
create schema net;
create schema auth;
create function auth.uid() returns uuid language sql stable as $f$ select nullif(current_setting('test.uid', true), '')::uuid $f$;
create table cron.jobs (name text, schedule text, command text);
create function cron.schedule(text, text, text) returns bigint language sql as $f$ insert into cron.jobs values ($1, $2, $3); select 1::bigint $f$;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
insert into vault.decrypted_secrets values ('briefing_jobs_secret', '${SECRET}');
create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds integer) returns bigint
  language sql as $f$ select 1::bigint $f$;
create function private.is_team_member() returns boolean language sql stable as $f$ select current_setting('test.team', true) = 'on' $f$;
create function private.is_oauth_client() returns boolean language sql stable as $f$ select false $f$;
create function private.touch_updated_at() returns trigger language plpgsql as $f$ begin new.updated_at := now(); return new; end $f$;
create function private.my_open_briefing_ids() returns setof uuid language sql stable as $f$ select null::uuid where false $f$;

create type public.briefing_ai_status as enum ('pending', 'processing', 'ready', 'failed');
create table public.clients (id uuid primary key, name text not null);
create table public.profiles (id uuid primary key);
create table public.briefing_blocks (id uuid primary key, template_id uuid not null, position integer not null, title text not null,
  description text, estimated_minutes integer, active boolean not null default true);
create table public.briefing_questions (id uuid primary key, block_id uuid not null references public.briefing_blocks (id),
  position integer not null, key text, text text not null, hint text, kind text not null, options jsonb not null default '{}',
  required boolean not null default false, active boolean not null default true, created_at timestamptz not null default now());
create table public.client_briefings (id uuid primary key, client_id uuid not null references public.clients (id),
  template_id uuid not null, status text not null default 'in_progress', identification jsonb not null default '{}',
  submitted_at timestamptz);
create table public.briefing_answers (
  id uuid primary key, briefing_id uuid not null references public.client_briefings (id) on delete cascade,
  question_id uuid not null references public.briefing_questions (id),
  question_snapshot jsonb not null default '{}', text text, value jsonb, files jsonb not null default '[]',
  skipped boolean not null default false, filled_by_team boolean not null default false, team_filled_at timestamptz,
  answered_by uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.briefing_answer_audios (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.briefing_answers (id) on delete cascade,
  briefing_id uuid not null references public.client_briefings (id) on delete cascade,
  storage_path text not null unique default gen_random_uuid()::text,
  mime_type text not null default 'audio/webm', duration_ms integer not null default 60000,
  created_at timestamptz not null default now()
);
create table public.briefing_transcriptions (
  audio_id uuid primary key references public.briefing_answer_audios (id) on delete cascade,
  status public.briefing_ai_status not null default 'pending', attempts integer not null default 0,
  transcript text, model text, error text, started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.briefing_summaries (
  answer_id uuid primary key references public.briefing_answers (id) on delete cascade,
  status public.briefing_ai_status not null default 'pending', attempts integer not null default 0,
  summary text, model text, source_hash text, error text, started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create trigger touch_updated_at before update on public.briefing_transcriptions for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.briefing_summaries for each row execute function private.touch_updated_at();
create function private.queue_briefing_transcription() returns trigger language plpgsql security definer set search_path = '' as $f$
begin
  insert into public.briefing_transcriptions (audio_id) values (new.id) on conflict do nothing;
  return new;
end $f$;
create trigger queue_briefing_transcription after insert on public.briefing_answer_audios
  for each row execute function private.queue_briefing_transcription();

-- Iguais às da migration base.
create function private.briefing_answer_filled(target_answer uuid) returns boolean language sql stable security definer set search_path = '' as $f$
  select exists (
    select 1 from public.briefing_answers a
     where a.id = target_answer and not a.skipped
       and (nullif(trim(coalesce(a.text, '')), '') is not null
            or (a.value is not null and a.value not in ('null'::jsonb, '{}'::jsonb, '[]'::jsonb, '""'::jsonb))
            or jsonb_array_length(a.files) > 0
            or exists (select 1 from public.briefing_answer_audios au where au.answer_id = a.id))
  ) $f$;
create function private.briefing_missing_required(target_briefing uuid, target_block uuid default null)
returns setof uuid language sql stable security definer set search_path = '' as $f$
  select q.id
    from public.client_briefings b
    join public.briefing_blocks bl on bl.template_id = b.template_id and bl.active
    join public.briefing_questions q on q.block_id = bl.id and q.active and q.required
    left join public.briefing_answers a on a.briefing_id = b.id and a.question_id = q.id
   where b.id = target_briefing and (target_block is null or bl.id = target_block)
     and (a.id is null or not private.briefing_answer_filled(a.id))
   order by bl.position, q.position $f$;
`

// Cinco perguntas obrigatórias (60% = 3 respondidas) e uma opcional.
const SEED = `
insert into public.clients values ('${CLIENT}', 'Doceria Flor de Açúcar');
insert into public.briefing_blocks (id, template_id, position, title) values ('${BLOCK}', '${TEMPLATE}', 1, 'Sua marca');
insert into public.briefing_questions (id, block_id, position, text, kind, required) values
  ('${Q(1)}', '${BLOCK}', 1, 'O que a marca vende?', 'audio', true),
  ('${Q(2)}', '${BLOCK}', 2, 'Para quem?', 'audio', true),
  ('${Q(3)}', '${BLOCK}', 3, 'Faixa de preço', 'choice', true),
  ('${Q(4)}', '${BLOCK}', 4, 'Principal objeção', 'audio', true),
  ('${Q(5)}', '${BLOCK}', 5, 'Concorrentes', 'links', true),
  ('${Q(6)}', '${BLOCK}', 6, 'Algo mais?', 'audio', false);
insert into public.client_briefings (id, client_id, template_id, status, identification)
values ('${BRIEFING}', '${CLIENT}', '${TEMPLATE}', 'in_progress', '{"brand_name": "Flor de Açúcar"}');
`

const skip = !server && "defina BRIEFING_SQL_TEST_DB para rodar"

before(() => {
  if (skip) return
  psql(`create database ${database};`, { db: "postgres" })
  psql(BOOTSTRAP)
  for (const file of migrations) psql(readFileSync(file, "utf8"))
  // O que o Supabase dá ao papel da API; o RLS decide o resto.
  psql(`grant usage on schema public, private to authenticated;
        grant select on all tables in schema public to authenticated;`)
  psql(SEED)
})

after(() => {
  if (skip) return
  psql(`drop database if exists ${database} with (force);`, { db: "postgres" })
})

const analysis = () =>
  one(`select status, attempts, origin, requested_by, source_hash, error, content from public.briefing_analyses where briefing_id = '${BRIEFING}'`)
const due = (secret = SECRET) => json(`select * from public.briefing_analyses_due('${secret}', 2)`)
const request = (who = { team: true, user: MEMBER }) => psql(as(who, `select public.request_briefing_analysis('${BRIEFING}');`))
const answer = (n, column = "text", value = `'Resposta ${n}'`) =>
  psql(`insert into public.briefing_answers (id, briefing_id, question_id, ${column}) values ('${A(n)}', '${BRIEFING}', '${Q(n)}', ${value});`)
/** Quantas análises a pessoa logada vê pela API (com o RLS). */
const visible = (team) =>
  psql(`set role authenticated; set test.team = '${team ? "on" : "off"}'; select count(*) from public.briefing_analyses;`)
const age = (minutes) =>
  psql(`set session_replication_role = replica;
        update public.briefing_analyses set updated_at = now() - interval '${minutes} minutes',
          started_at = now() - interval '${minutes} minutes', requested_at = now() - interval '${minutes} minutes';`)

test("a migration não tem palavras que travam a ferramenta do Supabase", () => {
  const text = readFileSync(migrations[1], "utf8")
  assert.doesNotMatch(text, /delete|drop|truncate/i)
})

test("o cliente e quem não é da equipe não pedem a análise", { skip }, () => {
  fails(as({ team: false }, `select public.request_briefing_analysis('${BRIEFING}');`), /not_allowed/)
  fails(as({ team: true }, `select public.request_briefing_analysis(gen_random_uuid());`), /briefing_not_found/)
  assert.equal(psql(`select has_table_privilege('authenticated', 'public.briefing_analyses', 'insert');`), "f")
  assert.equal(psql(`select has_table_privilege('authenticated', 'public.briefing_analyses', 'update');`), "f")
})

test("antes do envio, só com 60% das obrigatórias respondidas", { skip }, () => {
  answer(1)
  answer(2)
  answer(6)
  fails(as({ team: true }, `select public.request_briefing_analysis('${BRIEFING}');`), /not_enough_answers/)
  // Pulada não conta.
  psql(`insert into public.briefing_answers (id, briefing_id, question_id, skipped) values ('${A(4)}', '${BRIEFING}', '${Q(4)}', true);`)
  fails(as({ team: true }, `select public.request_briefing_analysis('${BRIEFING}');`), /not_enough_answers/)
  answer(3, "value", `'{"choice": "premium"}'`)
  request()
  assert.deepEqual(analysis(), {
    status: "pending",
    attempts: 0,
    origin: "manual",
    requested_by: MEMBER,
    source_hash: null,
    error: null,
    content: null,
  })
  assert.equal(psql(`select private.briefing_has_work();`), "t")
})

test("espera as transcrições e os resumos do briefing terminarem", { skip }, () => {
  psql(`insert into public.briefing_answer_audios (id, answer_id, briefing_id) values ('${AUDIO}', '${A(1)}', '${BRIEFING}');
        insert into private.briefing_audio_sources values ('${AUDIO}', 'https://x.test/a', now() + interval '1 day');`)
  assert.equal(one(`select status from public.briefing_summaries where answer_id = '${A(1)}'`).status, "pending")
  fails(`select * from public.briefing_analyses_due('errado', 2);`, /Não autorizado/)
  assert.deepEqual(due(), [], "a transcrição e o resumo ainda estão pendentes")
  psql(`update public.briefing_transcriptions set status = 'ready', transcript = 'Bolos de festa sob encomenda.' where audio_id = '${AUDIO}';`)
  assert.deepEqual(due(), [], "o resumo ainda está pendente")
  psql(`update public.briefing_summaries set status = 'failed', attempts = 3 where answer_id = '${A(1)}';`)

  const rows = due()
  assert.equal(rows.length, 1)
  const [row] = rows
  assert.equal(row.briefing_id, BRIEFING)
  assert.equal(row.attempts, 1)
  assert.equal(row.client_name, "Doceria Flor de Açúcar")
  assert.deepEqual(row.identification, { brand_name: "Flor de Açúcar" })
  assert.equal(row.status, "in_progress")
  assert.equal(row.blocks.length, 1)
  assert.deepEqual(row.questions.map((q) => q.text), ["O que a marca vende?", "Para quem?", "Faixa de preço", "Principal objeção", "Concorrentes", "Algo mais?"])
  const first = row.answers.find((a) => a.id === A(1))
  assert.deepEqual(first.audios.map((au) => [au.status, au.transcript]), [["ready", "Bolos de festa sob encomenda."]])
  assert.deepEqual(first.summary, { status: "failed", summary: null })
  assert.equal(row.answers.find((a) => a.id === A(4)).skipped, true)
  assert.equal(analysis().status, "processing")
  assert.deepEqual(due(), [], "a mesma análise não sai duas vezes")
  // Em andamento: pedir de novo não faz nada.
  request()
  assert.equal(analysis().status, "processing")
})

test("pronta: grava o conteúdo e a marca; resultado atrasado não grava", { skip }, () => {
  fails(`select public.briefing_analysis_done('${SECRET}', '${BRIEFING}', '[]', 'm', 'h');`, /invalid_content/)
  assert.equal(psql(`select public.briefing_analysis_done('${SECRET}', '${BRIEFING}', '{"key_points": ["a"]}', 'claude-opus-5-5', 'h1');`), "t")
  const row = analysis()
  assert.equal(row.status, "ready")
  assert.equal(row.source_hash, "h1")
  assert.deepEqual(row.content, { key_points: ["a"] })
  assert.equal(visible(true), "1", "a equipe vê")
  assert.equal(visible(false), "0", "o cliente não vê")
  assert.equal(psql(`select public.briefing_analysis_done('${SECRET}', '${BRIEFING}', '{"key_points": ["b"]}', 'm', 'h2');`), "f")
  assert.equal(psql(`select private.briefing_has_work();`), "f")
})

test("enviar o briefing põe a análise na fila de novo", { skip }, () => {
  psql(`update public.client_briefings set status = 'submitted', submitted_at = now() where id = '${BRIEFING}';`)
  const row = analysis()
  assert.equal(row.status, "pending")
  assert.equal(row.origin, "submitted")
  assert.equal(row.requested_by, null)
  assert.deepEqual(row.content, { key_points: ["a"] }, "a anterior fica até a nova sair")
  // Voltar um passo (imersão → enviado) não refaz.
  psql(`update public.briefing_analyses set status = 'ready';
        update public.client_briefings set status = 'immersion_done' where id = '${BRIEFING}';
        update public.client_briefings set status = 'submitted' where id = '${BRIEFING}';`)
  assert.equal(analysis().status, "ready")
  // Depois do envio, a equipe refaz sem o corte de 60%.
  request()
  assert.equal(analysis().status, "pending")
})

test("falhou: espera e tenta de novo; adiar não gasta tentativa; recusa desiste", { skip }, () => {
  assert.equal(due().length, 1)
  fails(`select public.briefing_analysis_failed('${SECRET}', '${BRIEFING}', 'x', 'talvez');`, /invalid_outcome/)
  psql(`select public.briefing_analysis_failed('${SECRET}', '${BRIEFING}', 'A Anthropic respondeu 529.', 'retry');`)
  assert.equal(analysis().status, "failed")
  assert.deepEqual(due(), [], "espera 1 minuto por tentativa")
  age(2)
  assert.equal(due()[0].attempts, 2)
  psql(`select public.briefing_analysis_failed('${SECRET}', '${BRIEFING}', 'Chave recusada.', 'defer');`)
  assert.deepEqual([analysis().status, analysis().attempts], ["pending", 1])
  due()
  psql(`select public.briefing_analysis_failed('${SECRET}', '${BRIEFING}', 'O modelo recusou analisar este briefing.', 'final');`)
  assert.deepEqual([analysis().status, analysis().attempts], ["failed", 3])
  age(60)
  assert.deepEqual(due(), [], "desistiu: só volta pelo botão")
  request()
  assert.deepEqual([analysis().status, analysis().attempts], ["pending", 0])
})

test("interrompida (mais de 10 minutos) volta; IA travada não segura mais de 15", { skip }, () => {
  due()
  age(5)
  assert.deepEqual(due(), [])
  assert.equal(psql(`select private.briefing_has_work();`), "f")
  age(11)
  assert.equal(psql(`select private.briefing_has_work();`), "t")
  assert.equal(due()[0].attempts, 2)

  psql(`select public.briefing_analysis_failed('${SECRET}', '${BRIEFING}', 'x', 'defer');`)
  psql(`update public.briefing_summaries set status = 'pending', attempts = 0 where answer_id = '${A(1)}';`)
  assert.deepEqual(due(), [], "resumo pendente segura")
  age(16)
  assert.equal(due().length, 1, "depois de 15 minutos segue com o que há")
})

test("briefing que saiu: a análise fica sem conteúdo e ninguém a vê", { skip }, () => {
  psql(`select public.briefing_analysis_done('${SECRET}', '${BRIEFING}', '{"key_points": ["x"]}', 'm', 'h');`)
  psql(`set session_replication_role = replica; update public.client_briefings set id = gen_random_uuid() where id = '${BRIEFING}';`)
  due()
  const row = analysis()
  assert.equal(row.content, null)
  assert.equal(row.status, "failed")
  assert.equal(psql(`select private.briefing_analysis_ready('${BRIEFING}');`), "f")
  assert.equal(visible(true), "0", "nem a equipe vê")
})
