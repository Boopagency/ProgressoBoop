-- Boop Admin: preparar o briefing antes de liberar e a equipe responder pelo
-- cliente (issue #108, "a Boop não pergunta de novo o que já sabe").
--
--   * status novo `preparing`: a equipe cria o briefing do cliente sem
--     liberar. Nesse estado o portal não trava (`briefing_locked`) e o cliente
--     não vê nada (`my_briefing_ids`, `my_open_briefing_ids` e, por elas, o
--     RLS das respostas, dos áudios, do formulário e do Storage). Ao liberar,
--     a equipe muda para `not_started` e o prazo conta a partir daí;
--   * a equipe grava respostas (política de insert nova) e envia arquivos ao
--     bucket `briefing`, na pasta do briefing (política de insert nova);
--   * `briefing_answers` sabe quem preencheu: `filled_by_team` diz que o
--     conteúdo atual veio da Boop e o cliente ainda não confirmou nem mudou;
--     `team_filled_by`/`team_filled_at` guardam a última gravação da equipe
--     (ficam depois que o cliente confirma). Quem grava é o trigger
--     `prepare_briefing_answer`, nunca o app.
--
-- Aditivo: nenhuma tabela, coluna, função ou política sai; as funções são
-- trocadas por `create or replace` com a mesma assinatura. O valor novo do
-- enum é comparado como texto nas funções, para a migration rodar numa
-- transação só.

alter type public.briefing_status add value if not exists 'preparing' before 'not_started';

-- Respostas: quem preencheu ------------------------------------------------------

alter table public.briefing_answers
  add column if not exists filled_by_team boolean not null default false,
  -- Sem chave estrangeira: é histórico, e a pessoa pode sair da equipe.
  add column if not exists team_filled_by uuid,
  add column if not exists team_filled_at timestamptz;

comment on column public.briefing_answers.filled_by_team is
  'O conteúdo atual foi preenchido pela Boop e o cliente ainda não confirmou nem mudou. Gravado pelo banco.';
comment on column public.briefing_answers.team_filled_by is
  'Quem da equipe gravou a resposta por último (fica depois que o cliente confirma). Gravado pelo banco.';
comment on column public.briefing_answers.team_filled_at is
  'Quando a equipe gravou a resposta por último. Gravado pelo banco.';

-- Cliente: o briefing em preparação não existe para ele ---------------------------

create or replace function private.my_briefing_ids()
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
     and b.status::text <> 'preparing';
$$;

-- Já ignoravam o `preparing` (só aceitam liberado e não enviado); o corpo é o
-- mesmo de antes, escrito por texto para deixar a regra à vista.
create or replace function private.my_open_briefing_ids()
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
     and b.status::text in ('not_started', 'in_progress');
$$;

create or replace function private.briefing_locked(target_client uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_briefings b
     where b.client_id = target_client
       and b.status::text in ('not_started', 'in_progress')
  );
$$;

-- A resposta ------------------------------------------------------------------------
-- Mesmo corpo de antes (20261107150000_briefing), com:
--   * a cópia da pergunta acompanhando a pergunta também em `preparing`;
--   * a marca de quem preencheu. Pela equipe: `filled_by_team`, quem e quando;
--     `answered_by` (o cliente) fica vazio na resposta nova e é mantido na
--     correção. Pelo cliente: `answered_by` é ele e `filled_by_team` cai
--     (confirmou ou mudou); o histórico da equipe fica.

create or replace function private.prepare_briefing_answer()
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

  -- Enquanto o briefing não foi enviado, a cópia acompanha a pergunta
  -- mostrada; depois de enviado, quem muda (a equipe) não mexe na cópia.
  if tg_op = 'INSERT' or briefing.status::text in ('preparing', 'not_started', 'in_progress') then
    new.question_snapshot := private.briefing_question_snapshot(new.question_id);
  else
    new.question_snapshot := old.question_snapshot;
  end if;

  if (select private.is_team_member()) then
    new.filled_by_team := true;
    new.team_filled_by := (select auth.uid());
    new.team_filled_at := now();
    if tg_op = 'INSERT' then
      new.answered_by := null;
    else
      new.answered_by := old.answered_by;
    end if;
  else
    new.answered_by := (select auth.uid());
    new.filled_by_team := false;
    if tg_op = 'INSERT' then
      new.team_filled_by := null;
      new.team_filled_at := null;
    else
      new.team_filled_by := old.team_filled_by;
      new.team_filled_at := old.team_filled_at;
    end if;
  end if;
  return new;
end;
$$;
revoke all on function private.prepare_briefing_answer() from public;

-- RLS: a equipe responde pelo cliente ------------------------------------------------
-- (ler e mudar a equipe já podia; faltava criar a resposta.)

create policy "equipe preenche respostas" on public.briefing_answers
  for insert to authenticated with check ((select private.is_team_member()));

-- Storage: a equipe envia arquivos na pasta de um briefing que existe
-- ("<cliente>/<briefing>/..."). Ler e tirar a equipe já podia.

create policy "equipe envia arquivos do briefing" on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'briefing'
    and not (select private.is_oauth_client())
    and (select private.is_team_member())
    and coalesce(name ~ '^[0-9a-f-]{36}/[0-9a-f-]{36}/', false)
    and exists (
      select 1 from public.client_briefings b
       where b.id::text = split_part(name, '/', 2)
         and b.client_id::text = split_part(name, '/', 1)
    )
  );
