-- Documentos do cliente: arquivos que a equipe envia (contrato, briefing,
-- manual da marca, relatórios…) e que o cliente vê e baixa no portal.
--
--   * `client_files`, um arquivo por linha, com nome, categoria, descrição e
--     `client_visible` (a equipe pode guardar um arquivo só para ela);
--   * bucket privado `client-files`, caminho "<client_id>/<uuid>", no mesmo
--     modelo do `content`: o app entrega cada arquivo por uma URL assinada;
--   * a conta de cliente não lê a tabela: lê pelas funções `portal_*`, que
--     conferem `private.my_client_ids()` e o cliente ativo, e o Storage só
--     deixa ela ler os arquivos marcados como visíveis do cliente dela;
--   * aviso no portal ("Novo documento") quando um arquivo fica visível.
-- Tudo aditivo: o código que já está na main continua funcionando.

-- Tipos -----------------------------------------------------------------------

create type public.client_file_category as enum ('contract', 'briefing', 'brand', 'report', 'other');

alter type public.client_notification_kind add value if not exists 'file_shared';

-- Tabela ----------------------------------------------------------------------

create table public.client_files (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  name text not null check (char_length(trim(name)) between 1 and 200),
  category public.client_file_category not null default 'other',
  description text check (char_length(description) <= 500),
  -- "<client_id>/<uuid>" no bucket client-files.
  storage_path text not null unique check (
    storage_path ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
  ),
  -- Nome original, com a extensão (é o nome do arquivo baixado).
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (char_length(mime_type) between 1 and 200),
  size_bytes bigint not null check (size_bytes between 1 and 26214400),
  client_visible boolean not null default true,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (split_part(storage_path, '/', 1) = client_id::text)
);
comment on table public.client_files is
  'Documentos do cliente (arquivos no bucket client-files). Com client_visible, o cliente vê e baixa no portal.';

create index client_files_client_id_idx on public.client_files (client_id, created_at desc);
create index client_files_created_by_idx on public.client_files (created_by);

-- Depois de enviado, o arquivo não muda: só o nome, a categoria, a descrição e
-- se o cliente vê.
create function private.set_client_file_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.client_id := old.client_id;
  new.storage_path := old.storage_path;
  new.file_name := old.file_name;
  new.mime_type := old.mime_type;
  new.size_bytes := old.size_bytes;
  new.created_by := old.created_by;
  new.created_at := old.created_at;
  new.updated_at := now();
  return new;
end;
$$;

create trigger set_client_file_fields
  before update on public.client_files
  for each row execute function private.set_client_file_fields();

-- RLS: só a equipe ------------------------------------------------------------

alter table public.client_files enable row level security;

create policy "equipe vê documentos do cliente" on public.client_files
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe envia documentos do cliente" on public.client_files
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita documentos do cliente" on public.client_files
  for update to authenticated
  using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "equipe exclui documentos do cliente" on public.client_files
  for delete to authenticated using ((select private.is_team_member()));

-- Portal ----------------------------------------------------------------------

