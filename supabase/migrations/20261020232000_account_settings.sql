-- Minha conta: cada pessoa troca o próprio nome, e-mail, senha e foto.
--
-- A equipe já edita o próprio perfil (`profiles`, política "cada um edita o
-- próprio perfil"). Para a conta de cliente, que não tem perfil:
--   * `client_members.avatar_path`, a foto de quem acessa o portal;
--   * `portal_update_me`, que troca o nome e a foto nas linhas da própria conta
--     (a política da tabela só deixa a equipe alterar);
--   * o e-mail de `client_members` acompanha o do Auth quando a troca é
--     confirmada (a equipe não lê `auth.users`).
-- E o bucket público `avatars` guarda as fotos em "<user_id>/<arquivo>": cada
-- conta envia e apaga só na própria pasta. Senha e e-mail mudam pelo Supabase
-- Auth, sem tabela nova. Tudo aditivo: o código que já está na main continua
-- funcionando.

-- Foto da conta de cliente ----------------------------------------------------

alter table public.client_members
  add column avatar_path text check (char_length(avatar_path) between 1 and 200);

comment on column public.client_members.avatar_path is
  'Foto de quem acessa o portal ("<user_id>/<uuid>" no bucket avatars), escolhida pela própria pessoa.';

-- O e-mail continua travado em `client_members`, menos quando vem da troca
-- confirmada no Auth (sync_client_member_email marca a transação).
create or replace function private.guard_client_member()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' then
    -- Só o nome e a foto mudam; quem é, de qual cliente, o e-mail e a autoria
    -- ficam.
    new.client_id := old.client_id;
    new.user_id := old.user_id;
    if coalesce(current_setting('boop.sync_member_email', true), '') <> 'on' then
      new.email := old.email;
    end if;
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

create function private.sync_client_member_email()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('boop.sync_member_email', 'on', true);
  update public.client_members set email = lower(new.email) where user_id = new.id;
  perform set_config('boop.sync_member_email', '', true);
  return new;
end;
$$;

revoke all on function private.sync_client_member_email() from public;

create trigger sync_client_member_email
  after update of email on auth.users
  for each row
  when (new.email is not null and old.email is distinct from new.email)
  execute function private.sync_client_member_email();

-- Nome e foto pelo portal -------------------------------------------------------

-- A conta de cliente troca o próprio nome e a foto em todas as suas linhas
-- (uma conta pode acompanhar mais de um cliente). A foto precisa estar na
-- pasta da própria conta no bucket avatars; vazio tira a foto.
create function public.portal_update_me(new_name text, new_avatar_path text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  clean_name text := trim(coalesce(new_name, ''));
  clean_avatar text := nullif(trim(coalesce(new_avatar_path, '')), '');
begin
  if me is null or not exists (select 1 from public.client_members m where m.user_id = me) then
    raise exception 'not_client_member' using errcode = '42501';
  end if;
  if char_length(clean_name) not between 1 and 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if clean_avatar is not null
     and clean_avatar !~ ('^' || me::text || '/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$') then
    raise exception 'invalid_avatar' using errcode = '22023';
  end if;

  update public.client_members
  set full_name = clean_name, avatar_path = clean_avatar
  where user_id = me;
end;
$$;

revoke execute on function public.portal_update_me(text, text) from public, anon;
grant execute on function public.portal_update_me(text, text) to authenticated;

-- Fotos -----------------------------------------------------------------------

-- Público para a foto aparecer em qualquer tela sem URL assinada; o nome do
-- arquivo é um uuid novo a cada troca.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'avatars', 'avatars', true, 1048576,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy "cada um vê a própria pasta de fotos" on storage.objects
  for select to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cada um envia a própria foto" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "cada um apaga a própria foto" on storage.objects
  for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = (select auth.uid())::text);
