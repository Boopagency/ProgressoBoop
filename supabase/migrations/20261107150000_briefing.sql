-- Boop Admin: briefing de onboarding no portal (issue #108, Parte 1, base).
--
-- O cliente novo responde o briefing no portal, de preferência por áudio, e a
-- Boop lê as respostas na ficha do cliente. Esta migration traz:
--
--   * o formulário (modelo → blocos → perguntas), com o v1 de 30 perguntas
--     inserido aqui. Perguntas e blocos nunca são apagados, só desativados;
--   * o briefing de cada cliente (`client_briefings`), liberado pela equipe
--     com um prazo, e as respostas (`briefing_answers`), cada uma com uma
--     cópia da pergunta do momento em que foi respondida (editar a pergunta
--     não muda briefing antigo);
--   * os áudios de cada resposta (`briefing_answer_audios`; uma resposta pode
--     ter mais de um: "complementar") e os uploads, no bucket privado
--     `briefing`, caminho "<cliente>/<briefing>/<arquivo>";
--   * o que a IA produz, só para a equipe: transcrição por áudio e resumo por
--     resposta, com o estado do processamento e as tentativas. O cliente não
--     lê nada disso. A Parte 3 acrescenta a fila, o cron e as funções;
--   * as notas da imersão (`briefing_immersions`), ligadas a `meetings`;
--   * dois avisos novos da equipe: bloco concluído e briefing enviado;
--   * o bloqueio do portal: enquanto o briefing está liberado e não enviado,
--     as funções de aprovação (post e etapa) recusam com `briefing_pending`.
--
-- RLS: a equipe vê tudo; o cliente lê e grava só o briefing do próprio
-- cliente (ativo), e grava só enquanto não enviou. O conector do Claude não
-- vê nem mexe em nada do briefing.
--
-- Aditivo para o código que está na main: tabelas, tipos e funções novas;
-- `portal_review_post` e `portal_review_step` ganham só a checagem do
-- briefing no começo (o resto é o mesmo corpo de antes).

-- Tipos -----------------------------------------------------------------------

alter type public.notification_kind add value if not exists 'briefing_block_done';
alter type public.notification_kind add value if not exists 'briefing_submitted';

-- Não enviado (liberado, ainda sem resposta) → Em preenchimento → Enviado →
-- Imersão feita → Documento enviado → Validado.
create type public.briefing_status as enum (
  'not_started',
  'in_progress',
  'submitted',
  'immersion_done',
  'document_sent',
  'validated'
);

-- `identification` é o bloco 0 (dados que a Boop preenche e o cliente
-- confirma); `audio` é a pergunta aberta (gravar em destaque, "prefiro
-- escrever" embaixo).
create type public.briefing_question_kind as enum (
  'identification',
  'audio',
  'short_text',
  'number',
  'choice',
  'multiple',
  'cards',
  'palette',
  'upload',
  'links',
  'dates'
);

-- Processamento da IA (transcrição e resumo).
create type public.briefing_ai_status as enum ('pending', 'processing', 'ready', 'failed');

-- Formulário ------------------------------------------------------------------

create table public.briefing_templates (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  version integer not null default 1 check (version >= 1),
  -- O modelo usado ao liberar um briefing novo (um só ativo).
  active boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.briefing_templates is
  'Modelos do briefing de onboarding. O ativo é usado ao liberar um briefing novo.';

create unique index briefing_templates_one_active_idx on public.briefing_templates ((true)) where active;

create table public.briefing_blocks (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.briefing_templates (id) on delete restrict,
  position integer not null,
  title text not null check (char_length(title) between 1 and 120),
  description text check (char_length(description) <= 500),
  estimated_minutes integer check (estimated_minutes between 1 and 60),
  -- Nunca apagado: desativar tira dos briefings novos e dos que estão em andamento.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.briefing_blocks is
  'Blocos (etapas) de um modelo de briefing, em ordem. Nunca apagados, só desativados.';

create index briefing_blocks_template_idx on public.briefing_blocks (template_id, position);

-- `options` (jsonb), conforme o tipo; tudo opcional:
--   choices  [{value, label}]            choice, multiple
--   cards    [{value, label, description, example}]   cards (tom de voz)
--   max      n                           quantas escolhas, no máximo (multiple, cards, links)
--   primary  true                        com duas escolhas, pede a principal (cards)
--   other    true                        aceita "Outro" com texto
--   voice    "essential"                 pergunta aberta que mais precisa da fala
--   unit     "BRL"                       number em reais
--   accept   ["image/*", ...]            upload
--   fields   [{key, label, placeholder}] identification e campos de texto lado a lado
--   extras   [{key, kind, label, placeholder, required}]   complemento opcional
--            (ex.: o percentual, a meta em números, a frase que já ouviu)
--   placeholder "..."                    texto de exemplo do campo
create table public.briefing_questions (
  id uuid primary key default gen_random_uuid(),
  block_id uuid not null references public.briefing_blocks (id) on delete restrict,
  position integer not null,
  -- Nome estável da pergunta (ex.: "brand_tone"), para o card "Sua marca" e os
  -- relatórios. Vazio nas perguntas criadas pelo editor.
  key text check (key ~ '^[a-z][a-z0-9_]{1,60}$'),
  text text not null check (char_length(text) between 1 and 500),
  hint text check (char_length(hint) <= 500),
  kind public.briefing_question_kind not null,
  options jsonb not null default '{}'::jsonb check (jsonb_typeof(options) = 'object'),
  required boolean not null default false,
  -- Nunca apagada: desativar tira dos briefings novos e dos que estão em andamento.
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (block_id, key)
);
comment on table public.briefing_questions is
  'Perguntas de um bloco do briefing. Nunca apagadas, só desativadas; a resposta guarda uma cópia.';

create index briefing_questions_block_idx on public.briefing_questions (block_id, position);

-- Briefing do cliente -----------------------------------------------------------

create table public.client_briefings (
  id uuid primary key default gen_random_uuid(),
  -- Um briefing por cliente no MVP.
  client_id uuid not null unique references public.clients (id) on delete cascade,
  template_id uuid not null references public.briefing_templates (id) on delete restrict,
  status public.briefing_status not null default 'not_started',
  -- Prazo combinado (padrão: 5 dias úteis depois de liberar).
  due_on date not null,
  -- Bloco 0, conferido pela equipe ao liberar: {brand_name, contact_name,
  -- region, instagram, site}.
  identification jsonb not null default '{}'::jsonb check (jsonb_typeof(identification) = 'object'),
  released_at timestamptz not null default now(),
  released_by uuid references public.profiles (id) on delete set null,
  started_at timestamptz,
  submitted_at timestamptz,
  immersion_at timestamptz,
  document_sent_at timestamptz,
  validated_at timestamptz,
  -- Último acesso do cliente e a pergunta em que parou (para voltar nela).
  last_seen_at timestamptz,
  current_question_id uuid references public.briefing_questions (id) on delete set null,
  -- Blocos que o cliente fechou (o aviso "bloco concluído" sai uma vez por bloco).
  completed_block_ids uuid[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.client_briefings is
  'Briefing de onboarding de um cliente. Liberado e não enviado, o portal desse cliente só mostra o briefing.';

create index client_briefings_template_idx on public.client_briefings (template_id);
create index client_briefings_released_by_idx on public.client_briefings (released_by);
create index client_briefings_current_question_idx on public.client_briefings (current_question_id);

create table public.briefing_answers (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null references public.client_briefings (id) on delete cascade,
  question_id uuid not null references public.briefing_questions (id) on delete restrict,
  -- Cópia da pergunta ao ser respondida (texto, dica, tipo, opções,
  -- obrigatória, bloco). Gravada pelo banco, nunca pelo app.
  question_snapshot jsonb not null default '{}'::jsonb,
  -- Resposta escrita ("prefiro escrever") ou texto curto.
  text text check (char_length(text) <= 10000),
  -- Resposta estruturada: escolhas, número, cores, links, datas, complementos.
  value jsonb,
  -- Uploads: [{path, name, mime_type, size_bytes}], no bucket briefing.
  files jsonb not null default '[]'::jsonb check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 30),
  -- "Pular por agora": fica marcada para a reunião.
  skipped boolean not null default false,
  answered_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (briefing_id, question_id)
);
comment on table public.briefing_answers is
  'Resposta do cliente a uma pergunta do briefing, com a cópia da pergunta do momento.';

create index briefing_answers_question_idx on public.briefing_answers (question_id);
create index briefing_answers_answered_by_idx on public.briefing_answers (answered_by);

create table public.briefing_answer_audios (
  id uuid primary key default gen_random_uuid(),
  answer_id uuid not null references public.briefing_answers (id) on delete cascade,
  briefing_id uuid not null references public.client_briefings (id) on delete cascade,
  -- "<cliente>/<briefing>/<uuid>" no bucket briefing.
  storage_path text not null unique check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  -- Tipo e tamanho que o Storage registrou (o banco preenche).
  mime_type text not null default '' check (char_length(mime_type) <= 100),
  size_bytes bigint not null default 0 check (size_bytes between 0 and 10485760),
  -- Até 3 minutos por áudio (com uma folga para o fim da gravação).
  duration_ms integer not null check (duration_ms between 1 and 190000),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
comment on table public.briefing_answer_audios is
  'Áudios de uma resposta do briefing (o segundo em diante "complementa"). Arquivo no bucket briefing.';

create index briefing_answer_audios_answer_idx on public.briefing_answer_audios (answer_id, created_at);
create index briefing_answer_audios_briefing_idx on public.briefing_answer_audios (briefing_id);
create index briefing_answer_audios_created_by_idx on public.briefing_answer_audios (created_by);

-- Só da equipe: o que a IA produz ---------------------------------------------

create table public.briefing_transcriptions (
  audio_id uuid primary key references public.briefing_answer_audios (id) on delete cascade,
  status public.briefing_ai_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  transcript text,
  model text check (char_length(model) <= 100),
  error text check (char_length(error) <= 2000),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.briefing_transcriptions is
  'Transcrição de cada áudio do briefing e o estado do processamento. Só a equipe lê.';

create index briefing_transcriptions_pending_idx on public.briefing_transcriptions (updated_at)
  where status in ('pending', 'failed');

create table public.briefing_summaries (
  answer_id uuid primary key references public.briefing_answers (id) on delete cascade,
  status public.briefing_ai_status not null default 'pending',
  attempts integer not null default 0 check (attempts >= 0),
  summary text,
  model text check (char_length(model) <= 100),
  -- Marca do que foi resumido (texto e transcrições), para saber se ficou velho.
  source_hash text check (char_length(source_hash) <= 128),
  error text check (char_length(error) <= 2000),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.briefing_summaries is
  'Resumo da IA de cada resposta do briefing e o estado do processamento. Só a equipe lê.';

create index briefing_summaries_pending_idx on public.briefing_summaries (updated_at)
  where status in ('pending', 'failed');

-- Imersão ---------------------------------------------------------------------

create table public.briefing_immersions (
  id uuid primary key default gen_random_uuid(),
  briefing_id uuid not null unique references public.client_briefings (id) on delete cascade,
  -- A reunião de imersão no calendário do Admin.
  meeting_id uuid references public.meetings (id) on delete set null,
  transcript text check (char_length(transcript) <= 200000),
  notes text check (char_length(notes) <= 50000),
  created_by uuid references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.briefing_immersions is
  'Notas e transcrição da reunião de imersão do briefing. Só a equipe.';

create index briefing_immersions_meeting_idx on public.briefing_immersions (meeting_id);
create index briefing_immersions_created_by_idx on public.briefing_immersions (created_by);

-- Funções de apoio ------------------------------------------------------------

create function private.touch_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function private.touch_updated_at() from public;

create trigger touch_updated_at before update on public.briefing_templates
  for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.briefing_blocks
  for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.briefing_questions
  for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.client_briefings
  for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.briefing_answers
  for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.briefing_transcriptions
  for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.briefing_summaries
  for each row execute function private.touch_updated_at();
create trigger touch_updated_at before update on public.briefing_immersions
  for each row execute function private.touch_updated_at();

-- Briefings que a conta logada (cliente) lê: dos clientes ativos dela.
create function private.my_briefing_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id
    from public.client_briefings b
    join public.clients c on c.id = b.client_id and c.active
   where b.client_id in (select private.my_client_ids());
$$;
revoke all on function private.my_briefing_ids() from public;
grant execute on function private.my_briefing_ids() to authenticated;

-- Os que ela ainda pode responder: liberados e não enviados.
create function private.my_open_briefing_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select b.id
    from public.client_briefings b
    join public.clients c on c.id = b.client_id and c.active
   where b.client_id in (select private.my_client_ids())
     and b.status in ('not_started', 'in_progress');
$$;
revoke all on function private.my_open_briefing_ids() from public;
grant execute on function private.my_open_briefing_ids() to authenticated;

-- O portal deste cliente está travado no briefing (liberado e não enviado)?
create function private.briefing_locked(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_briefings b
     where b.client_id = target_client
       and b.status in ('not_started', 'in_progress')
  );
$$;
revoke all on function private.briefing_locked(uuid) from public;
grant execute on function private.briefing_locked(uuid) to authenticated;

-- O caminho no bucket é de um briefing que a conta ainda pode responder
-- ("<cliente>/<briefing>/..." com o briefing daquele cliente)?
create function private.briefing_path_open(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(object_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/', false)
     and exists (
       select 1 from public.client_briefings b
        where b.id::text = split_part(object_name, '/', 2)
          and b.client_id::text = split_part(object_name, '/', 1)
          and b.id in (select private.my_open_briefing_ids())
     );
$$;
revoke all on function private.briefing_path_open(text) from public;
grant execute on function private.briefing_path_open(text) to authenticated;

-- E de um briefing que a conta lê (mesmo depois de enviado).
create function private.briefing_path_mine(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(object_name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/', false)
     and exists (
       select 1 from public.client_briefings b
        where b.id::text = split_part(object_name, '/', 2)
          and b.client_id::text = split_part(object_name, '/', 1)
          and b.id in (select private.my_briefing_ids())
     );
$$;
revoke all on function private.briefing_path_mine(text) from public;
grant execute on function private.briefing_path_mine(text) to authenticated;

-- Cópia da pergunta guardada na resposta.
create function private.briefing_question_snapshot(target_question uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'text', q.text,
    'hint', q.hint,
    'kind', q.kind,
    'options', q.options,
    'required', q.required,
    'key', q.key,
    'block_id', bl.id,
    'block_title', bl.title
  )
    from public.briefing_questions q
    join public.briefing_blocks bl on bl.id = q.block_id
   where q.id = target_question;
$$;
revoke all on function private.briefing_question_snapshot(uuid) from public;

-- A resposta tem conteúdo (texto, valor, arquivo ou áudio) e não foi pulada?
create function private.briefing_answer_filled(target_answer uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.briefing_answers a
     where a.id = target_answer
       and not a.skipped
       and (
         nullif(trim(coalesce(a.text, '')), '') is not null
         or (a.value is not null and a.value not in ('null'::jsonb, '{}'::jsonb, '[]'::jsonb, '""'::jsonb))
         or jsonb_array_length(a.files) > 0
         or exists (select 1 from public.briefing_answer_audios au where au.answer_id = a.id)
       )
  );
$$;
revoke all on function private.briefing_answer_filled(uuid) from public;

-- Perguntas obrigatórias (ativas, de blocos ativos) ainda sem resposta. Com
-- `target_block`, só as daquele bloco.
create function private.briefing_missing_required(target_briefing uuid, target_block uuid default null)
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select q.id
    from public.client_briefings b
    join public.briefing_blocks bl on bl.template_id = b.template_id and bl.active
    join public.briefing_questions q on q.block_id = bl.id and q.active and q.required
    left join public.briefing_answers a on a.briefing_id = b.id and a.question_id = q.id
   where b.id = target_briefing
     and (target_block is null or bl.id = target_block)
     and (a.id is null or not private.briefing_answer_filled(a.id))
   order by bl.position, q.position;
$$;
revoke all on function private.briefing_missing_required(uuid, uuid) from public;

-- Avisa a equipe no sino: quem cuida do cliente; sem responsável, todo mundo.
create function private.notify_briefing_team(
  target_briefing uuid,
  notice public.notification_kind,
  notice_title text,
  notice_body text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  briefing public.client_briefings%rowtype;
  owner uuid;
  member_name text;
begin
  select * into briefing from public.client_briefings b where b.id = target_briefing;
  if not found then
    return;
  end if;
  select c.owner_id into owner from public.clients c where c.id = briefing.client_id;
  select left(cm.full_name, 120) into member_name
    from public.client_members cm
   where cm.user_id = me and cm.client_id = briefing.client_id;

  insert into public.notifications (user_id, kind, actor_id, actor_name, client_id, title, body, link)
  select p.id, notice, me, member_name, briefing.client_id,
         left(notice_title, 300), left(notice_body, 300),
         '/clientes/' || briefing.client_id || '?aba=briefing'
    from public.profiles p
   where (owner is not null and p.id = owner)
      or (owner is null);
end;
$$;
revoke all on function private.notify_briefing_team(uuid, public.notification_kind, text, text) from public;

-- Triggers --------------------------------------------------------------------

-- Pelo cliente (direto pela API), o briefing só muda o que é dele: onde parou,
-- o último acesso e "começou" (não enviado → em preenchimento). Enviar e
-- fechar bloco são pelas funções `portal_*` abaixo; o resto é da equipe.
create function private.guard_client_briefing()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user not in ('authenticated', 'anon') or (select private.is_team_member()) then
    if tg_op = 'INSERT' and new.released_by is null then
      new.released_by := (select auth.uid());
    end if;
    return new;
  end if;
  if tg_op <> 'UPDATE' then
    raise exception 'briefing_forbidden' using errcode = '42501';
  end if;
  if (to_jsonb(new) - array['status', 'started_at', 'last_seen_at', 'current_question_id', 'updated_at'])
     is distinct from (to_jsonb(old) - array['status', 'started_at', 'last_seen_at', 'current_question_id', 'updated_at']) then
    raise exception 'briefing_forbidden' using errcode = '42501';
  end if;
  if new.status is distinct from old.status
     and not (old.status = 'not_started' and new.status = 'in_progress') then
    raise exception 'briefing_forbidden' using errcode = '42501';
  end if;
  if new.status = 'in_progress' and new.started_at is null then
    new.started_at := now();
  end if;
  if new.current_question_id is distinct from old.current_question_id
     and new.current_question_id is not null
     and not exists (
       select 1 from public.briefing_questions q
         join public.briefing_blocks bl on bl.id = q.block_id
        where q.id = new.current_question_id and bl.template_id = new.template_id
     ) then
    raise exception 'question_not_found' using errcode = 'P0002';
  end if;
  return new;
end;
$$;
revoke all on function private.guard_client_briefing() from public;

create trigger guard_client_briefing before insert or update on public.client_briefings
  for each row execute function private.guard_client_briefing();

-- A resposta: a pergunta tem de ser do modelo do briefing; a cópia da
-- pergunta e quem respondeu são gravados aqui; os arquivos têm de estar na
-- pasta do briefing. Responder tira o "pular" e vice-versa fica a critério do app.
create function private.prepare_briefing_answer()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  briefing public.client_briefings%rowtype;
  prefix text;
  item jsonb;
begin
  if tg_op = 'UPDATE' and (new.briefing_id <> old.briefing_id or new.question_id <> old.question_id) then
    raise exception 'invalid_answer' using errcode = '22023';
  end if;
  select * into briefing from public.client_briefings b where b.id = new.briefing_id;
  if not exists (
    select 1 from public.briefing_questions q
      join public.briefing_blocks bl on bl.id = q.block_id
     where q.id = new.question_id and bl.template_id = briefing.template_id
  ) then
    raise exception 'question_not_found' using errcode = 'P0002';
  end if;

  prefix := briefing.client_id || '/' || briefing.id || '/';
  for item in select * from jsonb_array_elements(new.files) loop
    if jsonb_typeof(item) <> 'object'
       or coalesce(item ->> 'path', '') not like prefix || '%'
       or char_length(item ->> 'path') > 300
       or char_length(coalesce(item ->> 'name', '')) > 300 then
      raise exception 'invalid_file' using errcode = '22023';
    end if;
  end loop;

  -- Enquanto o briefing está aberto, a cópia acompanha a pergunta mostrada;
  -- depois de enviado, quem muda (a equipe) não mexe na cópia.
  if tg_op = 'INSERT' or briefing.status in ('not_started', 'in_progress') then
    new.question_snapshot := private.briefing_question_snapshot(new.question_id);
  else
    new.question_snapshot := old.question_snapshot;
  end if;
  if not (select private.is_team_member()) then
    new.answered_by := (select auth.uid());
  elsif tg_op = 'UPDATE' then
    new.answered_by := old.answered_by;
  end if;
  return new;
end;
$$;
revoke all on function private.prepare_briefing_answer() from public;

create trigger prepare_briefing_answer before insert or update on public.briefing_answers
  for each row execute function private.prepare_briefing_answer();

-- O áudio: o arquivo tem de estar no bucket, na pasta do briefing da
-- resposta, ser de áudio e ter até 10 MB. Tipo e tamanho vêm do Storage.
create function private.prepare_briefing_audio()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  briefing public.client_briefings%rowtype;
  found_mime text;
  found_size bigint;
begin
  select b.* into briefing
    from public.briefing_answers a
    join public.client_briefings b on b.id = a.briefing_id
   where a.id = new.answer_id;
  if not found or briefing.id <> new.briefing_id
     or split_part(new.storage_path, '/', 1) <> briefing.client_id::text
     or split_part(new.storage_path, '/', 2) <> briefing.id::text then
    raise exception 'invalid_audio' using errcode = '22023';
  end if;
  select o.metadata ->> 'mimetype', (o.metadata ->> 'size')::bigint
    into found_mime, found_size
    from storage.objects o
   where o.bucket_id = 'briefing'
     and o.name = new.storage_path;
  if found_mime is null or found_mime not like 'audio/%' or coalesce(found_size, 0) not between 1 and 10485760 then
    raise exception 'invalid_audio' using errcode = '22023';
  end if;
  new.mime_type := found_mime;
  new.size_bytes := found_size;
  new.created_by := (select auth.uid());
  return new;
end;
$$;
revoke all on function private.prepare_briefing_audio() from public;

create trigger prepare_briefing_audio before insert on public.briefing_answer_audios
  for each row execute function private.prepare_briefing_audio();

-- Todo áudio nasce com a transcrição "pendente" (sem chave da IA, fica assim
-- até o job processar).
create function private.queue_briefing_transcription()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.briefing_transcriptions (audio_id) values (new.id) on conflict do nothing;
  return new;
end;
$$;
revoke all on function private.queue_briefing_transcription() from public;

create trigger queue_briefing_transcription after insert on public.briefing_answer_audios
  for each row execute function private.queue_briefing_transcription();

-- Ações do cliente (portal) -------------------------------------------------------

-- Fecha um bloco: confere os obrigatórios dele e avisa a equipe (uma vez por
-- bloco). Devolve true quando o bloco acabou de ser fechado.
create function public.portal_complete_briefing_block(target_briefing uuid, target_block uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  briefing public.client_briefings%rowtype;
  block public.briefing_blocks%rowtype;
begin
  select * into briefing from public.client_briefings b
   where b.id = target_briefing and b.id in (select private.my_open_briefing_ids())
   for update;
  if not found then
    raise exception 'briefing_not_found' using errcode = 'P0002';
  end if;
  select * into block from public.briefing_blocks bl
   where bl.id = target_block and bl.template_id = briefing.template_id and bl.active;
  if not found then
    raise exception 'block_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from private.briefing_missing_required(briefing.id, block.id)) then
    raise exception 'required_missing' using errcode = 'P0001';
  end if;
  if block.id = any (briefing.completed_block_ids) then
    return false;
  end if;

  update public.client_briefings b
     set completed_block_ids = b.completed_block_ids || block.id,
         status = case when b.status = 'not_started' then 'in_progress'::public.briefing_status else b.status end,
         started_at = coalesce(b.started_at, now()),
         last_seen_at = now()
   where b.id = briefing.id;

  perform private.notify_briefing_team(
    briefing.id,
    'briefing_block_done',
    (select c.name from public.clients c where c.id = briefing.client_id),
    block.title
  );
  return true;
end;
$$;

-- Envia o briefing: só com todos os obrigatórios. Depois disso o cliente não
-- muda mais as respostas e o portal abre por inteiro.
create function public.portal_submit_briefing(target_briefing uuid)
returns timestamptz
language plpgsql
security definer
set search_path = ''
as $$
declare
  briefing public.client_briefings%rowtype;
  sent timestamptz := now();
begin
  select * into briefing from public.client_briefings b
   where b.id = target_briefing and b.id in (select private.my_open_briefing_ids())
   for update;
  if not found then
    raise exception 'briefing_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from private.briefing_missing_required(briefing.id)) then
    raise exception 'required_missing' using errcode = 'P0001';
  end if;

  update public.client_briefings b
     set status = 'submitted',
         submitted_at = sent,
         started_at = coalesce(b.started_at, sent),
         last_seen_at = sent
   where b.id = briefing.id;

  perform private.notify_briefing_team(
    briefing.id,
    'briefing_submitted',
    (select c.name from public.clients c where c.id = briefing.client_id),
    null
  );
  return sent;
end;
$$;

revoke execute on function public.portal_complete_briefing_block(uuid, uuid) from public, anon;
grant execute on function public.portal_complete_briefing_block(uuid, uuid) to authenticated;
revoke execute on function public.portal_submit_briefing(uuid) from public, anon;
grant execute on function public.portal_submit_briefing(uuid) to authenticated;

-- RLS -------------------------------------------------------------------------

alter table public.briefing_templates enable row level security;
alter table public.briefing_blocks enable row level security;
alter table public.briefing_questions enable row level security;
alter table public.client_briefings enable row level security;
alter table public.briefing_answers enable row level security;
alter table public.briefing_answer_audios enable row level security;
alter table public.briefing_transcriptions enable row level security;
alter table public.briefing_summaries enable row level security;
alter table public.briefing_immersions enable row level security;

-- O conector do Claude não vê nem mexe em nada do briefing.
create policy "conector do Claude sem briefing" on public.briefing_templates
  as restrictive for all to authenticated
  using (not (select private.is_oauth_client())) with check (not (select private.is_oauth_client()));
create policy "conector do Claude sem briefing" on public.briefing_blocks
  as restrictive for all to authenticated
  using (not (select private.is_oauth_client())) with check (not (select private.is_oauth_client()));
create policy "conector do Claude sem briefing" on public.briefing_questions
  as restrictive for all to authenticated
  using (not (select private.is_oauth_client())) with check (not (select private.is_oauth_client()));
create policy "conector do Claude sem briefing" on public.client_briefings
  as restrictive for all to authenticated
  using (not (select private.is_oauth_client())) with check (not (select private.is_oauth_client()));
create policy "conector do Claude sem briefing" on public.briefing_answers
  as restrictive for all to authenticated
  using (not (select private.is_oauth_client())) with check (not (select private.is_oauth_client()));
create policy "conector do Claude sem briefing" on public.briefing_answer_audios
  as restrictive for all to authenticated
  using (not (select private.is_oauth_client())) with check (not (select private.is_oauth_client()));
create policy "conector do Claude sem briefing" on public.briefing_transcriptions
  as restrictive for all to authenticated
  using (not (select private.is_oauth_client())) with check (not (select private.is_oauth_client()));
create policy "conector do Claude sem briefing" on public.briefing_summaries
  as restrictive for all to authenticated
  using (not (select private.is_oauth_client())) with check (not (select private.is_oauth_client()));
create policy "conector do Claude sem briefing" on public.briefing_immersions
  as restrictive for all to authenticated
  using (not (select private.is_oauth_client())) with check (not (select private.is_oauth_client()));

-- Formulário: a equipe lê, cria e muda (apagar, nunca: desativa). O cliente
-- lê o modelo do próprio briefing.
create policy "equipe vê o formulário" on public.briefing_templates
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe cria modelos" on public.briefing_templates
  for insert to authenticated with check ((select private.is_team_member()));
create policy "equipe muda modelos" on public.briefing_templates
  for update to authenticated using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "cliente vê o modelo do briefing dele" on public.briefing_templates
  for select to authenticated
  using (id in (select b.template_id from public.client_briefings b where b.id in (select private.my_briefing_ids())));

create policy "equipe vê os blocos" on public.briefing_blocks
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe cria blocos" on public.briefing_blocks
  for insert to authenticated with check ((select private.is_team_member()));
create policy "equipe muda blocos" on public.briefing_blocks
  for update to authenticated using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "cliente vê os blocos do briefing dele" on public.briefing_blocks
  for select to authenticated
  using (template_id in (select b.template_id from public.client_briefings b where b.id in (select private.my_briefing_ids())));

create policy "equipe vê as perguntas" on public.briefing_questions
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe cria perguntas" on public.briefing_questions
  for insert to authenticated with check ((select private.is_team_member()));
create policy "equipe muda perguntas" on public.briefing_questions
  for update to authenticated using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "cliente vê as perguntas do briefing dele" on public.briefing_questions
  for select to authenticated
  using (block_id in (
    select bl.id from public.briefing_blocks bl
      join public.client_briefings b on b.template_id = bl.template_id
     where b.id in (select private.my_briefing_ids())
  ));

-- Briefing do cliente: a equipe libera, muda e cancela; o cliente lê o dele e
-- muda só onde parou (o trigger confere as colunas).
create policy "equipe vê os briefings" on public.client_briefings
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe libera briefings" on public.client_briefings
  for insert to authenticated with check ((select private.is_team_member()));
create policy "equipe muda briefings" on public.client_briefings
  for update to authenticated using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "equipe cancela briefings" on public.client_briefings
  for delete to authenticated using ((select private.is_team_member()));
create policy "cliente vê o briefing dele" on public.client_briefings
  for select to authenticated using (id in (select private.my_briefing_ids()));
create policy "cliente marca onde parou" on public.client_briefings
  for update to authenticated
  using (id in (select private.my_open_briefing_ids()))
  with check (id in (select private.my_open_briefing_ids()));

-- Respostas: a equipe lê (e corrige, se precisar); o cliente lê as dele e
-- grava enquanto o briefing está aberto.
create policy "equipe vê as respostas" on public.briefing_answers
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe muda respostas" on public.briefing_answers
  for update to authenticated using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "cliente vê as respostas dele" on public.briefing_answers
  for select to authenticated using (briefing_id in (select private.my_briefing_ids()));
create policy "cliente responde" on public.briefing_answers
  for insert to authenticated with check (briefing_id in (select private.my_open_briefing_ids()));
create policy "cliente muda a resposta" on public.briefing_answers
  for update to authenticated
  using (briefing_id in (select private.my_open_briefing_ids()))
  with check (briefing_id in (select private.my_open_briefing_ids()));
create policy "cliente apaga a resposta" on public.briefing_answers
  for delete to authenticated using (briefing_id in (select private.my_open_briefing_ids()));

-- Áudios: a equipe ouve todos; o cliente ouve os dele e grava ou apaga
-- (regravar) enquanto o briefing está aberto.
create policy "equipe vê os áudios" on public.briefing_answer_audios
  for select to authenticated using ((select private.is_team_member()));
create policy "cliente vê os áudios dele" on public.briefing_answer_audios
  for select to authenticated using (briefing_id in (select private.my_briefing_ids()));
create policy "cliente grava áudio" on public.briefing_answer_audios
  for insert to authenticated with check (briefing_id in (select private.my_open_briefing_ids()));
create policy "cliente apaga áudio" on public.briefing_answer_audios
  for delete to authenticated using (briefing_id in (select private.my_open_briefing_ids()));

-- IA: só a equipe lê. Gravar é pelas funções da Parte 3 (com segredo).
create policy "equipe vê as transcrições" on public.briefing_transcriptions
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe vê os resumos" on public.briefing_summaries
  for select to authenticated using ((select private.is_team_member()));

-- Imersão: só a equipe.
create policy "equipe vê a imersão" on public.briefing_immersions
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe registra a imersão" on public.briefing_immersions
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe muda a imersão" on public.briefing_immersions
  for update to authenticated using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "equipe apaga a imersão" on public.briefing_immersions
  for delete to authenticated using ((select private.is_team_member()));

-- Storage: bucket privado `briefing` ---------------------------------------------
-- Caminho "<cliente>/<briefing>/<arquivo>". O cliente envia, lê e apaga só na
-- pasta do briefing dele (enviar e apagar só enquanto não enviou); a equipe
-- lê tudo e apaga (ao excluir o cliente).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'briefing', 'briefing', false, 52428800,
  array[
    'audio/webm', 'audio/ogg', 'audio/mp4', 'audio/aac', 'audio/mpeg', 'audio/x-m4a',
    'image/png', 'image/jpeg', 'image/webp', 'image/gif', 'image/svg+xml', 'image/heic', 'image/heif',
    'application/pdf',
    'video/mp4', 'video/quicktime', 'video/webm',
    'font/ttf', 'font/otf', 'font/woff', 'font/woff2',
    'application/zip', 'application/x-zip-compressed'
  ]
)
on conflict (id) do nothing;

create policy "cliente envia arquivos do briefing" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'briefing'
    and not (select private.is_oauth_client())
    and private.briefing_path_open(name)
  );
create policy "cliente apaga arquivos do briefing" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'briefing'
    and not (select private.is_oauth_client())
    and private.briefing_path_open(name)
  );
create policy "quem vê o briefing lê os arquivos" on storage.objects
  for select to authenticated
  using (
    bucket_id = 'briefing'
    and not (select private.is_oauth_client())
    and ((select private.is_team_member()) or private.briefing_path_mine(name))
  );
create policy "equipe apaga arquivos do briefing" on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'briefing'
    and not (select private.is_oauth_client())
    and (select private.is_team_member())
  );

-- Bloqueio do portal nas aprovações ---------------------------------------------
-- Mesmo corpo de antes (20261009000106_portal_content e 20261013125215_portal_v2),
-- com a checagem do briefing logo depois de achar o post ou a etapa.

create or replace function public.portal_review_post(target_post uuid, decision text, note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  post public.content_posts%rowtype;
  target_channel uuid;
  text_note text := nullif(trim(coalesce(note, '')), '');
  created uuid;
begin
  if decision not in ('approve', 'changes') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  if decision = 'changes' and text_note is null then
    raise exception 'note_required' using errcode = '22023';
  end if;
  if char_length(coalesce(text_note, '')) > 5000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;

  select * into post from public.content_posts p where p.id = target_post for update;
  if not found or not private.portal_can_see_post(target_post) then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  if private.briefing_locked(post.client_id) then
    raise exception 'briefing_pending' using errcode = 'P0001';
  end if;
  if post.stage <> 'client_review' then
    raise exception 'not_in_client_review' using errcode = 'P0001';
  end if;

  select ch.id into target_channel from public.channels ch where ch.client_id = post.client_id and ch.kind = 'client';
  if target_channel is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;

  update public.content_posts p
     set stage = case when decision = 'approve' then 'approved'::public.content_stage else 'internal_review'::public.content_stage end
   where p.id = target_post;

  insert into public.messages (channel_id, post_id, author_id, kind, body)
  values (
    target_channel,
    target_post,
    (select auth.uid()),
    case when decision = 'approve' then 'approval'::public.message_kind else 'change_request'::public.message_kind end,
    coalesce(text_note, 'Aprovado.')
  )
  returning id into created;
  return created;
end;
$$;

create or replace function public.portal_review_step(target_step uuid, decision text, note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  step public.tasks%rowtype;
  project public.projects%rowtype;
  target_channel uuid;
  text_note text := nullif(trim(coalesce(note, '')), '');
  created uuid;
begin
  if decision not in ('approve', 'changes') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  if decision = 'changes' and text_note is null then
    raise exception 'note_required' using errcode = '22023';
  end if;
  if char_length(coalesce(text_note, '')) > 4000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;

  select * into step from public.tasks t where t.id = target_step for update;
  if not found
    or step.project_id is null
    or not step.client_visible
    or not private.portal_can_see_project(step.project_id)
  then
    raise exception 'step_not_found' using errcode = 'P0002';
  end if;
  if not private.step_awaiting_client(step.client_approval_required, step.client_visible, step.status, step.client_approval) then
    raise exception 'not_awaiting_approval' using errcode = 'P0001';
  end if;

  select * into project from public.projects p where p.id = step.project_id;
  if private.briefing_locked(project.client_id) then
    raise exception 'briefing_pending' using errcode = 'P0001';
  end if;
  select ch.id into target_channel from public.channels ch where ch.client_id = project.client_id and ch.kind = 'client';
  if target_channel is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;

  update public.tasks t
     set client_approval = case when decision = 'approve' then 'approved' else 'changes' end::public.client_approval_result,
         client_approval_note = text_note,
         client_approval_by = (select auth.uid()),
         client_approval_at = now(),
         status = case when decision = 'approve' then t.status else 'doing'::public.task_status end
   where t.id = target_step;

  insert into public.messages (channel_id, project_id, task_id, author_id, kind, body)
  values (
    target_channel,
    project.id,
    step.id,
    (select auth.uid()),
    case when decision = 'approve' then 'approval'::public.message_kind else 'change_request'::public.message_kind end,
    case
      when decision = 'approve' and text_note is null then 'Aprovou a etapa “' || step.title || '”.'
      when decision = 'approve' then 'Aprovou a etapa “' || step.title || '”: ' || text_note
      else 'Pediu ajustes na etapa “' || step.title || '”: ' || text_note
    end
  )
  returning id into created;
  return created;
end;
$$;

-- Formulário v1 (30 perguntas em 6 blocos + identificação) -----------------------

do $seed$
declare
  template uuid;
  block uuid;
begin
  insert into public.briefing_templates (name, version, active)
  values ('Briefing de onboarding', 1, true)
  returning id into template;

  -- 0. Identificação ----------------------------------------------------------
  insert into public.briefing_blocks (template_id, position, title, description, estimated_minutes)
  values (template, 0, 'Pra começar', 'Confere se a gente anotou tudo certinho.', 1)
  returning id into block;

  insert into public.briefing_questions (block_id, position, key, text, hint, kind, options, required) values
  (block, 1, 'identification', 'Esses dados estão certos?',
   'A gente já preencheu com o que você contou. Ajusta o que precisar.',
   'identification',
   '{"fields": [
      {"key": "brand_name", "label": "Nome da marca", "placeholder": "Ex.: Doceria da Ana"},
      {"key": "contact_name", "label": "Quem responde pela marca", "placeholder": "Ex.: Ana Souza"},
      {"key": "region", "label": "Cidade ou região que vocês atendem", "placeholder": "Ex.: Curitiba e região"},
      {"key": "instagram", "label": "@ do Instagram", "placeholder": "Ex.: @doceriadaana"},
      {"key": "site", "label": "Site (se tiver)", "placeholder": "Ex.: doceriadaana.com.br"}
    ]}'::jsonb,
   true);

  -- 1. Negócio e prioridades --------------------------------------------------
  insert into public.briefing_blocks (template_id, position, title, description, estimated_minutes)
  values (template, 1, 'Negócio e prioridades', 'O que você vende e o que precisa vender mais agora.', 6)
  returning id into block;

  insert into public.briefing_questions (block_id, position, key, text, hint, kind, options, required) values
  (block, 1, 'brand_age', 'Há quanto tempo a marca existe?',
   'Conta desde quando você começou a vender, mesmo que informal.',
   'choice',
   '{"choices": [
      {"value": "starting", "label": "Começando agora"},
      {"value": "up_to_1y", "label": "Até 1 ano"},
      {"value": "1_3y", "label": "De 1 a 3 anos"},
      {"value": "3_10y", "label": "De 3 a 10 anos"},
      {"value": "over_10y", "label": "Mais de 10 anos"}
    ]}'::jsonb,
   true),
  (block, 2, 'offer', 'O que você vende? Fala dos principais produtos ou serviços.',
   'Ex.: "Bolos de festa sob encomenda, doces finos pra casamento e uma linha de pote pra pronta entrega."',
   'audio', '{}'::jsonb, true),
  (block, 3, 'focus_offer', 'Qual oferta você quer vender mais agora? E qual dá mais lucro por venda, se souber?',
   'Ex.: "Quero vender mais o kit festa. O que mais dá lucro é o doce fino."',
   'audio', '{}'::jsonb, true),
  (block, 4, 'average_ticket', 'Quanto o cliente gasta, em média, por compra?',
   'Um valor aproximado já ajuda. Ex.: R$ 180.',
   'number', '{"unit": "BRL", "placeholder": "180,00"}'::jsonb, false),
  (block, 5, 'price_position', 'Perto dos concorrentes, seu preço está…',
   'Vale o que você sente na conversa com os clientes.',
   'choice',
   '{"choices": [
      {"value": "lower", "label": "Mais acessível"},
      {"value": "average", "label": "Na média"},
      {"value": "higher", "label": "Acima da média"},
      {"value": "unknown", "label": "Não sei"}
    ]}'::jsonb,
   true),
  (block, 6, 'discovery', 'Como as pessoas descobrem a sua marca?',
   'Marca até duas, as que mais trazem gente.',
   'multiple',
   '{"max": 2, "other": true,
     "choices": [
      {"value": "client_referral", "label": "Indicação de clientes"},
      {"value": "google", "label": "Google ou Maps"},
      {"value": "organic_social", "label": "Redes sociais, sem anúncio"},
      {"value": "paid_ads", "label": "Anúncios pagos"},
      {"value": "walk_in", "label": "Passam em frente"},
      {"value": "partner_referral", "label": "Indicação de parceiros"},
      {"value": "unknown", "label": "Não sei"}
     ],
     "extras": [
      {"key": "share", "kind": "short_text", "label": "Se souber, quanto vem de cada um?", "placeholder": "Ex.: 70% indicação, 30% Instagram"}
     ]}'::jsonb,
   true),
  (block, 7, 'sales_channel', 'Onde a compra ou o agendamento costuma acontecer?',
   'O lugar onde o "fechado!" acontece.',
   'choice',
   '{"other": true,
     "choices": [
      {"value": "whatsapp", "label": "WhatsApp"},
      {"value": "direct", "label": "Direct do Instagram"},
      {"value": "site", "label": "Site ou loja virtual"},
      {"value": "in_person", "label": "Presencial"},
      {"value": "phone", "label": "Telefone"}
     ]}'::jsonb,
   true),
  (block, 8, 'why_boop', 'O que fez você buscar a Boop agora?',
   'Pode ser bem sincero. Ex.: "Postava quando dava e cansei de não ver resultado."',
   'audio', '{"voice": "essential"}'::jsonb, true),
  (block, 9, 'goal_90d', 'Qual resultado das redes faria mais diferença nos próximos 90 dias?',
   'Escolhe o principal. Se tiver um número em mente, melhor ainda.',
   'choice',
   '{"other": true,
     "choices": [
      {"value": "more_quotes", "label": "Mais pedidos de orçamento"},
      {"value": "full_schedule", "label": "Agenda cheia"},
      {"value": "sell_offer", "label": "Vender uma oferta específica"},
      {"value": "bring_back", "label": "Trazer clientes de volta"},
      {"value": "local_awareness", "label": "Ser mais conhecida na região"}
     ],
     "extras": [
      {"key": "target", "kind": "short_text", "label": "Tem uma meta em números?", "placeholder": "Ex.: 20 orçamentos por mês"}
     ]}'::jsonb,
   true);

  -- 2. Quem compra ------------------------------------------------------------
  insert into public.briefing_blocks (template_id, position, title, description, estimated_minutes)
  values (template, 2, 'Quem compra', 'Quem é o seu cliente e como ele decide.', 5)
  returning id into block;

  insert into public.briefing_questions (block_id, position, key, text, hint, kind, options, required) values
  (block, 1, 'dream_client', 'Qual cliente você adoraria atender de novo? O que ele comprou, o que valorizou, por que repetiria?',
   'Pensa numa pessoa de verdade. Ex.: "A Júlia, que fez o bolo do casamento e voltou pro chá de bebê."',
   'audio', '{"voice": "essential"}'::jsonb, true),
  (block, 2, 'unwanted', 'Que pedidos você recusa ou que tipo de cliente não quer atrair?',
   'Ex.: "Quem só quer o mais barato" ou "pedido pra amanhã".',
   'audio', '{}'::jsonb, false),
  (block, 3, 'sale_conversation', 'Lembra de uma conversa que virou venda? O que a pessoa disse e o que você respondeu, do seu jeito.',
   'Pode contar como se estivesse mandando áudio pra uma amiga.',
   'audio', '{"voice": "essential"}'::jsonb, true),
  (block, 4, 'common_questions', 'Quais dúvidas se repetem antes de alguém fechar? Até três, do jeito que o cliente pergunta.',
   'Ex.: "Entrega no sábado?", "Dá pra parcelar?", "Serve quantas pessoas?"',
   'audio', '{}'::jsonb, true),
  (block, 5, 'hesitation', 'Quando alguém adia a decisão, o que mais pesa?',
   'Escolhe o que você mais ouve.',
   'choice',
   '{"other": true,
     "choices": [
      {"value": "price", "label": "Preço ou forma de pagamento"},
      {"value": "fit", "label": "Dúvida se serve pra ela"},
      {"value": "trust", "label": "Confiança"},
      {"value": "timing", "label": "Prazo ou agenda"},
      {"value": "distance", "label": "Distância"},
      {"value": "ask_someone", "label": "Precisa consultar alguém"},
      {"value": "unknown", "label": "Não sei"}
     ],
     "extras": [
      {"key": "phrase", "kind": "short_text", "label": "Uma frase que você já ouviu", "placeholder": "Ex.: \"Vou ver com meu marido e te falo\""}
     ]}'::jsonb,
   true),
  (block, 6, 'chosen_story', 'Conta um caso em que alguém escolheu você entre outras opções. O que você fez diferente?',
   'Ex.: "Ela tinha três orçamentos e fechou comigo porque mandei uma prova antes."',
   'audio', '{"voice": "essential"}'::jsonb, true);

  -- 3. História da marca --------------------------------------------------------
  insert into public.briefing_blocks (template_id, position, title, description, estimated_minutes)
  values (template, 3, 'História da marca', 'De onde a marca veio. Rapidinho.', 3)
  returning id into block;

  insert into public.briefing_questions (block_id, position, key, text, hint, kind, options, required) values
  (block, 1, 'origin', 'Como a marca começou? Conta do seu jeito.',
   'Ex.: "Comecei fazendo bolo pros vizinhos na pandemia e virou trabalho."',
   'audio', '{"voice": "essential"}'::jsonb, false),
  (block, 2, 'feeling', 'Complete: "Quem compra de mim sai daqui sentindo ___".',
   'Uma ou duas palavras. Ex.: "cuidada", "segura", "que valeu cada centavo".',
   'short_text', '{"placeholder": "sentindo…"}'::jsonb, false);

  -- 4. Como a marca fala ----------------------------------------------------------
  insert into public.briefing_blocks (template_id, position, title, description, estimated_minutes)
  values (template, 4, 'Como a marca fala', 'O jeito de falar que tem a sua cara.', 4)
  returning id into block;

  insert into public.briefing_questions (block_id, position, key, text, hint, kind, options, required) values
  (block, 1, 'brand_tone', 'Quais dessas aberturas você publicaria? Se marcar duas, qual é a principal?',
   'Lê como se fosse o primeiro post da sua marca. Assim sim ou assim não?',
   'cards',
   '{"max": 2, "primary": true,
     "cards": [
      {"value": "challenging", "label": "Desafiadora", "description": "Provoca e tira da zona de conforto.", "example": "Se o seu bolo é igual ao da padaria, por que alguém pagaria mais por ele?"},
      {"value": "calm", "label": "Calma", "description": "Explica sem pressa, passa tranquilidade.", "example": "Escolher o bolo da festa pode ser simples. A gente te mostra como, passo a passo."},
      {"value": "warm", "label": "Acolhedora", "description": "Abraça, cuida, entende a pessoa.", "example": "Sabe aquele dia em que tudo precisa dar certo? A gente cuida do doce pra você cuidar do resto."},
      {"value": "close", "label": "Próxima", "description": "Fala como amiga, de igual pra igual.", "example": "Conta aqui: você também já comeu o recheio antes de montar o bolo?"},
      {"value": "playful", "label": "Bem-humorada", "description": "Leve, com piada e graça.", "example": "Dieta começa segunda. Hoje é sábado e tem brigadeiro saindo do forno."},
      {"value": "direct", "label": "Direta", "description": "Vai ao ponto, sem rodeio.", "example": "Bolo de festa por encomenda. Pedido com 5 dias de antecedência. Chama no WhatsApp."},
      {"value": "technical", "label": "Técnica", "description": "Mostra o porquê, com detalhe e dado.", "example": "Por que o chocolate 54% deixa o ganache mais estável no calor? A temperatura explica."},
      {"value": "formal", "label": "Formal", "description": "Elegante e cuidadosa com as palavras.", "example": "Apresentamos a nova coleção de doces finos para casamentos, com degustação agendada."}
     ],
     "extras": [
      {"key": "own_opening", "kind": "short_text", "label": "Ou escreve uma abertura do seu jeito", "placeholder": "Ex.: Hoje tem fornada nova…"}
     ]}'::jsonb,
   true),
  (block, 2, 'challenge_level', 'Até onde um post pode desafiar quem está lendo?',
   'Pensa no que você ficaria confortável de ver publicado.',
   'choice',
   '{"choices": [
      {"value": "explain", "label": "Explicar sem provocar"},
      {"value": "question", "label": "Questionar com uma pergunta"},
      {"value": "disagree", "label": "Discordar e mostrar o porquê"},
      {"value": "depends", "label": "Conforme o assunto"}
    ]}'::jsonb,
   true),
  (block, 3, 'call_to_action', 'Como você convida a pessoa a dar o próximo passo?',
   'O jeito que você já usa no dia a dia.',
   'choice',
   '{"choices": [
      {"value": "open_conversation", "label": "Abrindo conversa", "example": "Me conta o que você está planejando?"},
      {"value": "guide_choice", "label": "Orientando a escolha", "example": "Pra 30 pessoas, o ideal é o bolo de 3 kg."},
      {"value": "direct_ask", "label": "Direto ao pedido", "example": "Garante o seu: chama no WhatsApp."},
      {"value": "depends", "label": "Depende"}
     ],
     "extras": [
      {"key": "own_way", "kind": "short_text", "label": "Ou conta o seu jeito", "placeholder": "Ex.: mando foto de outros bolos parecidos"}
     ]}'::jsonb,
   true),
  (block, 4, 'vocabulary', 'Palavras que você usa e palavras que prefere evitar',
   'Expressões, apelidos, gírias. E também assuntos ou promessas que não combinam com a marca.',
   'short_text',
   '{"fields": [
      {"key": "use", "label": "Palavras e expressões que você usa", "placeholder": "Ex.: \"fornada\", \"docinho\", \"feito à mão\""},
      {"key": "avoid", "label": "Palavras, assuntos e promessas a evitar", "placeholder": "Ex.: \"o melhor da cidade\", política, \"zero açúcar\""}
    ]}'::jsonb,
   false);

  -- 5. Gravação e aprovação ---------------------------------------------------------
  insert into public.briefing_blocks (template_id, position, title, description, estimated_minutes)
  values (template, 5, 'Gravação e aprovação', 'Como a gente produz e aprova junto.', 3)
  returning id into block;

  insert into public.briefing_questions (block_id, position, key, text, hint, kind, options, required) values
  (block, 1, 'approver', 'Quem aprova os conteúdos e em quanto tempo costuma responder?',
   'Quem dá o "pode postar" do lado de vocês.',
   'choice',
   '{"choices": [
      {"value": "1_day", "label": "Até 1 dia útil"},
      {"value": "2_days", "label": "Em 2 dias"},
      {"value": "3_5_days", "label": "De 3 a 5 dias"},
      {"value": "other", "label": "Outro"}
     ],
     "extras": [
      {"key": "name", "kind": "short_text", "label": "Nome de quem aprova", "placeholder": "Ex.: Ana", "required": true}
     ]}'::jsonb,
   true),
  (block, 2, 'production', 'O que vocês topam fazer para produzir conteúdo?',
   'Marca tudo o que rolaria sem sofrimento.',
   'multiple',
   '{"other": true,
     "choices": [
      {"value": "talk_to_camera", "label": "Eu falo pra câmera"},
      {"value": "team_appears", "label": "Alguém da equipe aparece"},
      {"value": "voice_only", "label": "Só voz"},
      {"value": "hands_products", "label": "Produtos, mãos e bastidores"},
      {"value": "photos_art", "label": "Começar com fotos e artes"}
     ]}'::jsonb,
   true),
  (block, 3, 'recording_frequency', 'Com que frequência dá pra separar um tempo pra gravar?',
   'Sendo realista com a sua rotina.',
   'choice',
   '{"choices": [
      {"value": "weekly", "label": "Toda semana"},
      {"value": "biweekly", "label": "A cada 15 dias"},
      {"value": "monthly", "label": "Uma vez por mês"},
      {"value": "sometimes", "label": "De vez em quando"},
      {"value": "none", "label": "Sem gravação por enquanto"}
     ],
     "extras": [
      {"key": "best_day", "kind": "short_text", "label": "Melhor dia pra gravar", "placeholder": "Ex.: terça de manhã"}
     ]}'::jsonb,
   true),
  (block, 4, 'calendar', 'O que já tem data nos próximos três meses? E quais épocas do ano são mais fortes ou mais fracas?',
   'Ex.: lançamento, feira, aniversário da marca, Páscoa, férias.',
   'dates',
   '{"extras": [
      {"key": "seasons", "kind": "audio", "label": "Épocas mais fortes ou mais fracas"}
    ]}'::jsonb,
   false);

  -- 6. Referências e materiais (todo opcional) ---------------------------------------
  insert into public.briefing_blocks (template_id, position, title, description, estimated_minutes)
  values (template, 6, 'Referências e materiais', 'Tudo opcional. O que tiver à mão já ajuda.', 3)
  returning id into block;

  insert into public.briefing_questions (block_id, position, key, text, hint, kind, options, required) values
  (block, 1, 'past_content', 'Que conteúdo já trouxe o resultado que você queria? E o que tentaram e não deu certo?',
   'Cola o link do post e conta o que aconteceu.',
   'links',
   '{"extras": [
      {"key": "story", "kind": "audio", "label": "O que deu certo e o que não deu"}
    ]}'::jsonb,
   false),
  (block, 2, 'competitors', 'Com quem seus clientes costumam comparar a sua marca?',
   'Um ou dois @ já bastam.',
   'links', '{"max": 2, "placeholder": "@concorrente"}'::jsonb, false),
  (block, 3, 'inspiration', 'Que perfil ou post dá vontade de fazer algo parecido? O que te atraiu?',
   'Pode ser de qualquer área, não só do seu mercado.',
   'links',
   '{"extras": [
      {"key": "why", "kind": "audio", "label": "O que te atraiu"}
    ]}'::jsonb,
   false),
  (block, 4, 'identity', 'Logo, fontes, paleta ou manual. Se a identidade está em aberto, quais cores você quer usar ou evitar?',
   'Arrasta os arquivos ou tira uma foto. Pra cores, toca na paleta.',
   'upload',
   '{"accept": ["image/*", "application/pdf", "font/*", "application/zip"],
     "extras": [
      {"key": "palette", "kind": "palette", "label": "Cores pra usar ou evitar"}
     ]}'::jsonb,
   false),
  (block, 5, 'media', 'Fotos e vídeos que podemos usar (você, equipe, espaço, produtos)',
   'Manda alguns aqui ou cola o link de uma pasta (Drive, Dropbox).',
   'upload',
   '{"accept": ["image/*", "video/*"],
     "extras": [
      {"key": "folder", "kind": "links", "label": "Link da pasta", "placeholder": "https://drive.google.com/…"}
     ]}'::jsonb,
   false);
end;
$seed$;
