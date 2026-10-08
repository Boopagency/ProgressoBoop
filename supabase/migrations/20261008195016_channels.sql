-- Boop Admin: canais de conversa (Comunicações estilo Slack), só a equipe.
--
-- Três tipos de canal:
--   - client: um por cliente ("Alterações – <cliente>"), criado sozinho quando
--     o cliente é cadastrado. É o fio de conversa com o cliente; uma mensagem
--     pode apontar para um post (o chat do post na Central de Conteúdo é este
--     mesmo fio, filtrado pelo post);
--   - internal: canais da equipe por assunto (ex.: "Financeiro");
--   - direct: conversa entre duas pessoas da equipe.
--
-- Pedidos de ajuste são mensagens do tipo change_request: viram tarefa
-- (messages.task_id) e ficam pendentes até alguém marcar como resolvido. A
-- tarefa concluída resolve o pedido (e reabrir a tarefa desfaz isso).
--
-- Só acrescenta: a tabela `communications` continua como está. Os registros
-- antigos aparecem no fio do canal do cliente pelo app, só para a equipe.
--
-- Fase 3 (portal do cliente): as políticas para o cliente entram depois, numa
-- migration própria, usando private.my_client_ids() (canais `client` dos
-- clientes da pessoa, as mensagens deles, escrever como ela mesma e a própria
-- leitura em channel_reads). Por isso o autor da mensagem e a leitura apontam
-- para auth.users, não para profiles. As políticas abaixo são só da equipe.

-- Tipos -----------------------------------------------------------------------

create type public.channel_kind as enum ('client', 'internal', 'direct');
create type public.message_kind as enum ('text', 'change_request', 'approval', 'system');

-- Canais ----------------------------------------------------------------------

create table public.channels (
  id uuid primary key default gen_random_uuid(),
  kind public.channel_kind not null,
  -- Só nos canais de cliente, um por cliente (os outros ficam vazios).
  client_id uuid unique references public.clients (id) on delete cascade,
  -- Nos de cliente, acompanha o nome do cliente; nas conversas diretas, vazio
  -- (o app mostra a outra pessoa).
  name text check (char_length(trim(name)) between 1 and 120),
  archived boolean not null default false,
  -- Vazio nos canais de cliente criados pelo banco sem uma pessoa logada.
  created_by uuid default auth.uid() references public.profiles (id) on delete set null,
  created_at timestamptz not null default now(),
  constraint channels_kind_client_check check ((kind = 'client') = (client_id is not null)),
  constraint channels_kind_name_check check ((kind = 'direct') = (name is null))
);
comment on table public.channels is
  'Canais de conversa: um por cliente, internos por assunto e conversas diretas entre duas pessoas.';

