-- Boop Admin: Instagram dos clientes, parte 1/3 (conectar a conta).
--
-- A equipe, na página do cliente, ou a própria cliente, no portal, conecta a
-- conta profissional do Instagram (Empresa ou Criador de conteúdo) pelo OAuth
-- da Meta ("API do Instagram com login do Instagram"). O app troca o código
-- pelo token longo (60 dias) no servidor e grava aqui por
-- save_instagram_account, com a sessão de quem conectou.
--
-- O token nunca sai para o navegador nem para a conta do cliente: fica em
-- `private.social_account_tokens` (fora da API, sem política) e só funções
-- security definer o leem. `public.social_accounts` tem o que a tela mostra
-- (o @, a foto, o tipo, quando vence o token, o status): a equipe vê todas, o
-- cliente vê a da própria conta no portal.
--
-- Trabalho sem sessão (o mesmo desenho das notificações push): o pg_cron
-- chama private.run_instagram_job, que manda um POST (pg_net) para a rota
-- /api/instagram/jobs do app com o segredo do Vault. A rota pede ao banco os
-- tokens que precisam de renovação (instagram_tokens_to_refresh), renova com a
-- Meta e devolve (instagram_token_refreshed / instagram_token_failed); essas
-- funções conferem o mesmo segredo. Endereço e segredo ficam no Vault
-- (`instagram_jobs_url` e `instagram_jobs_secret`); sem eles, nada sai e nada
-- falha. instagram_account_token fica pronto para os próximos jobs (publicar
-- e métricas): devolve o token de um cliente para quem tem o segredo. Os
-- avisos da Meta (desautorizar, excluir dados) apagam a conta por
-- instagram_forget_user, com o mesmo segredo.

create extension if not exists pg_cron with schema pg_catalog;
grant usage on schema cron to postgres;
grant all privileges on all tables in schema cron to postgres;
create extension if not exists pg_net with schema extensions;

-- Contas conectadas ----------------------------------------------------------

create table public.social_accounts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  -- Por enquanto só o Instagram; TikTok e LinkedIn ficam para depois.
  network text not null default 'instagram' check (network in ('instagram')),
  -- Id da conta profissional no Instagram (`user_id` do /me), usado para publicar.
  external_user_id text not null check (char_length(external_user_id) between 1 and 64),
  -- Id da pessoa no app (`id` do /me, `user_id` da troca do código): é o que
  -- a Meta manda no `signed_request` ao desautorizar ou pedir exclusão.
  app_user_id text check (char_length(app_user_id) between 1 and 64),
  -- Sem @, como em clients.instagram_handle.
  username text not null check (username ~ '^[A-Za-z0-9._]{1,30}$'),
  display_name text check (char_length(display_name) <= 120),
  -- Endereço da foto no CDN da Meta (muda com o tempo; atualiza ao reconectar).
  profile_picture_url text check (char_length(profile_picture_url) <= 2000 and profile_picture_url ~ '^https://'),
  -- Business ou Media_Creator na Meta. Conta pessoal não chega aqui.
  account_type text not null check (account_type in ('business', 'media_creator')),
  -- Permissões que a pessoa autorizou (pode desmarcar alguma na tela da Meta).
  permissions text[] not null default '{}' check (cardinality(permissions) <= 20),
  -- connected: token válido; refresh_failed: a renovação falhou e tenta de
  -- novo no dia seguinte; expired: venceu ou foi revogado, só reconectando.
  status text not null default 'connected' check (status in ('connected', 'refresh_failed', 'expired')),
  token_expires_at timestamptz not null,
  token_refreshed_at timestamptz not null default now(),
  last_error text check (char_length(last_error) <= 500),
  connected_at timestamptz not null default now(),
  connected_by uuid references auth.users (id) on delete set null,
  -- Nome de quem conectou (equipe ou cliente), porque a equipe não lê auth.users.
  connected_by_name text not null check (char_length(connected_by_name) between 1 and 120),
  updated_at timestamptz not null default now(),
  constraint social_accounts_client_network_key unique (client_id, network)
);
comment on table public.social_accounts is
  'Contas de redes sociais conectadas por cliente (Instagram). Sem token: ele fica em private.social_account_tokens. Gravadas só pelas funções.';

create index social_accounts_connected_by_idx on public.social_accounts (connected_by);
create index social_accounts_token_expires_at_idx on public.social_accounts (token_expires_at);
create index social_accounts_app_user_id_idx on public.social_accounts (app_user_id);
create index social_accounts_external_user_id_idx on public.social_accounts (external_user_id);

alter table public.social_accounts enable row level security;

-- Só leitura pela API: conectar, renovar e desconectar passam pelas funções.
revoke insert, update, delete, truncate on public.social_accounts from anon, authenticated;
revoke all on public.social_accounts from anon;

create policy "equipe vê as contas conectadas" on public.social_accounts
  for select to authenticated
  using ((select private.is_team_member()));
create policy "cliente vê a própria conta conectada" on public.social_accounts
  for select to authenticated
  using (client_id in (select private.my_client_ids()));

