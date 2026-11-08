// Testa as funções da fila de transcrição e resumo do briefing (migration
// 20261107201500_briefing_transcription) num Postgres descartável. Precisa do
// psql e de um servidor local onde se possa criar um banco (nunca o Supabase):
//   BRIEFING_SQL_TEST_DB="host=/var/run/postgresql port=5432 user=postgres" \
//     node --test src/features/briefing/transcription-sql.test.mjs
// Sem a variável, o teste é pulado. Cria o banco `briefing_sql_test_<pid>`,
// com o mínimo das tabelas do briefing (as da migration base que a nova usa),
// roda a migration inteira e apaga o banco no fim.
import assert from "node:assert/strict"
import { execFileSync } from "node:child_process"
import { readFileSync } from "node:fs"
import { after, before, test } from "node:test"

const server = process.env.BRIEFING_SQL_TEST_DB
const database = `briefing_sql_test_${process.pid}`
const migration = new URL("../../../supabase/migrations/20261107201500_briefing_transcription.sql", import.meta.url)

function psql(sql, { db = database } = {}) {
  const args = [`${server} dbname=${db}`, "-v", "ON_ERROR_STOP=1", "-X", "-q", "-At"]
  return execFileSync("psql", args, { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] }).trim()
}

const json = (sql) => JSON.parse(psql(`select coalesce(json_agg(t), '[]') from (${sql}) t;`) || "[]")
const one = (sql) => json(sql)[0]
/** Roda como a pessoa logada: cliente de `client` ou equipe. */
const as = ({ client = "", team = false }, sql) =>
  `set test.client = '${client}'; set test.team = '${team ? "on" : "off"}'; ${sql}`
function fails(sql, pattern) {
  assert.throws(() => psql(sql), (error) => pattern.test(String(error.stderr)))
}

const SECRET = "segredo-de-teste"
const CLIENT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa"
const OTHER_CLIENT = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb"
const BRIEFING = "cccccccc-cccc-4ccc-8ccc-cccccccccccc"
const ANSWER = "dddddddd-dddd-4ddd-8ddd-dddddddddddd"
const AUDIO_1 = "eeeeeeee-eeee-4eee-8eee-000000000001"
const AUDIO_2 = "eeeeeeee-eeee-4eee-8eee-000000000002"
const PATH_1 = `${CLIENT}/${BRIEFING}/${AUDIO_1}`
const PATH_2 = `${CLIENT}/${BRIEFING}/${AUDIO_2}`
const signedUrl = (path) => `https://proj.supabase.test/storage/v1/object/sign/briefing/${path}?token=x`
const URL_OK = signedUrl(PATH_1)
const URL_2 = signedUrl(PATH_2)

// O mínimo do schema (Supabase e migration base do briefing) que a migration usa.
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
create table cron.jobs (name text, schedule text, command text);
create function cron.schedule(text, text, text) returns bigint language sql as $f$ insert into cron.jobs values ($1, $2, $3); select 1::bigint $f$;
create table vault.decrypted_secrets (name text primary key, decrypted_secret text);
create table net.calls (url text, body jsonb, headers jsonb);
create function net.http_post(url text, body jsonb, headers jsonb, timeout_milliseconds integer) returns bigint
  language sql as $f$ insert into net.calls values (url, body, headers); select 1::bigint $f$;
create function private.is_team_member() returns boolean language sql stable as $f$ select current_setting('test.team', true) = 'on' $f$;
create function private.is_oauth_client() returns boolean language sql stable as $f$ select false $f$;
create function private.touch_updated_at() returns trigger language plpgsql as $f$ begin new.updated_at := now(); return new; end $f$;

create type public.briefing_ai_status as enum ('pending', 'processing', 'ready', 'failed');
create table public.client_briefings (id uuid primary key, client_id uuid not null, status text not null default 'in_progress');
create function private.my_open_briefing_ids() returns setof uuid language sql stable as $f$
  select b.id from public.client_briefings b
   where b.client_id::text = current_setting('test.client', true) and b.status in ('not_started', 'in_progress')