-- Quem participa dos canais internos e das conversas diretas. Os canais de
-- cliente são de toda a equipe e não usam esta tabela.
create table public.channel_members (
  channel_id uuid not null references public.channels (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (channel_id, user_id)
);
comment on table public.channel_members is 'Participantes dos canais internos e das conversas diretas.';

-- Mensagens -------------------------------------------------------------------

create table public.messages (
  id uuid primary key default gen_random_uuid(),
  channel_id uuid not null references public.channels (id) on delete cascade,
  -- Post de que a mensagem fala (só em canal de cliente, e do mesmo cliente:
  -- trigger). Excluir o post mantém a mensagem, sem o cartão.
  post_id uuid references public.content_posts (id) on delete set null,
  -- auth.users, não profiles: na fase 3 o cliente também escreve.
  author_id uuid default auth.uid() references auth.users (id) on delete set null,
  kind public.message_kind not null default 'text',
  body text not null check (char_length(trim(body)) between 1 and 5000),
  -- Pedido de ajuste resolvido (quando e por quem; o trigger preenche).
  resolved_at timestamptz,
  resolved_by uuid references auth.users (id) on delete set null,
  -- A tarefa em que o pedido virou.
  task_id uuid references public.tasks (id) on delete set null,
  created_at timestamptz not null default now(),
  edited_at timestamptz,
  constraint messages_resolved_check check (resolved_at is null or kind = 'change_request')
);
comment on table public.messages is
  'Mensagens dos canais: texto, pedidos de ajuste (viram tarefa, resolvidos ou pendentes), aprovações e avisos do sistema.';

-- Até onde cada pessoa leu cada canal (contador de não lidas).
create table public.channel_reads (
  user_id uuid not null references auth.users (id) on delete cascade,
  channel_id uuid not null references public.channels (id) on delete cascade,
  last_read_at timestamptz not null default now(),
  primary key (user_id, channel_id)
);
comment on table public.channel_reads is 'Última leitura de cada pessoa em cada canal (não lidas).';

-- Índices ---------------------------------------------------------------------

-- Nomes de canais internos sem repetir.
create unique index channels_internal_name_key on public.channels (lower(trim(name))) where kind = 'internal';
create index channels_created_by_idx on public.channels (created_by);
create index channel_members_user_id_idx on public.channel_members (user_id);
create index messages_channel_id_idx on public.messages (channel_id, created_at desc);
create index messages_post_id_idx on public.messages (post_id, created_at desc);
create index messages_task_id_idx on public.messages (task_id);
create index messages_pending_idx on public.messages (channel_id)
  where kind = 'change_request' and resolved_at is null;
create index messages_author_id_idx on public.messages (author_id);
create index messages_resolved_by_idx on public.messages (resolved_by);
create index channel_reads_channel_id_idx on public.channel_reads (channel_id);

-- Acesso ----------------------------------------------------------------------
-- security definer para as políticas consultarem canais e participantes sem
-- cair nas próprias políticas (sem recursão).

-- Canais que a pessoa da equipe enxerga: todos os de cliente e os internos e
-- diretos de que participa.
create function private.team_channel_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select c.id
    from public.channels c
   where (select private.is_team_member())
     and (
       c.kind = 'client'
       or exists (
         select 1 from public.channel_members m
          where m.channel_id = c.id and m.user_id = (select auth.uid())
       )
     );
$$;

-- Canal interno de que a pessoa participa: pode incluir e tirar participantes
-- (inclusive sair). Os participantes de uma conversa direta não mudam.
create function private.can_manage_channel_members(p_channel_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.channels c
      join public.channel_members m on m.channel_id = c.id
     where c.id = p_channel_id
       and c.kind = 'internal'
       and m.user_id = (select auth.uid())
  );
$$;

revoke all on function private.team_channel_ids() from public;
grant execute on function private.team_channel_ids() to authenticated;
revoke all on function private.can_manage_channel_members(uuid) from public;
grant execute on function private.can_manage_channel_members(uuid) to authenticated;

-- Triggers --------------------------------------------------------------------

-- Tipo, cliente, autoria e criação não mudam. O nome do canal de cliente
-- acompanha o cliente (só o trigger de clients o troca).
create function private.set_channel_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    new.created_at := now();
    return new;
  end if;
  new.kind := old.kind;
  new.client_id := old.client_id;
  -- Autor apagado (on delete set null, vindo do banco): deixa ficar vazio.
  if not (pg_trigger_depth() > 1 and new.created_by is null) then
    new.created_by := old.created_by;
  end if;
  new.created_at := old.created_at;
  if new.kind = 'client' and pg_trigger_depth() = 1 then
    new.name := old.name;
  end if;
  return new;
end;
$$;

create trigger set_channel_fields
  before insert or update on public.channels
  for each row execute function private.set_channel_fields();

-- Quem cria um canal interno já participa dele. O app cria o canal com o id
-- sorteado e sem RETURNING (antes do trigger, a pessoa ainda não o enxerga) e
-- depois inclui os outros participantes.
create function private.add_channel_creator()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.kind = 'internal' and new.created_by is not null then
    insert into public.channel_members (channel_id, user_id)
    values (new.id, new.created_by)
    on conflict do nothing;
  end if;
  return null;
end;
$$;

create trigger add_channel_creator
  after insert on public.channels
  for each row execute function private.add_channel_creator();

-- Canal do cliente: nasce com o cliente e acompanha o nome dele.
create function private.sync_client_channel()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    insert into public.channels (kind, client_id, name, created_by)
    values (
      'client',
      new.id,
      left('Alterações – ' || trim(new.name), 120),
      (select p.id from public.profiles p where p.id = (select auth.uid()))
    )
    on conflict (client_id) do nothing;
  elsif new.name is distinct from old.name then
    update public.channels
       set name = left('Alterações – ' || trim(new.name), 120)
     where client_id = new.id and kind = 'client';
  end if;
  return null;
end;
$$;

create trigger sync_client_channel
  after insert or update of name on public.clients
  for each row execute function private.sync_client_channel();

-- Participantes só de canais internos e diretos.
create function private.check_channel_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.channels c where c.id = new.channel_id and c.kind = 'client') then
    raise exception 'O canal do cliente é de toda a equipe.' using errcode = '22023';
  end if;
  return new;
