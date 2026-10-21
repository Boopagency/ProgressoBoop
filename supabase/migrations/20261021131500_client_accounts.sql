-- Boop Admin: a equipe cria a conta do cliente pelo próprio admin.
--
-- Antes a conta era criada à mão no painel do Supabase (Add user) e só depois
-- ligada ao cliente por `link_client_member`. Agora o cartão "Acesso do
-- cliente" cria a conta com uma senha provisória (gerada no servidor do app),
-- já confirmada, e liga ao cliente; e gera uma senha nova quando a pessoa
-- perder a dela (não há "esqueci minha senha" sem um serviço de e-mail).
--
-- Sem service role no app: as funções rodam como donas das tabelas, mas só
-- para quem é da equipe, e nunca tocam numa conta da equipe. Quando houver
-- e-mail (Resend), o convite por link substitui a senha provisória e estas
-- funções continuam valendo para quem preferir senha.
--
-- `link_client_member` continua existindo (o código atual da main usa).

-- Criar a conta e dar acesso ----------------------------------------------------

-- Se já existe conta de cliente com esse e-mail, só liga (e atualiza o nome);
-- a senha dela não muda. `created` diz se a conta foi criada agora.
create function public.create_client_account(
  target_client uuid,
  member_email text,
  member_name text,
  temp_password text
)
returns table (member_id uuid, created boolean)
language plpgsql
security definer
set search_path = ''
as $$
declare
  normalized text := lower(trim(coalesce(member_email, '')));
  clean_name text := trim(coalesce(member_name, ''));
  account uuid;
  is_new boolean := false;
  member uuid;
begin
  if not private.is_team_member() then
    raise exception 'not_team_member' using errcode = '42501';
  end if;
  if not exists (select 1 from public.clients c where c.id = target_client) then
    raise exception 'client_not_found' using errcode = 'P0002';
  end if;
  if char_length(clean_name) not between 1 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if char_length(normalized) not between 3 and 320 or normalized !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' then
    raise exception 'invalid_email' using errcode = '22023';
  end if;

  select u.id into account from auth.users u where lower(u.email) = normalized;
  if account is not null and exists (select 1 from public.profiles p where p.id = account) then
    raise exception 'account_is_team' using errcode = '23514';
  end if;

  if account is null then
    if char_length(coalesce(temp_password, '')) not between 8 and 72 then
      raise exception 'weak_password' using errcode = '22023';
    end if;
    account := gen_random_uuid();
    is_new := true;
    -- Mesmo formato de uma conta criada pelo painel com "Auto Confirm User".
    insert into auth.users (
      instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
      raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
      confirmation_token, recovery_token, email_change_token_new, email_change
    ) values (
      '00000000-0000-0000-0000-000000000000', account, 'authenticated', 'authenticated', normalized,
      extensions.crypt(temp_password, extensions.gen_salt('bf', 10)), now(),
      '{"provider": "email", "providers": ["email"]}'::jsonb,
      jsonb_build_object('full_name', clean_name, 'email_verified', true), now(), now(),
      '', '', '', ''
    );
    insert into auth.identities (provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
    values (
      account::text, account,
      jsonb_build_object('sub', account::text, 'email', normalized, 'email_verified', true, 'phone_verified', false),
      'email', null, now(), now()
    );
  end if;

  insert into public.client_members (client_id, user_id, full_name, email, created_by)
  values (target_client, account, clean_name, normalized, (select auth.uid()))
  on conflict (client_id, user_id) do update set full_name = excluded.full_name
  returning id into member;

  return query select member, is_new;
end;
$$;

revoke execute on function public.create_client_account(uuid, text, text, text) from public, anon;
grant execute on function public.create_client_account(uuid, text, text, text) to authenticated;

-- Nova senha provisória ---------------------------------------------------------

-- Troca a senha da conta de um acesso (`client_members.id`). Vale para a conta
-- inteira: se ela acompanha mais de um cliente, a senha nova serve para todos.
create function public.reset_client_password(target_member uuid, temp_password text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  account uuid;
begin
  if not private.is_team_member() then
    raise exception 'not_team_member' using errcode = '42501';
  end if;
  select m.user_id into account from public.client_members m where m.id = target_member;
  if account is null then
    raise exception 'member_not_found' using errcode = 'P0002';
  end if;
  if exists (select 1 from public.profiles p where p.id = account) then
    raise exception 'account_is_team' using errcode = '23514';
  end if;
  if char_length(coalesce(temp_password, '')) not between 8 and 72 then
    raise exception 'weak_password' using errcode = '22023';
  end if;

  update auth.users
  set encrypted_password = extensions.crypt(temp_password, extensions.gen_salt('bf', 10)),
      updated_at = now()
  where id = account;
end;
$$;

revoke execute on function public.reset_client_password(uuid, text) from public, anon;
grant execute on function public.reset_client_password(uuid, text) to authenticated;
