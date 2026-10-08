-- Boop Admin: portal do cliente, fase 1 (base de acesso, sem telas).
--
-- O cliente entra no app com uma conta do Auth criada pela equipe e vê só o
-- que é dele. Ser da equipe continua sendo ter perfil em `profiles`, e um
-- perfil vê tudo; por isso a conta do cliente nunca tem perfil: ela fica em
-- `client_members`, ligada a um ou mais clientes, e as duas tabelas se
-- excluem (trava nos dois sentidos). Nenhuma política das tabelas da equipe
-- muda: o portal lê só por funções que devolvem os campos liberados.

-- Acessos ---------------------------------------------------------------------

create table public.client_members (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  -- Nome de quem acessa (ex.: "Barbara") e o e-mail da conta, guardado ao dar
  -- o acesso porque a equipe não lê `auth.users`.
  full_name text not null check (char_length(trim(full_name)) between 1 and 120),
  email text not null check (char_length(email) between 3 and 320),
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  constraint client_members_client_user_key unique (client_id, user_id)
);
comment on table public.client_members is
  'Contas de cliente com acesso ao portal (sem perfil em profiles). Uma conta pode ter mais de um cliente.';

create index client_members_user_id_idx on public.client_members (user_id);
create index client_members_created_by_idx on public.client_members (created_by);

-- Clientes da conta logada. security definer para as políticas e funções do
-- portal lerem `client_members` sem cair na política dela.
create function private.my_client_ids()
returns setof uuid
language sql
stable
security definer
set search_path = ''
as $$
  select m.client_id from public.client_members m where m.user_id = (select auth.uid());
$$;

revoke all on function private.my_client_ids() from public;
grant execute on function private.my_client_ids() to authenticated;

-- Trava: conta de cliente não é da equipe, e vice-versa ----------------------

create function private.guard_client_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Só o nome muda; quem é, de qual cliente, o e-mail e a autoria ficam.
    new.client_id := old.client_id;
    new.user_id := old.user_id;
    new.email := old.email;
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    return new;
  end if;
  if exists (select 1 from public.profiles p where p.id = new.user_id) then
    raise exception 'client_member_is_team' using errcode = '23514',
      hint = 'Esta conta é da equipe e já vê tudo; o portal é só para contas de cliente.';
  end if;
  return new;
end;
$$;

create trigger guard_client_member before insert or update on public.client_members
  for each row execute function private.guard_client_member();

create function private.guard_team_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if exists (select 1 from public.client_members m where m.user_id = new.id) then
    raise exception 'team_profile_is_client_member' using errcode = '23514',
      hint = 'Esta conta é de cliente; tire o acesso ao portal antes de dar perfil da equipe.';
  end if;
  return new;
end;
$$;

create trigger guard_team_profile before insert or update of id on public.profiles
  for each row execute function private.guard_team_profile();

-- Dar acesso ------------------------------------------------------------------

-- A equipe liga uma conta já criada no Auth (convite pelo painel do Supabase)
-- a um cliente, pelo e-mail. Sem service role no app: a função roda como dona
-- da tabela, mas só para quem é da equipe. Dar de novo só atualiza o nome.
create function public.link_client_member(target_client uuid, member_email text, member_name text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid;
  normalized text := lower(trim(member_email));
  member uuid;
begin
  if not private.is_team_member() then
    raise exception 'not_team_member' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients c where c.id = target_client) then
    raise exception 'client_not_found' using errcode = 'P0002';
  end if;
  if char_length(trim(coalesce(member_name, ''))) not between 1 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;

  select u.id into account from auth.users u where lower(u.email) = normalized;
  if account is null then
    raise exception 'account_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.profiles p where p.id = account) then
    raise exception 'account_is_team' using errcode = '23514';
  end if;

  insert into public.client_members (client_id, user_id, full_name, email, created_by)
  values (target_client, account, trim(member_name), normalized, (select auth.uid()))
  on conflict (client_id, user_id) do update set full_name = excluded.full_name
  returning id into member;

  return member;
end;
$$;

revoke execute on function public.link_client_member(uuid, text, text) from public, anon;
grant execute on function public.link_client_member(uuid, text, text) to authenticated;

-- Leitura do portal -----------------------------------------------------------

-- Os clientes (ativos) da conta logada, com o nome de quem acessa. É o que o
-- portal precisa para o cabeçalho e o seletor de cliente; nada além disso
-- sai de `clients`.
create function public.portal_my_clients()
returns table (client_id uuid, client_name text, avatar_path text, member_name text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.avatar_path, m.full_name
  from public.client_members m
  join public.clients c on c.id = m.client_id
  where m.user_id = (select auth.uid()) and c.active
  order by c.name;
$$;

revoke execute on function public.portal_my_clients() from public, anon;
grant execute on function public.portal_my_clients() to authenticated;

-- RLS -------------------------------------------------------------------------
-- A equipe vê, renomeia e tira acessos; dar acesso é só por link_client_member.
-- A conta do cliente lê só as próprias linhas.

alter table public.client_members enable row level security;

create policy "equipe e o próprio veem acessos" on public.client_members
  for select to authenticated
  using ((select private.is_team_member()) or user_id = (select auth.uid()));
create policy "equipe renomeia acessos" on public.client_members
  for update to authenticated
  using ((select private.is_team_member()))
  with check ((select private.is_team_member()));
create policy "equipe tira acessos" on public.client_members
  for delete to authenticated
  using ((select private.is_team_member()));