end;
$$;

create trigger check_channel_member
  before insert on public.channel_members
  for each row execute function private.check_channel_member();

-- Mensagem: canal, autor e criação não mudam; texto, tipo e post só quem
-- escreveu muda (o tipo só entre texto e pedido de ajuste, que qualquer um da
-- equipe pode marcar); edited_at quando o texto muda; resolved_by e
-- resolved_at pelo banco; o post precisa ser do cliente do canal; canal
-- arquivado não recebe mensagem nova.
create function private.set_message_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  ch public.channels%rowtype;
  post_client uuid;
begin
  new.body := trim(new.body);
  if tg_op = 'UPDATE' then
    new.id := old.id;
    new.channel_id := old.channel_id;
    -- Conta apagada (on delete set null, vindo do banco): deixa ficar vazio.
    if not (pg_trigger_depth() > 1 and new.author_id is null) then
      new.author_id := old.author_id;
    end if;
    new.created_at := old.created_at;
    -- Ajustes do próprio banco (post trocado de cliente, tarefa concluída)
    -- passam direto.
    if pg_trigger_depth() = 1 then
      if (new.body is distinct from old.body or new.post_id is distinct from old.post_id)
        and old.author_id is distinct from (select auth.uid())
      then
        raise exception 'Só quem escreveu pode editar a mensagem.' using errcode = '42501';
      end if;
      if new.kind <> old.kind
        and not (old.kind in ('text', 'change_request') and new.kind in ('text', 'change_request'))
      then
        raise exception 'Esse tipo de mensagem não pode mudar.' using errcode = '22023';
      end if;
    end if;
    new.edited_at := case when new.body is distinct from old.body then clock_timestamp() else old.edited_at end;
  else
    new.created_at := clock_timestamp();
    new.edited_at := null;
  end if;

  select * into ch from public.channels c where c.id = new.channel_id;
  if tg_op = 'INSERT' and ch.archived then
    raise exception 'Este canal está arquivado.' using errcode = '22023';
  end if;
  if new.post_id is not null and (tg_op = 'INSERT' or new.post_id is distinct from old.post_id) then
    select p.client_id into post_client from public.content_posts p where p.id = new.post_id;
    if ch.kind <> 'client' or post_client is distinct from ch.client_id then
      raise exception 'O post precisa ser do cliente deste canal.' using errcode = '23514';
    end if;
  end if;

  -- Resolvido: só pedido de ajuste; quem e quando, pelo banco.
  if new.kind <> 'change_request' or new.resolved_at is null then
    new.resolved_at := null;
    new.resolved_by := null;
  elsif tg_op = 'INSERT' or old.resolved_at is null then
    new.resolved_at := now();
    new.resolved_by := (select auth.uid());
  else
    new.resolved_at := old.resolved_at;
    if not (pg_trigger_depth() > 1 and new.resolved_by is null) then
      new.resolved_by := old.resolved_by;
    end if;
  end if;
  return new;
end;
$$;

create trigger set_message_fields
  before insert or update on public.messages
  for each row execute function private.set_message_fields();

