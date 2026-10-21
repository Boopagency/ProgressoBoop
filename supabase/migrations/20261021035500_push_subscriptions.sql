-- Boop Admin: notificações no celular (Web Push), para a equipe e o cliente.
--
-- O app vira PWA (instalável na tela de início) e cada aparelho que ativa as
-- notificações em Minha conta ganha uma inscrição de push. O aviso sai dos
-- mesmos eventos do sino: toda linha nova em `notifications` (equipe) ou em
-- `client_notifications` (portal) vira um push para os aparelhos de quem a
-- recebe. Qualquer aviso novo que o banco passar a gravar nessas tabelas
-- (aprovação de layout, documentos, chats) vai para o celular sem mudar nada
-- aqui.
--
-- Como sai: o trigger junta os avisos do comando com as inscrições de quem
-- recebe e manda um POST (pg_net, assíncrono, depois do commit) para a rota
-- /api/push do app, que monta a frase e assina o push com as chaves VAPID
-- (variáveis de ambiente da Vercel). O banco não guarda a chave VAPID e o app
-- não lê o banco nessa rota. O endereço da rota e o segredo compartilhado
-- ficam no Vault (`push_webhook_url` e `push_webhook_secret`); sem eles, nada
-- sai e nada falha. Um erro no envio nunca desfaz a mensagem ou o aviso.
--
-- Cada pessoa vê e apaga só as próprias inscrições. Gravar é por
-- save_push_subscription: o aparelho é um só endereço (endpoint), então quem
-- entra nele por último fica com a inscrição (ex.: o Leo testa com a conta
-- do cliente no mesmo celular). Sair da conta apaga a do aparelho. Inscrição
-- que o aparelho não renova há 60 dias sai sozinha.

create extension if not exists pg_net with schema extensions;

-- Inscrições ------------------------------------------------------------------

create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  -- Quem recebe: alguém da equipe ou uma conta de cliente.
  user_id uuid not null references auth.users (id) on delete cascade,
  -- O endereço do serviço de push do aparelho (Apple, Google, Mozilla...).
  endpoint text not null unique check (char_length(endpoint) <= 1000 and endpoint ~ '^https://'),
  p256dh text not null check (char_length(p256dh) <= 200),
  auth text not null check (char_length(auth) <= 100),
  -- Para a pessoa reconhecer o aparelho (ex.: "iPhone", "Android").
  device text check (char_length(device) <= 120),
  created_at timestamptz not null default now(),
  -- O app renova ao abrir; sem renovar há 60 dias, a inscrição sai.
  last_seen_at timestamptz not null default now()
);
comment on table public.push_subscriptions is
  'Aparelhos com notificações no celular (Web Push), da equipe e dos clientes. Gravados por save_push_subscription.';

create index push_subscriptions_user_id_idx on public.push_subscriptions (user_id);

alter table public.push_subscriptions enable row level security;

create policy "cada um vê os próprios aparelhos" on public.push_subscriptions
  for select to authenticated
  using (user_id = (select auth.uid()));
create policy "cada um tira os próprios aparelhos" on public.push_subscriptions
  for delete to authenticated
  using (user_id = (select auth.uid()));

-- Ativa (ou renova) as notificações deste aparelho para quem está logado.
create function public.save_push_subscription(
  p_endpoint text,
  p_p256dh text,
  p_auth text,
  p_device text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
begin
  if me is null then
    raise exception 'Entre na sua conta para ativar as notificações.' using errcode = '42501';
  end if;
  insert into public.push_subscriptions (user_id, endpoint, p256dh, auth, device)
  values (me, p_endpoint, p_p256dh, p_auth, left(p_device, 120))
  on conflict (endpoint) do update
    set user_id = excluded.user_id,
        p256dh = excluded.p256dh,
        auth = excluded.auth,
        device = excluded.device,
        last_seen_at = now(),
        created_at = case
          when public.push_subscriptions.user_id = excluded.user_id then public.push_subscriptions.created_at
          else now()
        end;
  delete from public.push_subscriptions s
   where s.user_id = me
     and s.last_seen_at < now() - interval '60 days';
end;
$$;

revoke all on function public.save_push_subscription(text, text, text, text) from public, anon;
grant execute on function public.save_push_subscription(text, text, text, text) to authenticated;

-- Envio -----------------------------------------------------------------------

-- Um POST por comando com os avisos que têm aparelho para receber. A rota
-- confere o segredo e responde rápido; o pg_net não segura a transação.
create function private.send_push(p_audience text, p_rows jsonb)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  url text;
  secret text;
begin
  if p_rows is null or jsonb_array_length(p_rows) = 0 then
    return;
  end if;
  select s.decrypted_secret into url from vault.decrypted_secrets s where s.name = 'push_webhook_url';
  select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'push_webhook_secret';
  if url is null or secret is null then
    return;
  end if;
  perform net.http_post(
    url := url,
    body := jsonb_build_object('audience', p_audience, 'notifications', p_rows),
    headers := jsonb_build_object('Content-Type', 'application/json', 'Authorization', 'Bearer ' || secret),
    timeout_milliseconds := 5000
  );
exception when others then
  -- O push é um extra: nunca desfaz o aviso nem a mensagem.
  raise warning 'push não enviado: %', sqlerrm;
end;
$$;

revoke all on function private.send_push(text, jsonb) from public;

create function private.push_team_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.send_push('team', (
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'kind', a.kind, 'actor_name', a.actor_name, 'client_id', a.client_id,
             'client_name', c.name, 'title', a.title, 'body', a.body, 'item_count', a.item_count,
             'link', a.link, 'created_at', a.created_at, 'subscriptions', subs.list))
      from added a
      left join public.clients c on c.id = a.client_id
      cross join lateral (
        select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) as list
          from public.push_subscriptions s
         where s.user_id = a.user_id
      ) subs
     where subs.list is not null
  ));
  return null;
end;
$$;

create trigger push_team_notifications
  after insert on public.notifications
  referencing new table as added
  for each statement execute function private.push_team_notifications();

create function private.push_client_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.send_push('client', (
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'kind', a.kind, 'actor_name', a.actor_name, 'client_id', a.client_id,
             'client_name', c.name, 'title', a.title, 'body', a.body,
             'link', a.link, 'created_at', a.created_at, 'subscriptions', subs.list))
      from added a
      left join public.clients c on c.id = a.client_id
      cross join lateral (
        select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) as list
          from public.push_subscriptions s
         where s.user_id = a.user_id
      ) subs
     where subs.list is not null
  ));
  return null;
end;
$$;

create trigger push_client_notifications
  after insert on public.client_notifications
  referencing new table as added
  for each statement execute function private.push_client_notifications();

-- Aparelho que o serviço de push dá como encerrado (app desinstalado,
-- permissão tirada): a rota /api/push avisa, sem sessão, com o mesmo segredo.
create function public.forget_push_endpoints(p_secret text, p_endpoints text[])
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  secret text;
  removed integer;
begin
  select s.decrypted_secret into secret from vault.decrypted_secrets s where s.name = 'push_webhook_secret';
  if secret is null or p_secret is distinct from secret then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  with gone as (
    delete from public.push_subscriptions s where s.endpoint = any (p_endpoints[1:100]) returning 1
  )
  select count(*)::integer into removed from gone;
  return removed;
end;
$$;

revoke all on function public.forget_push_endpoints(text, text[]) from public;
grant execute on function public.forget_push_endpoints(text, text[]) to anon, authenticated;
