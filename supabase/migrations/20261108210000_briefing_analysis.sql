-- Boop Admin: análise do briefing inteiro (issue #108, análise).
--
-- Quando o cliente envia o briefing (ou a equipe pede antes, com boa parte
-- respondida), o Claude lê o briefing inteiro e devolve, só para a equipe:
-- os pontos importantes, a leitura do posicionamento, as contradições, as
-- lacunas, as perguntas para a imersão e uma primeira proposta de pilares.
-- Mesmo desenho da transcrição e do resumo (#110): nada de service role.
--
--   * Fila: `briefing_analyses`, uma linha por briefing. O envio do briefing
--     (trigger) e o botão da equipe (`request_briefing_analysis`) a põem em
--     "pendente", com as tentativas zeradas.
--   * Job: o cron `briefing-process` (o mesmo, a cada minuto) passa a ver as
--     análises pendentes (`private.briefing_has_work`, trocada aqui) e a rota
--     /api/briefing/jobs ganha a etapa: pega por briefing_analyses_due (trava
--     em "processando" com `skip locked`), chama o Claude e grava por
--     briefing_analysis_done / briefing_analysis_failed, todas com o segredo
--     do Vault.
--   * Espera: a análise só sai quando as transcrições e os resumos daquele
--     briefing terminaram (prontos ou desistidos); se algum ficar travado,
--     segue depois de 15 minutos com o que houver.
--   * `source_hash` é a marca do que a análise leu: a tela compara com as
--     respostas de agora e oferece "Refazer análise".
--
-- Aditivo para o código que está na main: uma tabela nova, funções e um
-- trigger novos e `private.briefing_has_work` com mais uma condição. Sem
-- chave estrangeira para `client_briefings` de propósito: a linha de um
-- briefing que saiu fica sem conteúdo na rodada seguinte do job e não
-- aparece para ninguém (a política de leitura exige o briefing).

-- Tabela ---------------------------------------------------------------------

create table public.briefing_analyses (
  briefing_id uuid primary key,
  status public.briefing_ai_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  -- As seções da análise (JSON validado pelo app; ver analysis-logic.ts).
  content jsonb check (content is null or jsonb_typeof(content) = 'object'),
  model text check (char_length(model) <= 100),
  -- Marca do que foi analisado (perguntas, respostas e falas).
  source_hash text check (char_length(source_hash) <= 128),
  error text check (char_length(error) <= 2000),
  -- Quem pediu: o envio do cliente ou a equipe pelo botão (id da pessoa,
  -- sem chave estrangeira, para não travar a saída de alguém da equipe).
  origin text not null default 'submitted' check (origin in ('submitted', 'manual')),
  requested_by uuid,
  requested_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.briefing_analyses is
  'Análise da IA do briefing inteiro (pontos, posicionamento, contradições, lacunas, perguntas e pilares). Só a equipe lê.';

create index briefing_analyses_pending_idx on public.briefing_analyses (updated_at)
  where status in ('pending', 'failed', 'processing');

create trigger touch_updated_at before update on public.briefing_analyses
  for each row execute function private.touch_updated_at();

alter table public.briefing_analyses enable row level security;
revoke insert, update on public.briefing_analyses from anon, authenticated;

create policy "conector do Claude sem briefing" on public.briefing_analyses
  as restrictive for all to authenticated
  using (not (select private.is_oauth_client())) with check (not (select private.is_oauth_client()));
-- Só a equipe lê; gravar é pelas funções abaixo.
create policy "equipe vê as análises" on public.briefing_analyses
  for select to authenticated
  using (
    (select private.is_team_member())
    and exists (select 1 from public.client_briefings b where b.id = briefing_id)
  );

-- Regras ---------------------------------------------------------------------

-- As transcrições e os resumos do briefing terminaram (prontos ou desistidos)?
-- Transcrição sem URL na fila não conta: nunca vai rodar.
create function private.briefing_ai_settled(target_briefing uuid)
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
             join private.briefing_audio_sources s on s.audio_id = t.audio_id
            where au.briefing_id = target_briefing
              and not (t.status = 'ready' or (t.status = 'failed' and t.attempts >= 3))
         )
     and not exists (
           select 1
             from public.briefing_answers a
             join public.briefing_summaries su on su.answer_id = a.id
            where a.briefing_id = target_briefing
              and not (su.status = 'ready' or (su.status = 'failed' and su.attempts >= 3))
         );
$$;
revoke all on function private.briefing_ai_settled(uuid) from public;

-- A análise pode rodar agora? Na vez dela (pendente, ou falhou e já esperou)
-- e com a IA do briefing assentada (ou esperando há mais de 15 minutos).
create function private.briefing_analysis_ready(target_briefing uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.briefing_analyses an
      join public.client_briefings b on b.id = an.briefing_id
     where an.briefing_id = target_briefing
       and private.briefing_ai_due(an.status, an.attempts, an.updated_at)
       and (private.briefing_ai_settled(an.briefing_id) or an.requested_at <= now() - interval '15 minutes')
  );
$$;
revoke all on function private.briefing_analysis_ready(uuid) from public;

-- O cron chama a rota quando há transcrição, resumo ou análise a fazer. A
-- análise travada em "processando" volta depois de 10 minutos (o Claude
-- pode levar uns minutos para ler o briefing inteiro).
create or replace function private.briefing_has_work()
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
         )
      or exists (
           select 1
             from public.briefing_analyses an
            where private.briefing_analysis_ready(an.briefing_id)
               or (an.status = 'processing' and an.started_at <= now() - interval '10 minutes')
         );
$$;
revoke all on function private.briefing_has_work() from public;

-- Põe a análise em "pendente" (nova ou de novo), com as tentativas zeradas.
create function private.mark_briefing_analysis(target_briefing uuid, p_origin text, p_by uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.briefing_analyses (briefing_id, origin, requested_by)
  values (target_briefing, p_origin, p_by)
  on conflict (briefing_id) do update
    set status = 'pending',
        attempts = 0,
        error = null,
        origin = excluded.origin,
        requested_by = excluded.requested_by,
        requested_at = now(),
        started_at = null,
        finished_at = null;
end;
$$;
revoke all on function private.mark_briefing_analysis(uuid, text, uuid) from public;

-- O cliente enviou o briefing: a análise entra na fila.
create function private.briefing_submitted_analysis()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'submitted' and old.status in ('not_started', 'in_progress') then
    perform private.mark_briefing_analysis(new.id, 'submitted', null);
  end if;
  return null;
end;
$$;
revoke all on function private.briefing_submitted_analysis() from public;

create trigger briefing_submitted_analysis after update of status on public.client_briefings
  for each row execute function private.briefing_submitted_analysis();

-- Pedido da equipe ----------------------------------------------------------------

-- "Gerar análise agora" / "Refazer análise". Só a equipe; antes do envio, só
-- com pelo menos 60% das obrigatórias respondidas (o mesmo corte da tela).
-- Com a análise já em andamento, não faz nada.
create function public.request_briefing_analysis(target_briefing uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  briefing public.client_briefings%rowtype;
  required_total integer;
  required_missing integer;
begin
  if (select private.is_oauth_client()) or not (select private.is_team_member()) then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  select * into briefing from public.client_briefings b where b.id = target_briefing;
  if not found then
    raise exception 'briefing_not_found' using errcode = 'P0002';
  end if;

  if briefing.status in ('preparing', 'not_started', 'in_progress') then
    select count(*)::integer into required_total
      from public.briefing_blocks bl
      join public.briefing_questions q on q.block_id = bl.id and q.active and q.required
     where bl.template_id = briefing.template_id and bl.active;
    select count(*)::integer into required_missing from private.briefing_missing_required(briefing.id);
    if required_total = 0 or (required_total - required_missing) * 10 < required_total * 6 then
      raise exception 'not_enough_answers' using errcode = 'P0001';
    end if;
  end if;

  if exists (
    select 1 from public.briefing_analyses an
     where an.briefing_id = briefing.id and an.status in ('pending', 'processing')
  ) then
    return;
  end if;
  perform private.mark_briefing_analysis(briefing.id, 'manual', (select auth.uid()));
end;
$$;

revoke all on function public.request_briefing_analysis(uuid) from public, anon;
grant execute on function public.request_briefing_analysis(uuid) to authenticated;

-- Job sem sessão (segredo do Vault) ------------------------------------------------

-- Análises a fazer. Antes: a de um briefing que saiu fica sem conteúdo; as
-- interrompidas (há mais de 10 minutos) voltam para pendente ou desistem.
-- Depois trava até `p_limit` (máximo 2) em "processando", gasta uma
-- tentativa e devolve o briefing inteiro: blocos, perguntas (o formulário de
-- agora), respostas com a cópia da pergunta, os áudios com as transcrições
-- e os resumos, mais a marca e o conteúdo da análise anterior.
create function public.briefing_analyses_due(p_secret text, p_limit integer)
returns table (
  briefing_id uuid,
  attempts integer,
  source_hash text,
  previous_content jsonb,
  client_name text,
  identification jsonb,
  status text,
  submitted_at timestamptz,
  blocks jsonb,
  questions jsonb,
  answers jsonb
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

  update public.briefing_analyses an
     set content = null, status = 'failed', attempts = greatest(an.attempts, 3), error = 'O briefing não existe mais.'
   where not exists (select 1 from public.client_briefings b where b.id = an.briefing_id)
     and (an.content is not null or an.status <> 'failed' or an.attempts < 3);

  update public.briefing_analyses an
     set status = case when an.attempts >= 3 then 'failed'::public.briefing_ai_status else 'pending' end,
         error = 'Processamento interrompido.'
   where an.status = 'processing' and an.started_at <= now() - interval '10 minutes';

  return query
    with picked as (
      select an.briefing_id
        from public.briefing_analyses an
       where private.briefing_analysis_ready(an.briefing_id)
       order by an.requested_at
       limit least(greatest(coalesce(p_limit, 1), 1), 2)
         for update of an skip locked
    ),
    claimed as (
      update public.briefing_analyses an
         set status = 'processing', attempts = an.attempts + 1, started_at = now(), finished_at = null
        from picked
       where an.briefing_id = picked.briefing_id
      returning an.briefing_id, an.attempts, an.source_hash, an.content
    )
    select c.briefing_id,
           c.attempts,
           c.source_hash,
           c.content,
           cl.name,
           b.identification,
           b.status::text,
           b.submitted_at,
           coalesce(
             (select jsonb_agg(jsonb_build_object(
                       'id', bl.id, 'position', bl.position, 'title', bl.title, 'description', bl.description,
                       'estimated_minutes', bl.estimated_minutes, 'active', bl.active
                     ) order by bl.position)
                from public.briefing_blocks bl where bl.template_id = b.template_id),
             '[]'
           ),
           coalesce(
             (select jsonb_agg(jsonb_build_object(
                       'id', q.id, 'block_id', q.block_id, 'position', q.position, 'key', q.key, 'text', q.text,
                       'hint', q.hint, 'kind', q.kind, 'options', q.options, 'required', q.required,
                       'active', q.active, 'created_at', q.created_at
                     ) order by bl.position, q.position)
                from public.briefing_blocks bl
                join public.briefing_questions q on q.block_id = bl.id
               where bl.template_id = b.template_id),
             '[]'
           ),
           coalesce(
             (select jsonb_agg(jsonb_build_object(
                       'id', a.id, 'question_id', a.question_id, 'question_snapshot', a.question_snapshot,
                       'text', a.text, 'value', a.value, 'files', a.files, 'skipped', a.skipped,
                       'updated_at', a.updated_at, 'filled_by_team', a.filled_by_team,
                       'team_filled_at', a.team_filled_at, 'by_client', a.answered_by is not null,
                       'summary', (select jsonb_build_object('status', su.status, 'summary', su.summary)
                                     from public.briefing_summaries su where su.answer_id = a.id),
                       'audios', coalesce(
                         (select jsonb_agg(jsonb_build_object(
                                   'id', au.id, 'duration_ms', au.duration_ms, 'created_at', au.created_at,
                                   'status', t.status, 'transcript', t.transcript
                                 ) order by au.created_at, au.id)
                            from public.briefing_answer_audios au
                            left join public.briefing_transcriptions t on t.audio_id = au.id
                           where au.answer_id = a.id),
                         '[]'
                       )
                     ) order by a.created_at, a.id)
                from public.briefing_answers a where a.briefing_id = b.id),
             '[]'
           )
      from claimed c
      join public.client_briefings b on b.id = c.briefing_id
      join public.clients cl on cl.id = b.client_id;
end;
$$;

revoke all on function public.briefing_analyses_due(text, integer) from public;
grant execute on function public.briefing_analyses_due(text, integer) to anon, authenticated;

-- Análise pronta (só a que está "processando": se foi pedida de novo no
-- meio, volta a valer o pedido novo).
create function public.briefing_analysis_done(
  p_secret text,
  p_briefing_id uuid,
  p_content jsonb,
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
  if p_content is null or jsonb_typeof(p_content) <> 'object' then
    raise exception 'invalid_content' using errcode = '22023';
  end if;
  update public.briefing_analyses an
     set status = 'ready',
         content = p_content,
         model = left(p_model, 100),
         source_hash = left(p_source_hash, 128),
         error = null,
         finished_at = now()
   where an.briefing_id = p_briefing_id and an.status = 'processing'
     and exists (select 1 from public.client_briefings b where b.id = an.briefing_id);
  return found;
end;
$$;

revoke all on function public.briefing_analysis_done(text, uuid, jsonb, text, text) from public;
grant execute on function public.briefing_analysis_done(text, uuid, jsonb, text, text) to anon, authenticated;

-- A tentativa não deu certo (mesmos `p_outcome` da transcrição e do resumo).
-- A análise anterior (se houver) fica guardada para a tela.
create function public.briefing_analysis_failed(p_secret text, p_briefing_id uuid, p_error text, p_outcome text)
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
  update public.briefing_analyses an
     set status = case when p_outcome = 'defer' then 'pending'::public.briefing_ai_status else 'failed' end,
         attempts = case
           when p_outcome = 'defer' then greatest(an.attempts - 1, 0)
           when p_outcome = 'final' then greatest(an.attempts, 3)
           else an.attempts
         end,
         error = left(nullif(trim(coalesce(p_error, '')), ''), 2000),
         started_at = case when p_outcome = 'defer' then null else an.started_at end,
         finished_at = case when p_outcome = 'defer' then null else now() end
   where an.briefing_id = p_briefing_id and an.status = 'processing';
end;
$$;

revoke all on function public.briefing_analysis_failed(text, uuid, text, text) from public;
grant execute on function public.briefing_analysis_failed(text, uuid, text, text) to anon, authenticated;