-- Tarefa concluída resolve os pedidos de ajuste ligados a ela; reabrir a
-- tarefa volta a deixá-los pendentes (só os que ela resolveu: mesma hora da
-- conclusão; os resolvidos à mão continuam resolvidos).
create function private.resolve_task_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status = 'done' and old.status <> 'done' then
    update public.messages m
       set resolved_at = new.completed_at
     where m.task_id = new.id
       and m.kind = 'change_request'
       and m.resolved_at is null;
  elsif old.status = 'done' and new.status <> 'done' and old.completed_at is not null then
    update public.messages m
       set resolved_at = null
     where m.task_id = new.id
       and m.resolved_at = old.completed_at;
  end if;
  return null;
end;
$$;

create trigger resolve_task_messages
  after update of status on public.tasks
  for each row execute function private.resolve_task_messages();

-- Post levado para outro cliente: as mensagens ficam no canal em que foram
-- escritas (a conversa é daquele cliente), sem o cartão do post.
create function private.unlink_post_messages()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.client_id is distinct from old.client_id then
    update public.messages m
       set post_id = null
     where m.post_id = new.id
       and m.channel_id not in (
         select c.id from public.channels c where c.kind = 'client' and c.client_id = new.client_id
       );
  end if;
  return null;
end;
$$;

create trigger unlink_post_messages
  after update of client_id on public.content_posts
  for each row execute function private.unlink_post_messages();

-- Funções expostas --------------------------------------------------------------

