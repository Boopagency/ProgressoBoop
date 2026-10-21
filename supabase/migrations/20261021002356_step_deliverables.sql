-- Boop Admin: entregas das etapas no portal (banco, sem telas).
--
-- A etapa que pede a aprovação do cliente (ex.: "Aprovação do layout da home")
-- já aparece no portal com Aprovar / Pedir ajuste, mas o cliente só via o
-- título. Agora a equipe anexa à etapa o que ele precisa ver para decidir: um
-- link (Figma, Drive, prévia do site) ou um arquivo (imagem ou PDF). O
-- cliente vê as entregas de toda etapa que ele vê, na página do projeto.
--
-- Só acréscimos: uma tabela, um bucket e funções. Como nas fases anteriores,
-- a equipe usa a tabela pelo RLS e o cliente lê só pela função
-- portal_step_deliverables (security definer), que confere
-- private.portal_can_see_project e devolve só os campos liberados.

-- Entregas ----------------------------------------------------------------------

create table public.task_deliverables (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks (id) on delete cascade,
  kind text not null check (kind in ('link', 'file')),
  title text not null check (char_length(trim(title)) between 1 and 200),
  -- Link: só http(s).
  url text check (char_length(url) <= 2000 and url ~* '^https?://'),
  -- Arquivo no bucket `deliverables`: "<client_id>/<task_id>/<arquivo>".
  file_path text unique check (char_length(file_path) between 1 and 300),
  mime_type text check (char_length(mime_type) <= 100),
  size_bytes integer check (size_bytes > 0),
  created_by uuid references public.profiles (id) on delete set null default auth.uid(),
  created_at timestamptz not null default now(),
  constraint task_deliverables_content_check check (
    (kind = 'link' and url is not null and file_path is null)
    or (kind = 'file' and file_path is not null and url is null and mime_type is not null)
  )
);

comment on table public.task_deliverables is
  'Entregas de uma etapa de projeto (link ou arquivo) que o cliente vê no portal, para aprovar a etapa.';

create index task_deliverables_task_id_idx on public.task_deliverables (task_id, created_at);
create index task_deliverables_created_by_idx on public.task_deliverables (created_by);

alter table public.task_deliverables enable row level security;

create policy "equipe vê entregas" on public.task_deliverables
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe cria entregas" on public.task_deliverables
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita entregas" on public.task_deliverables
  for update to authenticated
  using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "equipe exclui entregas" on public.task_deliverables
  for delete to authenticated using ((select private.is_team_member()));

-- Entregas no portal ----------------------------------------------------------------

-- Entregas das etapas que o cliente vê, num projeto dele.
create function public.portal_step_deliverables(target_project uuid)
returns table (
  id uuid,
  task_id uuid,
  kind text,
  title text,
  url text,
  file_path text,
  mime_type text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.task_id, d.kind, d.title, d.url, d.file_path, d.mime_type, d.created_at
    from public.task_deliverables d
    join public.tasks t on t.id = d.task_id
   where t.project_id = target_project
     and t.client_visible
     and private.portal_can_see_project(target_project)
   order by d.created_at;
$$;

revoke execute on function public.portal_step_deliverables(uuid) from public, anon;
grant execute on function public.portal_step_deliverables(uuid) to authenticated;

-- Arquivos das entregas --------------------------------------------------------------
-- Bucket privado, como `content`: o app entrega cada arquivo por
-- /api/entregas/<caminho>, que confere a sessão e redireciona para uma URL
-- assinada e temporária. O navegador envia direto ao Storage por uma URL
-- assinada de envio (sem o limite de tamanho das Server Actions).

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'deliverables', 'deliverables', false, 20971520,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif', 'application/pdf']
)
on conflict (id) do nothing;

create policy "equipe vê arquivos das entregas" on storage.objects
  for select to authenticated
  using (bucket_id = 'deliverables' and (select private.is_team_member()));
create policy "equipe envia arquivos das entregas" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'deliverables' and (select private.is_team_member()));
create policy "equipe apaga arquivos das entregas" on storage.objects
  for delete to authenticated
  using (bucket_id = 'deliverables' and (select private.is_team_member()));

-- O cliente lê só o arquivo de uma entrega que ele vê (pela linha da entrega,
-- não pela pasta: o projeto pode ter mudado de cliente).
create function private.portal_can_read_deliverable(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
      from public.task_deliverables d
      join public.tasks t on t.id = d.task_id
     where d.file_path = object_name
       and t.client_visible
       and t.project_id is not null
       and private.portal_can_see_project(t.project_id)
  );
$$;

revoke all on function private.portal_can_read_deliverable(text) from public;
grant execute on function private.portal_can_read_deliverable(text) to authenticated;

create policy "cliente vê os arquivos das entregas" on storage.objects
  for select to authenticated
  using (bucket_id = 'deliverables' and private.portal_can_read_deliverable(name));
