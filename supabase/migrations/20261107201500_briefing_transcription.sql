-- Boop Admin: briefing de onboarding, transcrição e resumo (issue #108, Parte 3).
--
-- Cada áudio do briefing é transcrito (OpenAI gpt-4o-mini-transcribe) e cada
-- resposta ganha um resumo (Claude Haiku), só para a equipe. O desenho é o
-- dos jobs do Instagram: nada de Edge Function nem service role.
--
--   * Fila: ao salvar um áudio, o app (com a sessão do cliente) assina a URL
--     do arquivo no bucket privado `briefing` e a entrega a
--     queue_briefing_audio, que confere que o áudio é de um briefing aberto
--     da conta e a guarda fora da API (`private.briefing_audio_sources`),
--     porque o job roda sem sessão. Logo depois, `after()` processa na hora.
--   * Job: o pg_cron chama, a cada minuto, private.run_briefing_job, que só
--     manda o POST (pg_net) para /api/briefing/jobs quando há algo a fazer.
--     Endereço e segredo ficam no Vault (`briefing_jobs_url` e
--     `briefing_jobs_secret`); sem eles, nada sai e nada falha.
--   * A rota pede o que está pendente (briefing_transcriptions_due e
--     briefing_summaries_due, que travam cada item em "processando" com
--     `for update skip locked`) e devolve o resultado (…_done / …_failed).
--     Todas conferem o segredo do Vault. Falhou: tenta de novo nas rodadas
--     seguintes, até 3 vezes, com espera crescente. "Adiar" (sem chave ou
--     chave recusada) volta para pendente sem gastar tentativa.
--   * Resumo: um por resposta das perguntas abertas (ou com áudio). Nasce e
--     volta para pendente quando a resposta muda (texto, pular) ou ganha ou
--     perde um áudio (regravar, complementar); só roda depois que todos os
--     áudios dela tiverem transcrição pronta (ou desistida).
--
-- Aditivo para o código que está na main: uma tabela privada, funções e
-- triggers novos e um job novo.

-- Fila: URL assinada de cada áudio, fora da API --------------------------------

create table private.briefing_audio_sources (
  audio_id uuid primary key references public.briefing_answer_audios (id) on delete cascade,
  -- URL assinada do Storage (temporária), criada com a sessão de quem gravou.
  signed_url text not null check (signed_url ~ '^https://' and char_length(signed_url) <= 2000),
  url_expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table private.briefing_audio_sources is
  'URL assinada de cada áudio do briefing na fila de transcrição. Ninguém lê pela API; só as funções security definer.';

alter table private.briefing_audio_sources enable row level security;
revoke all on private.briefing_audio_sources from public, anon, authenticated;

-- Regras do processamento --------------------------------------------------------

-- O item pode rodar agora? Pendente, ou falhou com menos de 3 tentativas e já
-- esperou 1 minuto por tentativa feita.
create function private.briefing_ai_due(p_status public.briefing_ai_status, p_attempts integer, p_updated_at timestamptz)
returns boolean
language sql
stable
set search_path = ''
as $$
  select p_status = 'pending'
      or (p_status = 'failed' and p_attempts < 3 and p_updated_at <= now() - make_interval(mins => p_attempts));
$$;
revoke all on function private.briefing_ai_due(public.briefing_ai_status, integer, timestamptz) from public;

-- Todos os áudios da resposta já têm a transcrição pronta ou desistida?
create function private.briefing_answer_transcribed(target_answer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select not exists (
    select 1
      from public.briefing_answer_audios au
      join public.briefing_transcriptions t on t.audio_id = au.id
     where au.answer_id = target_answer
       and not (t.status = 'ready' or (t.status = 'failed' and t.attempts >= 3))
  );
$$;
revoke all on function private.briefing_answer_transcribed(uuid) from public;

-- Há transcrição (com URL) ou resumo para fazer? O cron só chama a rota assim.
create function private.briefing_has_work()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
           select 1
             from public.briefing_transcriptions t
             join private.briefing_audio_sources s on s.audio_id = t.audio_id
            where private.briefing_ai_due(t.status, t.attempts, t.updated_at)
               or (t.status = 'processing' and t.started_at <= now() - interval '2 minutes')
         )
      or exists (
           select 1
             from public.briefing_summaries s
            where (private.briefing_ai_due(s.status, s.attempts, s.updated_at)
                   or (s.status = 'processing' and s.started_at <= now() - interval '2 minutes'))
              and private.briefing_answer_transcribed(s.answer_id)
         );
$$;
revoke all on function private.briefing_has_work() from public;

-- Resumo pendente ----------------------------------------------------------------

-- A resposta mudou: o resumo volta para pendente (com as tentativas zeradas).
-- Só resumem as perguntas abertas (tipo audio) ou as respostas com áudio;
-- sem texto nem áudio, ou pulada, o resumo sai.
create function private.mark_briefing_summary(target_answer uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (
    select 1 from public.briefing_answers a
     where a.id = target_answer
       and not a.skipped
       and (
         exists (select 1 from public.briefing_answer_audios au where au.answer_id = a.id)
         or (a.question_snapshot ->> 'kind' = 'audio' and nullif(trim(coalesce(a.text, '')), '') is not null)
       )
  ) then
    insert into public.briefing_summaries (answer_id) values (target_answer)
    on conflict (answer_id) do update
      set status = 'pending',
          attempts = 0,
          error = null,
          started_at = null,
          finished_at = null;
  else
    delete from public.briefing_summaries s where s.answer_id = target_answer;
  end if;
end;
$$;
revoke all on function private.mark_briefing_summary(uuid) from public;

create function private.briefing_answer_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT'
     or new.text is distinct from old.text
     or new.skipped is distinct from old.skipped then
    perform private.mark_briefing_summary(new.id);
  end if;
  return null;
end;
$$;
revoke all on function private.briefing_answer_changed() from public;

create trigger briefing_answer_changed after insert or update on public.briefing_answers
  for each row execute function private.briefing_answer_changed();

-- Gravar, complementar ou apagar (regravar) um áudio. Ao apagar a resposta
-- inteira, os áudios saem em cascata e a resposta já não existe: nada a fazer.
create function private.briefing_audio_changed()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target uuid := case when tg_op = 'DELETE' then old.answer_id else new.answer_id end;
begin
  if exists (select 1 from public.briefing_answers a where a.id = target) then
    perform private.mark_briefing_summary(target);
  end if;
  return null;
end;
$$;
revoke all on function private.briefing_audio_changed() from public;

create trigger briefing_audio_changed after insert or delete on public.briefing_answer_audios
  for each row execute function private.briefing_audio_changed();

-- Pôr na fila (com a sessão) -------------------------------------------------------

-- O app chama logo depois de gravar o áudio, com a URL assinada. Quem grava
-- (o cliente, enquanto o briefing está aberto) ou a equipe (para reenviar um
-- que desistiu). Reenviar uma transcrição que falhou zera as tentativas.
create function public.queue_briefing_audio(p_audio_id uuid, p_signed_url text, p_url_expires_at timestamptz)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_briefing uuid;
  target_path text;
begin
  if (select private.is_oauth_client()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select au.briefing_id, au.storage_path into target_briefing, target_path
    from public.briefing_answer_audios au where au.id = p_audio_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if not ((select private.is_team_member()) or target_briefing in (select private.my_open_briefing_ids())) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  -- Só a URL assinada deste arquivo no bucket (o app confere também o host
  -- do Supabase antes de baixar).
  if p_signed_url is null or p_signed_url !~ '^https://' or char_length(p_signed_url) > 2000
     or strpos(p_signed_url, '/storage/v1/object/sign/briefing/' || target_path || '?') = 0
     or p_url_expires_at is null or p_url_expires_at <= now() then
    raise exception 'invalid_url' using errcode = '22023';
  end if;

  insert into private.briefing_audio_sources (audio_id, signed_url, url_expires_at)
  values (p_audio_id, p_signed_url, p_url_expires_at)
  on conflict (audio_id) do update
    set signed_url = excluded.signed_url,
        url_expires_at = excluded.url_expires_at,
        updated_at = now();

  insert into public.briefing_transcriptions (audio_id) values (p_audio_id)
  on conflict (audio_id) do update
    set status = 'pending', attempts = 0, error = null, started_at = null, finished_at = null
    where public.briefing_transcriptions.status = 'failed';
end;
$$;

revoke all on function public.queue_briefing_audio(uuid, text, timestamptz) from public, anon;
grant execute on function public.queue_briefing_audio(uuid, text, timestamptz) to authenticated;

-- Job sem sessão (segredo do Vault) ------------------------------------------------

create function private.briefing_secret_ok(p_secret text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'briefing_jobs_secret';
  return secret is not null and p_secret is not distinct from secret;
end;
$$;
revoke all on function private.briefing_secret_ok(text) from public;

-- Transcrições a fazer. Antes: as interrompidas (o app caiu no meio, há mais
-- de 2 minutos) voltam para pendente, ou desistem se já foram 3 tentativas;
-- as de link vencido desistem. Depois trava
-- até `p_limit` (máximo 10) em "processando", gasta uma tentativa e as
-- devolve com o caminho no bucket, a URL, o tipo e a pergunta (ajuda a
-- transcrição). O app só baixa a URL se ela for do Storage, deste caminho.
create function public.briefing_transcriptions_due(p_secret text, p_limit integer)
returns table (
  audio_id uuid,
  storage_path text,
  signed_url text,
  mime_type text,
  duration_ms integer,
  attempts integer,
  question text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.briefing_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;

  update public.briefing_transcriptions t
     set status = case when t.attempts >= 3 then 'failed'::public.briefing_ai_status else 'pending' end,
         error = 'Processamento interrompido.'
   where t.status = 'processing' and t.started_at <= now() - interval '2 minutes';

  update public.briefing_transcriptions t
     set status = 'failed',
         attempts = greatest(t.attempts, 3),
         error = 'O link do áudio venceu. Reenvie o áudio para transcrever.'
    from private.briefing_audio_sources s
   where s.audio_id = t.audio_id
     and s.url_expires_at <= now() + interval '5 minutes'
     and private.briefing_ai_due(t.status, t.attempts, t.updated_at);

  return query
    with picked as (
      select t.audio_id
        from public.briefing_transcriptions t
        join private.briefing_audio_sources s on s.audio_id = t.audio_id
       where private.briefing_ai_due(t.status, t.attempts, t.updated_at)
       order by t.created_at
       limit least(greatest(coalesce(p_limit, 1), 1), 10)
         for update of t skip locked
    ),
    claimed as (
      update public.briefing_transcriptions t
         set status = 'processing', attempts = t.attempts + 1, started_at = now(), finished_at = null
        from picked
       where t.audio_id = picked.audio_id
      returning t.audio_id, t.attempts
    )
    select c.audio_id, au.storage_path, s.signed_url, au.mime_type, au.duration_ms, c.attempts, a.question_snapshot ->> 'text'
      from claimed c
      join private.briefing_audio_sources s on s.audio_id = c.audio_id
      join public.briefing_answer_audios au on au.id = c.audio_id
      join public.briefing_answers a on a.id = au.answer_id;
end;
$$;

revoke all on function public.briefing_transcriptions_due(text, integer) from public;
grant execute on function public.briefing_transcriptions_due(text, integer) to anon, authenticated;

-- Transcrição pronta. Só vale para a que está "processando" (se o áudio saiu
-- ou foi reenviado no meio, não grava). A URL sai da fila. Devolve se gravou.
create function public.briefing_transcription_done(p_secret text, p_audio_id uuid, p_transcript text, p_model text)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.briefing_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  update public.briefing_transcriptions t
     set status = 'ready',
         transcript = coalesce(p_transcript, ''),
         model = left(p_model, 100),
         error = null,
         finished_at = now()
   where t.audio_id = p_audio_id and t.status = 'processing';
  if not found then
    return false;
  end if;
  delete from private.briefing_audio_sources s where s.audio_id = p_audio_id;
  return true;
end;
$$;

revoke all on function public.briefing_transcription_done(text, uuid, text, text) from public;
grant execute on function public.briefing_transcription_done(text, uuid, text, text) to anon, authenticated;

-- A tentativa não deu certo. `p_outcome`:
--   retry  falhou (tenta de novo nas próximas rodadas, até 3 vezes);
--   final  desiste já (o arquivo não serve);
--   defer  volta para pendente sem gastar a tentativa (chave recusada).
create function public.briefing_transcription_failed(p_secret text, p_audio_id uuid, p_error text, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.briefing_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('retry', 'final', 'defer') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;
  update public.briefing_transcriptions t
     set status = case when p_outcome = 'defer' then 'pending'::public.briefing_ai_status else 'failed' end,
         attempts = case
           when p_outcome = 'defer' then greatest(t.attempts - 1, 0)
           when p_outcome = 'final' then greatest(t.attempts, 3)
           else t.attempts
         end,
         error = left(nullif(trim(coalesce(p_error, '')), ''), 2000),
         started_at = case when p_outcome = 'defer' then null else t.started_at end,
         finished_at = case when p_outcome = 'defer' then null else now() end
   where t.audio_id = p_audio_id and t.status = 'processing';
end;
$$;

revoke all on function public.briefing_transcription_failed(text, uuid, text, text) from public;
grant execute on function public.briefing_transcription_failed(text, uuid, text, text) to anon, authenticated;

-- Resumos a fazer (com todos os áudios da resposta já transcritos). Trava até
-- `p_limit` (máximo 10) em "processando" e devolve a cópia da pergunta, o
-- texto escrito, as transcrições prontas na ordem da gravação, quantos áudios
-- ficaram sem transcrição e o resumo anterior (com a marca do que resumiu).
create function public.briefing_summaries_due(p_secret text, p_limit integer)
returns table (
  answer_id uuid,
  question jsonb,
  answer_text text,
  transcripts text[],
  missing_audios integer,
  attempts integer,
  source_hash text,
  previous_summary text
)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if not private.briefing_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;

  update public.briefing_summaries s
     set status = case when s.attempts >= 3 then 'failed'::public.briefing_ai_status else 'pending' end,
         error = 'Processamento interrompido.'
   where s.status = 'processing' and s.started_at <= now() - interval '2 minutes';

  return query
    with picked as (
      select s.answer_id
        from public.briefing_summaries s
       where private.briefing_ai_due(s.status, s.attempts, s.updated_at)
         and private.briefing_answer_transcribed(s.answer_id)
       order by s.updated_at
       limit least(greatest(coalesce(p_limit, 1), 1), 10)
         for update of s skip locked
    ),
    claimed as (
      update public.briefing_summaries s
         set status = 'processing', attempts = s.attempts + 1, started_at = now(), finished_at = null
        from picked
       where s.answer_id = picked.answer_id
      returning s.answer_id, s.attempts, s.source_hash, s.summary
    )
    select c.answer_id,
           a.question_snapshot,
           a.text,
           coalesce(
             (select array_agg(t.transcript order by au.created_at, au.id)
                from public.briefing_answer_audios au
                join public.briefing_transcriptions t on t.audio_id = au.id
               where au.answer_id = c.answer_id and t.status = 'ready'),
             '{}'
           ),
           (select count(*)::integer
              from public.briefing_answer_audios au
              join public.briefing_transcriptions t on t.audio_id = au.id
             where au.answer_id = c.answer_id and t.status <> 'ready'),
           c.attempts,
           c.source_hash,
           c.summary
      from claimed c
      join public.briefing_answers a on a.id = c.answer_id;
end;
$$;

revoke all on function public.briefing_summaries_due(text, integer) from public;
grant execute on function public.briefing_summaries_due(text, integer) to anon, authenticated;

-- Resumo pronto (só o que está "processando": se a resposta mudou no meio, o
-- trigger já a voltou para pendente e este resultado fica de fora).
create function public.briefing_summary_done(
  p_secret text,
  p_answer_id uuid,
  p_summary text,
  p_model text,
  p_source_hash text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.briefing_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  update public.briefing_summaries s
     set status = 'ready',
         summary = p_summary,
         model = left(p_model, 100),
         source_hash = left(p_source_hash, 128),
         error = null,
         finished_at = now()
   where s.answer_id = p_answer_id and s.status = 'processing';
  return found;
end;
$$;

revoke all on function public.briefing_summary_done(text, uuid, text, text, text) from public;
grant execute on function public.briefing_summary_done(text, uuid, text, text, text) to anon, authenticated;

-- A tentativa do resumo não deu certo (mesmos `p_outcome` da transcrição).
create function public.briefing_summary_failed(p_secret text, p_answer_id uuid, p_error text, p_outcome text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.briefing_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  if p_outcome is null or p_outcome not in ('retry', 'final', 'defer') then
    raise exception 'invalid_outcome' using errcode = '22023';
  end if;
  update public.briefing_summaries s
     set status = case when p_outcome = 'defer' then 'pending'::public.briefing_ai_status else 'failed' end,
         attempts = case
           when p_outcome = 'defer' then greatest(s.attempts - 1, 0)
           when p_outcome = 'final' then greatest(s.attempts, 3)
           else s.attempts
         end,
         error = left(nullif(trim(coalesce(p_error, '')), ''), 2000),
         started_at = case when p_outcome = 'defer' then null else s.started_at end,
         finished_at = case when p_outcome = 'defer' then null else now() end
   where s.answer_id = p_answer_id and s.status = 'processing';
end;
$$;

revoke all on function public.briefing_summary_failed(text, uuid, text, text) from public;
grant execute on function public.briefing_summary_failed(text, uuid, text, text) to anon, authenticated;

-- Chama a rota do app (pg_net), só quando há algo a fazer.
create function private.run_briefing_job()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text;
  secret text;
begin
  if not private.briefing_has_work() then
    return;
  end if;
  select s.decrypted_secret into url from vault.decrypted_secrets s where s.name = 'briefing_jobs_url';
  select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'briefing_jobs_secret';
  if url is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('job', 'process'),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning 'job do briefing não enviado: %', sqlerrm;
end;
$$;

revoke all on function private.run_briefing_job() from public;

-- Transcrição e resumo: a cada minuto (sem nada pendente, não chama a rota).
select cron.schedule(
  'briefing-process',
  '* * * * *',
  $$select private.run_briefing_job()$$
);