$f$;
create table public.briefing_answers (
  id uuid primary key, briefing_id uuid not null references public.client_briefings (id) on delete cascade,
  question_snapshot jsonb not null default '{}', text text, skipped boolean not null default false,
  updated_at timestamptz not null default now()
);
create table public.briefing_answer_audios (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.briefing_answers (id) on delete cascade,
  briefing_id uuid not null references public.client_briefings (id) on delete cascade,
  storage_path text not null unique default ('${CLIENT}/${BRIEFING}/' || gen_random_uuid()),
  mime_type text not null default 'audio/webm', duration_ms integer not null default 180000,
  created_at timestamptz not null default now()
);
create table public.briefing_transcriptions (
  audio_id uuid primary key references public.briefing_answer_audios (id) on delete cascade,
  status public.briefing_ai_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  transcript text, model text, error text check (char_length(error) <= 2000),
  started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table public.briefing_summaries (
  answer_id uuid primary key references public.briefing_answers (id) on delete cascade,
  status public.briefing_ai_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  summary text, model text, source_hash text, error text check (char_length(error) <= 2000),
  started_at timestamptz, finished_at timestamptz,
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
`

const skip = !server && "defina BRIEFING_SQL_TEST_DB para rodar"

before(() => {
  if (skip) return
  psql(`create database ${database};`, { db: "postgres" })
  psql(BOOTSTRAP)
  psql(readFileSync(migration, "utf8"))
  psql(`
    insert into public.client_briefings (id, client_id) values ('${BRIEFING}', '${CLIENT}');
    insert into public.briefing_answers (id, briefing_id, question_snapshot)
    values ('${ANSWER}', '${BRIEFING}', '{"text": "Quem é o seu cliente ideal?", "kind": "audio", "block_title": "Público"}');
  `)
})

after(() => {
  if (skip) return
  psql(`drop database if exists ${database} with (force);`, { db: "postgres" })
})

const transcription = (audio) => one(`select status, attempts, transcript, error from public.briefing_transcriptions where audio_id = '${audio}'`)
const summary = () => one(`select status, attempts, summary, source_hash, error from public.briefing_summaries where answer_id = '${ANSWER}'`)
const sources = () => json(`select audio_id from private.briefing_audio_sources order by audio_id`).map((row) => row.audio_id)
const due = (limit = 3, secret = SECRET) => json(`select * from public.briefing_transcriptions_due('${secret}', ${limit})`)
const summariesDue = () => json(`select * from public.briefing_summaries_due('${SECRET}', 5)`)
const fail = (audio, outcome, error = "falhou") => psql(`select public.briefing_transcription_failed('${SECRET}', '${audio}', '${error}', '${outcome}');`)
/** Volta o relógio de um item (sem os triggers, que mexem no updated_at). */
const age = (table, where, minutes) =>
  psql(`set session_replication_role = replica;
        update public.${table} set updated_at = now() - interval '${minutes} minutes', started_at = now() - interval '${minutes} minutes' where ${where};`)

test("o cron fica agendado a cada minuto", { skip }, () => {
  assert.deepEqual(json(`select name, schedule, command from cron.jobs`), [
    { name: "briefing-process", schedule: "* * * * *", command: "select private.run_briefing_job()" },
  ])
})

test("pergunta aberta sem nada: sem resumo; com áudio, transcrição e resumo pendentes", { skip }, () => {
  assert.equal(summary(), undefined)
  psql(`insert into public.briefing_answer_audios (id, answer_id, briefing_id, storage_path, mime_type) values ('${AUDIO_1}', '${ANSWER}', '${BRIEFING}', '${PATH_1}', 'audio/mp4');`)
  assert.deepEqual(transcription(AUDIO_1), { status: "pending", attempts: 0, transcript: null, error: null })
  assert.equal(summary().status, "pending")
  // Sem URL na fila, não há o que fazer: o cron não chama a rota.
  assert.equal(psql(`select private.briefing_has_work();`), "f")
})

test("pôr na fila: só quem pode responder o briefing, ou a equipe", { skip }, () => {
  const queue = (url = URL_OK, expires = "now() + interval '7 days'") =>
    `select public.queue_briefing_audio('${AUDIO_1}', '${url}', ${expires});`
  fails(as({ client: OTHER_CLIENT }, queue()), /not_allowed/)
  fails(as({ client: CLIENT }, queue("http://inseguro")), /invalid_url/)
  // Só a URL assinada deste arquivo no bucket do briefing.
  fails(as({ client: CLIENT }, queue("https://evil.test/qualquer")), /invalid_url/)
  fails(as({ client: CLIENT }, queue(URL_2)), /invalid_url/)
  fails(as({ client: CLIENT }, queue(URL_OK.replace("/briefing/", "/content/"))), /invalid_url/)
  fails(as({ client: CLIENT }, queue(URL_OK, "now() - interval '1 minute'")), /invalid_url/)
  fails(as({ client: CLIENT }, `select public.queue_briefing_audio(gen_random_uuid(), '${URL_OK}', now() + interval '1 day');`), /not_found/)

  psql(`update public.client_briefings set status = 'submitted';`)
  fails(as({ client: CLIENT }, queue()), /not_allowed/)
  psql(as({ team: true }, queue()))
  psql(`update public.client_briefings set status = 'in_progress';`)
  psql(as({ client: CLIENT }, queue()))
  assert.deepEqual(sources(), [AUDIO_1])
  // A fila não é lida pela API.
  assert.equal(psql(`select has_table_privilege('authenticated', 'private.briefing_audio_sources', 'select');`), "f")
})

test("o job só chama a rota com algo pendente e com URL e segredo no Vault", { skip }, () => {
  assert.equal(psql(`select private.briefing_has_work();`), "t")
  psql(`select private.run_briefing_job();`)
  assert.equal(psql(`select count(*) from net.calls;`), "0")
  psql(`insert into vault.decrypted_secrets values ('briefing_jobs_url', 'https://app.test/api/briefing/jobs'), ('briefing_jobs_secret', '${SECRET}');`)
  psql(`select private.run_briefing_job();`)
  assert.deepEqual(json(`select url, body, headers ->> 'Authorization' as auth from net.calls`), [
    { url: "https://app.test/api/briefing/jobs", body: { job: "process" }, auth: `Bearer ${SECRET}` },
  ])
})

test("pegar as transcrições confere o segredo e trava cada item", { skip }, () => {
  fails(`select * from public.briefing_transcriptions_due('errado', 3);`, /Não autorizado/)
  fails(`select public.briefing_transcription_done('errado', '${AUDIO_1}', 'x', 'm');`, /Não autorizado/)
  const rows = due()
  assert.equal(rows.length, 1)
  assert.deepEqual(
    { ...rows[0] },
    { audio_id: AUDIO_1, storage_path: PATH_1, signed_url: URL_OK, mime_type: "audio/mp4", duration_ms: 180000, attempts: 1, question: "Quem é o seu cliente ideal?" }
  )
  assert.equal(transcription(AUDIO_1).status, "processing")
  assert.deepEqual(due(), [], "o mesmo item não sai duas vezes")
  // O resumo espera a transcrição.
  assert.deepEqual(summariesDue(), [])
})

test("falhou: espera e tenta de novo; adiar não gasta tentativa", { skip }, () => {
  fails(`select public.briefing_transcription_failed('${SECRET}', '${AUDIO_1}', 'x', 'talvez');`, /invalid_outcome/)
  fail(AUDIO_1, "retry", "A OpenAI respondeu 500.")
  assert.deepEqual(transcription(AUDIO_1), { status: "failed", attempts: 1, transcript: null, error: "A OpenAI respondeu 500." })
  assert.deepEqual(due(), [], "espera 1 minuto por tentativa")
  age("briefing_transcriptions", `audio_id = '${AUDIO_1}'`, 2)
  assert.equal(due()[0].attempts, 2)
  fail(AUDIO_1, "defer", "Chave recusada.")
  assert.deepEqual(transcription(AUDIO_1), { status: "pending", attempts: 1, transcript: null, error: "Chave recusada." })
  assert.equal(due()[0].attempts, 2)
})

test("interrompida no meio (mais de 2 minutos): volta para pendente", { skip }, () => {
  assert.deepEqual(due(), [])
  age("briefing_transcriptions", `audio_id = '${AUDIO_1}'`, 3)
  assert.equal(psql(`select private.briefing_has_work();`), "t")
  const [row] = due()
  assert.equal(row.attempts, 3)
})

test("pronta: grava, tira a URL da fila e libera o resumo", { skip }, () => {
  assert.equal(psql(`select public.briefing_transcription_done('${SECRET}', '${AUDIO_1}', 'Mães que trabalham fora.', 'gpt-4o-mini-transcribe');`), "t")
  assert.deepEqual(transcription(AUDIO_1), { status: "ready", attempts: 3, transcript: "Mães que trabalham fora.", error: null })
  assert.deepEqual(sources(), [])
  // De novo (ex.: resultado atrasado): não grava.
  assert.equal(psql(`select public.briefing_transcription_done('${SECRET}', '${AUDIO_1}', 'outra', 'm');`), "f")

  const [row] = summariesDue()
  assert.deepEqual(
    { ...row },
    {
      answer_id: ANSWER,
      question: { text: "Quem é o seu cliente ideal?", kind: "audio", block_title: "Público" },
      answer_text: null,
      transcripts: ["Mães que trabalham fora."],
      missing_audios: 0,
      attempts: 1,
      source_hash: null,
      previous_summary: null,
    }
  )
  assert.equal(psql(`select public.briefing_summary_done('${SECRET}', '${ANSWER}', 'Resumo 1.', 'claude-haiku-5-5', 'h1');`), "t")
  assert.deepEqual(summary(), { status: "ready", attempts: 1, summary: "Resumo 1.", source_hash: "h1", error: null })
  assert.equal(psql(`select private.briefing_has_work();`), "f")
})

test("editar o texto ou complementar com outro áudio volta o resumo para pendente", { skip }, () => {
  psql(`update public.briefing_answers set updated_at = now() where id = '${ANSWER}';`)
  assert.equal(summary().status, "ready", "mudar outra coluna não mexe no resumo")

  psql(`update public.briefing_answers set text = 'Atendo Curitiba.' where id = '${ANSWER}';`)
  assert.deepEqual(summary(), { status: "pending", attempts: 0, summary: "Resumo 1.", source_hash: "h1", error: null })

  // Resposta mudou durante o resumo: o resultado atrasado não grava.
  summariesDue()
  psql(`update public.briefing_answers set text = 'Atendo Curitiba e região.' where id = '${ANSWER}';`)
  assert.equal(psql(`select public.briefing_summary_done('${SECRET}', '${ANSWER}', 'Velho.', 'm', 'h');`), "f")
  assert.equal(summary().status, "pending")

  psql(`insert into public.briefing_answer_audios (id, answer_id, briefing_id, storage_path, created_at) values ('${AUDIO_2}', '${ANSWER}', '${BRIEFING}', '${PATH_2}', now() + interval '1 second');`)
  assert.deepEqual(summariesDue(), [], "espera o áudio novo")
  psql(`select public.queue_briefing_audio('${AUDIO_2}', '${URL_2}', now() + interval '1 day');`)
  due()
  fail(AUDIO_2, "final", "Formato não aceito.")
  assert.deepEqual(transcription(AUDIO_2), { status: "failed", attempts: 3, transcript: null, error: "Formato não aceito." })
  age("briefing_transcriptions", `audio_id = '${AUDIO_2}'`, 60)
  assert.deepEqual(due(), [], "desistiu: não volta")

  const [row] = summariesDue()
  assert.equal(row.answer_text, "Atendo Curitiba e região.")
  assert.deepEqual(row.transcripts, ["Mães que trabalham fora."])
  assert.equal(row.missing_audios, 1)
  assert.equal(row.previous_summary, "Resumo 1.")
})

test("a equipe reenvia um áudio que desistiu: tentativas zeradas", { skip }, () => {
  psql(as({ team: true }, `select public.queue_briefing_audio('${AUDIO_2}', '${URL_2}', now() + interval '1 day');`))
  assert.deepEqual(transcription(AUDIO_2), { status: "pending", attempts: 0, transcript: null, error: null })
})

test("link vencido: desiste com o motivo", { skip }, () => {
  psql(`update private.briefing_audio_sources set url_expires_at = now() + interval '1 minute' where audio_id = '${AUDIO_2}';`)
  assert.deepEqual(due(), [])
  const row = transcription(AUDIO_2)
  assert.equal(row.status, "failed")
  assert.equal(row.attempts, 3)
  assert.match(row.error, /link do áudio venceu/)
})

test("regravar (apagar os áudios), pular e apagar a resposta", { skip }, () => {
  psql(`update public.briefing_answers set text = null where id = '${ANSWER}';`)
  psql(`delete from public.briefing_answer_audios where id = '${AUDIO_2}';`)
  assert.equal(summary().status, "pending")
  psql(`delete from public.briefing_answer_audios where id = '${AUDIO_1}';`)
  assert.equal(summary(), undefined, "sem texto nem áudio, o resumo sai")

  psql(`update public.briefing_answers set text = 'Escrevi.' where id = '${ANSWER}';`)
  assert.equal(summary().status, "pending")
  psql(`update public.briefing_answers set skipped = true where id = '${ANSWER}';`)
  assert.equal(summary(), undefined)

  psql(`update public.briefing_answers set skipped = false where id = '${ANSWER}';
        insert into public.briefing_answer_audios (answer_id, briefing_id) values ('${ANSWER}', '${BRIEFING}');`)
  psql(`delete from public.briefing_answers where id = '${ANSWER}';`)
  assert.equal(psql(`select count(*) from public.briefing_summaries;`), "0")
  assert.equal(psql(`select count(*) from public.briefing_transcriptions;`), "0")
})

test("resposta de texto curto não ganha resumo", { skip }, () => {
  psql(`insert into public.briefing_answers (id, briefing_id, question_snapshot, text)
        values (gen_random_uuid(), '${BRIEFING}', '{"text": "Nome da marca", "kind": "short_text"}', 'Velmont');`)
  assert.equal(psql(`select count(*) from public.briefing_summaries;`), "0")
})