-- Abre (ou cria) a conversa direta com outra pessoa da equipe: uma por par.
-- security definer porque é o único caminho para criar conversa direta e
-- seus participantes (as políticas não deixam). Confere que quem chama e a
-- outra pessoa são da equipe. Reabre a conversa se estava arquivada.
create function public.open_direct_channel(profile_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  found_id uuid;
begin
  if me is null or not private.is_team_member() then
    raise exception 'Sem acesso.' using errcode = '42501';
  end if;
  if open_direct_channel.profile_id is null or open_direct_channel.profile_id = me then
    raise exception 'Escolha outra pessoa da equipe.' using errcode = '22023';
  end if;
  if not exists (select 1 from public.profiles p where p.id = open_direct_channel.profile_id) then
    raise exception 'Essa pessoa não está na equipe.' using errcode = 'P0002';
  end if;

  -- Duas pessoas abrindo a mesma conversa ao mesmo tempo: uma espera a outra.
  perform pg_advisory_xact_lock(hashtextextended(
    'direct:' || least(me, open_direct_channel.profile_id)::text
      || ':' || greatest(me, open_direct_channel.profile_id)::text,
    0
  ));

  select c.id into found_id
    from public.channels c
   where c.kind = 'direct'
     and exists (select 1 from public.channel_members m where m.channel_id = c.id and m.user_id = me)
     and exists (
       select 1 from public.channel_members m
        where m.channel_id = c.id and m.user_id = open_direct_channel.profile_id
     )
   order by c.created_at
   limit 1;

  if found_id is not null then
    update public.channels c set archived = false where c.id = found_id and c.archived;
    return found_id;
  end if;

  insert into public.channels (kind, created_by) values ('direct', me) returning id into found_id;
  insert into public.channel_members (channel_id, user_id)
  values (found_id, me), (found_id, open_direct_channel.profile_id);
  return found_id;
end;
$$;

revoke execute on function public.open_direct_channel(uuid) from public, anon;
grant execute on function public.open_direct_channel(uuid) to authenticated;

-- Por canal ativo que a pessoa enxerga: mensagens não lidas (dos outros,
-- depois da última leitura), pedidos de ajuste pendentes e a última
-- mensagem. security invoker: o RLS de quem chama vale para tudo.
create function public.channel_counts()
returns table (channel_id uuid, unread integer, pending integer, last_message_at timestamptz)
language sql
stable
security invoker
set search_path = ''
as $$
  select c.id,
         (select count(*)::integer
            from public.messages m
           where m.channel_id = c.id
             and m.author_id is distinct from (select auth.uid())
             and m.created_at > coalesce(r.last_read_at, '-infinity'::timestamptz)),
         (select count(*)::integer
            from public.messages m
           where m.channel_id = c.id
             and m.kind = 'change_request'
             and m.resolved_at is null),
         (select max(m.created_at) from public.messages m where m.channel_id = c.id)
    from public.channels c
    left join public.channel_reads r
      on r.channel_id = c.id and r.user_id = (select auth.uid())
   where not c.archived;
$$;

revoke execute on function public.channel_counts() from public, anon;
grant execute on function public.channel_counts() to authenticated;

-- Canais dos clientes que já existem ------------------------------------------

insert into public.channels (kind, client_id, name)
select 'client', c.id, left('Alterações – ' || trim(c.name), 120)
  from public.clients c
on conflict (client_id) do nothing;

-- RLS -------------------------------------------------------------------------
-- Só a equipe (fase 3: as políticas do cliente entram depois, com
-- private.my_client_ids()). Canais de cliente: toda a equipe; internos e
-- diretos: só quem participa. Cada um escreve como ele mesmo e edita ou apaga
-- só as próprias mensagens; marcar como resolvido, ligar a tarefa e marcar
-- como pedido de ajuste vale para qualquer mensagem que a pessoa enxerga (o
-- trigger set_message_fields separa o que é só do autor).

alter table public.channels enable row level security;
alter table public.channel_members enable row level security;
alter table public.messages enable row level security;
alter table public.channel_reads enable row level security;

create policy "equipe vê os canais" on public.channels
  for select to authenticated
  using ((select private.is_team_member()) and id in (select private.team_channel_ids()));
-- Canais de cliente nascem com o cliente; conversas diretas, por
-- open_direct_channel. Pela API, só canais internos.
create policy "equipe cria canais internos" on public.channels
  for insert to authenticated
  with check ((select private.is_team_member()) and kind = 'internal' and created_by = (select auth.uid()));
create policy "equipe edita os canais que vê" on public.channels
  for update to authenticated
  using ((select private.is_team_member()) and id in (select private.team_channel_ids()))
  with check ((select private.is_team_member()) and id in (select private.team_channel_ids()));
create policy "participantes excluem canais internos" on public.channels
  for delete to authenticated
  using ((select private.is_team_member()) and kind = 'internal' and id in (select private.team_channel_ids()));

create policy "equipe vê os participantes" on public.channel_members
  for select to authenticated
  using ((select private.is_team_member()) and channel_id in (select private.team_channel_ids()));
create policy "participantes incluem pessoas" on public.channel_members
  for insert to authenticated
  with check ((select private.is_team_member()) and private.can_manage_channel_members(channel_id));
create policy "participantes tiram pessoas ou saem" on public.channel_members
  for delete to authenticated
  using ((select private.is_team_member()) and private.can_manage_channel_members(channel_id));

create policy "equipe vê as mensagens" on public.messages
  for select to authenticated
  using ((select private.is_team_member()) and channel_id in (select private.team_channel_ids()));
create policy "equipe escreve como ela mesma" on public.messages
  for insert to authenticated
  with check (
    (select private.is_team_member())
    and author_id = (select auth.uid())
    and kind <> 'system'
    and channel_id in (select private.team_channel_ids())
  );
create policy "equipe atualiza as mensagens que vê" on public.messages
  for update to authenticated
  using ((select private.is_team_member()) and channel_id in (select private.team_channel_ids()))
  with check ((select private.is_team_member()) and channel_id in (select private.team_channel_ids()));
create policy "cada um apaga as próprias mensagens" on public.messages
  for delete to authenticated
  using (
    (select private.is_team_member())
    and author_id = (select auth.uid())
    and channel_id in (select private.team_channel_ids())
  );

create policy "cada um cuida da própria leitura" on public.channel_reads
  for all to authenticated
  using (
    (select private.is_team_member())
    and user_id = (select auth.uid())
    and channel_id in (select private.team_channel_ids())
  )
  with check (
    (select private.is_team_member())
    and user_id = (select auth.uid())
    and channel_id in (select private.team_channel_ids())
  );