-- Documentos que o cliente vê, do mais novo para o mais antigo.
create function public.portal_client_files(target_client uuid)
returns table (
  id uuid,
  name text,
  category public.client_file_category,
  description text,
  file_name text,
  mime_type text,
  size_bytes bigint,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select f.id, f.name, f.category, f.description, f.file_name, f.mime_type, f.size_bytes, f.created_at
    from public.client_files f
    join public.clients c on c.id = f.client_id
   where f.client_id = target_client
     and f.client_visible
     and c.active
     and f.client_id in (select private.my_client_ids())
   order by f.created_at desc;
$$;

-- Um documento que o cliente vê, com o caminho para a rota de download gerar
-- a URL assinada.
create function public.portal_client_file(target_file uuid)
returns table (storage_path text, file_name text, mime_type text)
language sql
stable
security definer
set search_path = ''
as $$
  select f.storage_path, f.file_name, f.mime_type
    from public.client_files f
    join public.clients c on c.id = f.client_id
   where f.id = target_file
     and f.client_visible
     and c.active
     and f.client_id in (select private.my_client_ids());
$$;

revoke execute on function public.portal_client_files(uuid) from public, anon;
grant execute on function public.portal_client_files(uuid) to authenticated;
revoke execute on function public.portal_client_file(uuid) from public, anon;
grant execute on function public.portal_client_file(uuid) to authenticated;

-- Aviso no portal ---------------------------------------------------------------

-- Endereço do documento no portal (o aviso não tem coluna do arquivo: é pelo
-- endereço que ele sai quando o arquivo some ou é escondido).
create function private.client_file_link(target_client uuid, target_file uuid)
returns text
language sql
immutable
set search_path = ''
as $$
  select '/portal/documentos?cliente=' || target_client::text || '&arquivo=' || target_file::text;
$$;

revoke all on function private.client_file_link(uuid, uuid) from public;

-- Arquivo novo já visível, ou que passou a ser visível: avisa as contas do
-- cliente. Escondido de novo: o aviso ainda não lido sai.
create function private.notify_client_file()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'UPDATE' and old.client_visible and not new.client_visible then
    delete from public.client_notifications n
     where n.client_id = new.client_id
       and n.kind = 'file_shared'
       and n.link = private.client_file_link(new.client_id, new.id)
       and n.read_at is null;
    return null;
  end if;
  if not new.client_visible or (tg_op = 'UPDATE' and old.client_visible) then
    return null;
  end if;
  perform private.notify_client_members(
    new.client_id, (select auth.uid()), 'file_shared', new.name, 'Novo documento',
    private.client_file_link(new.client_id, new.id)
  );
  return null;
end;
$$;

create trigger notify_client_file
  after insert or update of client_visible on public.client_files
  for each row execute function private.notify_client_file();

-- Arquivo excluído: o aviso ainda não lido sai.
create function private.clear_client_file_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  delete from public.client_notifications n
   where n.client_id = old.client_id
     and n.kind = 'file_shared'
     and n.link = private.client_file_link(old.client_id, old.id);
  return null;
end;
$$;

create trigger clear_client_file_notifications
  after delete on public.client_files
  for each row execute function private.clear_client_file_notifications();

-- Arquivos ----------------------------------------------------------------------

-- Bucket privado, até 25 MB por arquivo.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'client-files', 'client-files', false, 26214400,
  array[
    'application/pdf',
    'image/png', 'image/jpeg', 'image/webp', 'image/gif',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'text/plain', 'text/csv',
    'application/zip', 'application/x-zip-compressed',
    'video/mp4'
  ]
)
on conflict (id) do nothing;

create policy "equipe vê documentos dos clientes" on storage.objects
  for select to authenticated
  using (bucket_id = 'client-files' and (select private.is_team_member()));
create policy "equipe envia documentos dos clientes" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'client-files' and (select private.is_team_member()));
create policy "equipe apaga documentos dos clientes" on storage.objects
  for delete to authenticated
  using (bucket_id = 'client-files' and (select private.is_team_member()));

-- O cliente lê só os arquivos visíveis do cliente dele (pela linha, não pelo
-- prefixo da pasta: um arquivo enviado e ainda não salvo não abre).
create function private.portal_can_read_client_file(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.client_files f
      join public.clients c on c.id = f.client_id
     where f.storage_path = object_name
       and f.client_visible
       and c.active
       and f.client_id in (select private.my_client_ids())
  );
$$;

revoke all on function private.portal_can_read_client_file(text) from public;
grant execute on function private.portal_can_read_client_file(text) to authenticated;

create policy "cliente vê os próprios documentos" on storage.objects
  for select to authenticated
  using (bucket_id = 'client-files' and private.portal_can_read_client_file(name));