-- O token, fora da API ---------------------------------------------------------

create table private.social_account_tokens (
  account_id uuid primary key references public.social_accounts (id) on delete cascade,
  access_token text not null check (char_length(access_token) between 1 and 2000),
  updated_at timestamptz not null default now()
);
comment on table private.social_account_tokens is
  'Token longo de cada conta conectada. Ninguém lê pela API; só as funções security definer.';

alter table private.social_account_tokens enable row level security;
revoke all on private.social_account_tokens from public, anon, authenticated;

-- Conectar e desconectar (com a sessão) --------------------------------------

-- Quem está logado pode mexer na conta deste cliente: equipe, ou conta de
-- cliente ligada a ele (com o cliente ativo, como no portal). Devolve o nome
-- para registrar quem conectou; null quando não pode.
create function private.instagram_actor_name(p_client_id uuid)
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    (select p.full_name from public.profiles p where p.id = (select auth.uid())),
    (select m.full_name
       from public.client_members m
       join public.clients c on c.id = m.client_id
      where m.user_id = (select auth.uid()) and m.client_id = p_client_id and c.active
      limit 1)
  );
$$;

revoke all on function private.instagram_actor_name(uuid) from public;

-- O app chama depois de trocar o código pelo token longo e conferir no /me
-- que a conta é profissional. Reconectar troca a conta e o token.
create function public.save_instagram_account(
  p_client_id uuid,
  p_external_user_id text,
  p_app_user_id text,
  p_username text,
  p_display_name text,
  p_profile_picture_url text,
  p_account_type text,
  p_permissions text[],
  p_access_token text,
  p_expires_in integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  actor text;
  account uuid;
begin
  if me is null then
    raise exception 'Entre na sua conta para conectar o Instagram.' using errcode = '42501';
  end if;
  actor := private.instagram_actor_name(p_client_id);
  if actor is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if p_account_type not in ('business', 'media_creator') then
    raise exception 'personal_account' using errcode = '22023';
  end if;
  if p_expires_in is null or p_expires_in <= 0 then
    raise exception 'invalid_expiry' using errcode = '22023';
  end if;

  insert into public.social_accounts as a (
    client_id, network, external_user_id, app_user_id, username, display_name, profile_picture_url,
    account_type, permissions, status, token_expires_at, token_refreshed_at, last_error,
    connected_at, connected_by, connected_by_name, updated_at
  )
  values (
    p_client_id, 'instagram', p_external_user_id, left(nullif(p_app_user_id, ''), 64), p_username, left(nullif(trim(p_display_name), ''), 120),
    nullif(p_profile_picture_url, ''), p_account_type, coalesce(p_permissions, '{}'), 'connected',
    now() + make_interval(secs => p_expires_in), now(), null, now(), me, left(actor, 120), now()
  )
  on conflict (client_id, network) do update
    set external_user_id = excluded.external_user_id,
        app_user_id = excluded.app_user_id,
        username = excluded.username,
        display_name = excluded.display_name,
        profile_picture_url = excluded.profile_picture_url,
        account_type = excluded.account_type,
        permissions = excluded.permissions,
        status = 'connected',
        token_expires_at = excluded.token_expires_at,
        token_refreshed_at = now(),
        last_error = null,
        connected_at = now(),
        connected_by = excluded.connected_by,
        connected_by_name = excluded.connected_by_name,
        updated_at = now()
  returning a.id into account;

  insert into private.social_account_tokens (account_id, access_token)
  values (account, p_access_token)
  on conflict (account_id) do update set access_token = excluded.access_token, updated_at = now();

  -- O perfil do feed passa a mostrar o @ da conta conectada.
  update public.clients c
     set instagram_handle = p_username
   where c.id = p_client_id and c.instagram_handle is distinct from p_username;

  return account;
end;
$$;

revoke all on function public.save_instagram_account(uuid, text, text, text, text, text, text, text[], text, integer) from public, anon;
grant execute on function public.save_instagram_account(uuid, text, text, text, text, text, text, text[], text, integer) to authenticated;

-- Desconectar apaga a conta e o token (cascata). O @ do feed fica.
create function public.disconnect_instagram_account(p_client_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if private.instagram_actor_name(p_client_id) is null then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  with gone as (
    delete from public.social_accounts a
     where a.client_id = p_client_id and a.network = 'instagram'
    returning 1
  )
  select count(*)::integer into removed from gone;
  return removed > 0;
end;
$$;

revoke all on function public.disconnect_instagram_account(uuid) from public, anon;
grant execute on function public.disconnect_instagram_account(uuid) to authenticated;

-- Jobs sem sessão (segredo do Vault) -----------------------------------------

create function private.instagram_secret_ok(p_secret text)
returns boolean
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  secret text;
begin
  select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'instagram_jobs_secret';
  return secret is not null and p_secret is not distinct from secret;
end;
$$;

revoke all on function private.instagram_secret_ok(text) from public;

-- Tokens que vencem nos próximos 15 dias e já têm mais de 24 h (a Meta só
-- renova token com pelo menos um dia). Antes, marca os que já venceram. Com
-- o job diário, cada token tem umas 15 tentativas antes de vencer.
create function public.instagram_tokens_to_refresh(p_secret text)
returns table (account_id uuid, access_token text)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.instagram_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  update public.social_accounts a
     set status = 'expired', updated_at = now()
   where a.status <> 'expired' and a.token_expires_at <= now();
  return query
    select a.id, t.access_token
      from public.social_accounts a
      join private.social_account_tokens t on t.account_id = a.id
     where a.status <> 'expired'
       and a.token_expires_at <= now() + interval '15 days'
       and a.token_refreshed_at <= now() - interval '24 hours'
     order by a.token_expires_at
     limit 100;
end;
$$;

revoke all on function public.instagram_tokens_to_refresh(text) from public;
grant execute on function public.instagram_tokens_to_refresh(text) to anon, authenticated;

create function public.instagram_token_refreshed(
  p_secret text,
  p_account_id uuid,
  p_access_token text,
  p_expires_in integer
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.instagram_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  if p_expires_in is null or p_expires_in <= 0 then
    raise exception 'invalid_expiry' using errcode = '22023';
  end if;
  update private.social_account_tokens t
     set access_token = p_access_token, updated_at = now()
   where t.account_id = p_account_id;
  update public.social_accounts a
     set status = 'connected',
         token_expires_at = now() + make_interval(secs => p_expires_in),
         token_refreshed_at = now(),
         last_error = null,
         updated_at = now()
   where a.id = p_account_id;
end;
$$;

revoke all on function public.instagram_token_refreshed(text, uuid, text, integer) from public;
grant execute on function public.instagram_token_refreshed(text, uuid, text, integer) to anon, authenticated;

-- A renovação falhou: tenta de novo amanhã, ou, se a Meta disse que o token
-- não vale mais (revogado, senha trocada), fica "expirado" até reconectar.
create function public.instagram_token_failed(
  p_secret text,
  p_account_id uuid,
  p_error text,
  p_expired boolean
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.instagram_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  update public.social_accounts a
     set status = case when p_expired then 'expired' else 'refresh_failed' end,
         last_error = left(p_error, 500),
         updated_at = now()
   where a.id = p_account_id;
end;
$$;

revoke all on function public.instagram_token_failed(text, uuid, text, boolean) from public;
grant execute on function public.instagram_token_failed(text, uuid, text, boolean) to anon, authenticated;

-- Para os próximos jobs (publicar, métricas): o token da conta de um cliente,
-- se ainda vale.
create function public.instagram_account_token(p_secret text, p_client_id uuid)
returns table (account_id uuid, external_user_id text, access_token text)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.instagram_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  return query
    select a.id, a.external_user_id, t.access_token
      from public.social_accounts a
      join private.social_account_tokens t on t.account_id = a.id
     where a.client_id = p_client_id
       and a.network = 'instagram'
       and a.status <> 'expired'
       and a.token_expires_at > now();
end;
$$;

revoke all on function public.instagram_account_token(text, uuid) from public;
grant execute on function public.instagram_account_token(text, uuid) to anon, authenticated;

-- A pessoa tirou o app no Instagram (desautorizar) ou pediu a exclusão dos
-- dados: a Meta avisa as rotas /api/instagram/deauthorize e /data-deletion,
-- que conferem o `signed_request` com a chave secreta do app e chamam aqui
-- com o segredo dos jobs. Apaga as contas daquela pessoa (e o token, em
-- cascata) em todos os clientes. Devolve quantas saíram.
create function public.instagram_forget_user(p_secret text, p_user_id text)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  removed integer;
begin
  if not private.instagram_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  if coalesce(p_user_id, '') = '' then
    return 0;
  end if;
  with gone as (
    delete from public.social_accounts a
     where a.network = 'instagram'
       and (a.app_user_id = p_user_id or a.external_user_id = p_user_id)
    returning 1
  )
  select count(*)::integer into removed from gone;
  return removed;
end;
$$;

revoke all on function public.instagram_forget_user(text, text) from public;
grant execute on function public.instagram_forget_user(text, text) to anon, authenticated;

-- Chama a rota de jobs do app. O POST sai depois do commit e não segura nada;
-- a rota responde na hora e faz o trabalho em seguida.
create function private.run_instagram_job(p_job text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text;
  secret text;
begin
  select s.decrypted_secret into url from vault.decrypted_secrets s where s.name = 'instagram_jobs_url';
  select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'instagram_jobs_secret';
  if url is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('job', p_job),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 10000
  );
exception when others then
  raise warning 'job do Instagram não enviado: %', sqlerrm;
end;
$$;

revoke all on function private.run_instagram_job(text) from public;

-- Renovação dos tokens: todo dia às 06:17 de Brasília (09:17 UTC).
select cron.schedule(
  'instagram-refresh-tokens',
  '17 9 * * *',
  $$select private.run_instagram_job('refresh_tokens')$$
);
