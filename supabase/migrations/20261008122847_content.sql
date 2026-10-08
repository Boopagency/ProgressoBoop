-- Boop Admin: Central de Conteúdo (base: banco, sem telas).
--
-- Planejamento de posts de social media por cliente, como o modelo "Central
-- de Conteúdo" do Notion: cada post tem formato, redes, intenção, data, etapa,
-- o status de cada frente (copy, design, vídeo), responsável e o texto
-- (ideia, roteiro, slides, legenda). Os posts de todos os clientes ficam numa
-- tabela só, para a visão central. As ideias e referências ficam num banco
-- de ideias por cliente; as frentes de um post podem virar tarefas.

-- Tipos -----------------------------------------------------------------------

create type public.content_format as enum ('reels', 'carousel', 'static', 'stories', 'video', 'photo', 'text');
create type public.content_network as enum ('instagram', 'tiktok', 'linkedin');
create type public.content_intent as enum ('conversion', 'growth', 'authority', 'connection', 'sponsored');
create type public.content_stage as enum (
  'production', 'internal_review', 'client_review', 'approved', 'scheduled', 'published'
);
create type public.content_front_status as enum (
  'not_needed', 'todo', 'in_progress', 'missing_material', 'in_review', 'changes', 'done'
);

-- Slides de um carrossel: [{ "text": "...", "image_path": "<client_id>/<arquivo>" | null }],
-- até 20. Imutável (só olha o valor), então pode ser usada num check.
create function private.content_slides_valid(slides jsonb)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(slides) is distinct from 'array' then false
    when jsonb_array_length(slides) > 20 then false
    else not exists (
      select 1
        from jsonb_array_elements(slides) as s (slide)
       where jsonb_typeof(s.slide) <> 'object'
          or jsonb_typeof(s.slide -> 'text') is distinct from 'string'
          or char_length(s.slide ->> 'text') > 2000
          or jsonb_typeof(coalesce(s.slide -> 'image_path', 'null'::jsonb)) not in ('string', 'null')
          or char_length(s.slide ->> 'image_path') > 500
    )
  end;
$$;

revoke all on function private.content_slides_valid(jsonb) from public;
grant execute on function private.content_slides_valid(jsonb) to authenticated;

-- Posts -----------------------------------------------------------------------

create table public.content_posts (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  project_id uuid references public.projects (id) on delete set null,
  title text not null check (char_length(trim(title)) between 1 and 200),
  format public.content_format not null,
  networks public.content_network[] not null default '{instagram}' check (cardinality(networks) between 1 and 3),
  intents public.content_intent[] not null default '{}' check (cardinality(intents) <= 5),
  -- Dia e horário (de São Paulo) previstos para a publicação.
  publish_on date,
  publish_time time,
  stage public.content_stage not null default 'production',
  -- Frentes de produção. Vídeo sem valor na criação: o trigger decide pelo
  -- formato (A fazer em reels, vídeo e stories; Não precisa nos demais).
  copy_status public.content_front_status not null default 'todo',
  design_status public.content_front_status not null default 'todo',
  video_status public.content_front_status not null,
  owner_id uuid references public.profiles (id) on delete set null,
  -- Conteúdo/ideia do post.
  brief text check (char_length(brief) <= 5000),
  -- Orientação de design ou de vídeo.
  design_notes text check (char_length(design_notes) <= 5000),
  -- Roteiro (reels, vídeo, stories).
  script text check (char_length(script) <= 10000),
  slides jsonb not null default '[]'::jsonb check (private.content_slides_valid(slides)),
  caption text check (char_length(caption) <= 5000),
  drive_url text check (char_length(drive_url) <= 2000 and drive_url ~* '^https?://'),
  -- Capa no Storage (bucket content): "<client_id>/<arquivo>".
  cover_path text check (char_length(cover_path) between 1 and 500),
  -- Fixado no topo do feed.
  pinned boolean not null default false,
  -- Quando virou publicado (trigger).
  published_at timestamptz,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint content_posts_publish_time_check check (publish_time is null or publish_on is not null)
);
comment on table public.content_posts is
  'Posts de social media dos clientes (Central de Conteúdo): formato, redes, data, etapa, frentes e texto.';

-- Banco de ideias -------------------------------------------------------------

create table public.content_ideas (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.clients (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 200),
  notes text check (char_length(notes) <= 5000),
  format public.content_format,
  reference_url text check (char_length(reference_url) <= 2000 and reference_url ~* '^https?://'),
  -- O post em que a ideia virou.
  post_id uuid references public.content_posts (id) on delete set null,
  created_by uuid not null default auth.uid() references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.content_ideas is 'Banco de ideias e referências de conteúdo de cada cliente.';

-- Ligações --------------------------------------------------------------------

-- As frentes de um post (copy, design, vídeo) viram tarefas.
alter table public.tasks
  add column content_post_id uuid references public.content_posts (id) on delete set null;

-- Perfil do Instagram do cliente, para o preview do feed.
alter table public.clients
  -- Sem @: letras, números, ponto e sublinhado (até 30, como no Instagram).
  add column instagram_handle text,
  add column instagram_bio text,
  -- Foto do perfil no Storage (bucket content): "<client_id>/<arquivo>".
  add column avatar_path text,
  add constraint clients_instagram_handle_check check (instagram_handle ~ '^[A-Za-z0-9._]{1,30}$'),
  add constraint clients_instagram_bio_check check (char_length(instagram_bio) <= 150),
  add constraint clients_avatar_path_check check (char_length(avatar_path) between 1 and 500);

-- Índices ---------------------------------------------------------------------

create index content_posts_client_id_idx on public.content_posts (client_id);
create index content_posts_publish_on_idx on public.content_posts (publish_on);
create index content_posts_stage_idx on public.content_posts (stage);
create index content_posts_owner_id_idx on public.content_posts (owner_id);
create index content_posts_project_id_idx on public.content_posts (project_id);
create index content_posts_created_by_idx on public.content_posts (created_by);
create index content_ideas_client_id_idx on public.content_ideas (client_id);
create index content_ideas_post_id_idx on public.content_ideas (post_id);
create index content_ideas_created_by_idx on public.content_ideas (created_by);
create index tasks_content_post_id_idx on public.tasks (content_post_id);

-- Triggers --------------------------------------------------------------------

-- updated_at a cada alteração; autoria e criação não mudam; frente de vídeo
-- pelo formato quando ninguém informou; published_at quando vira publicado
-- (ou o informado) e limpo quando sai de publicado.
create function private.set_content_post_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  if tg_op = 'INSERT' then
    if new.video_status is null then
      new.video_status := case
        when new.format in ('reels', 'video', 'stories') then 'todo'::public.content_front_status
        else 'not_needed'::public.content_front_status
      end;
    end if;
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;

  if new.stage <> 'published' then
    new.published_at := null;
  elsif new.published_at is null then
    new.published_at := case when tg_op = 'UPDATE' then coalesce(old.published_at, now()) else now() end;
  end if;
  return new;
end;
$$;

create trigger set_content_post_fields
  before insert or update on public.content_posts
  for each row execute function private.set_content_post_fields();

create trigger set_record_fields before insert or update on public.content_ideas
  for each row execute function private.set_record_fields();

-- Histórico -------------------------------------------------------------------

alter table public.activity drop constraint activity_entity_type_check;
alter table public.activity add constraint activity_entity_type_check check (
  entity_type in ('task', 'project', 'decision', 'communication', 'finance', 'recurrence', 'deal', 'content_post')
);

create function private.log_content_post_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  changes jsonb := '{}'::jsonb;
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  field text;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op = 'INSERT' then
    perform private.log_activity('content_post', new.id, new.title, new.project_id, new.client_id, 'created', '{}'::jsonb);
  elsif tg_op = 'DELETE' then
    -- Cliente excluído leva os posts junto: fica só o registro do cliente.
    if not exists (select 1 from public.clients c where c.id = old.client_id) then
      return null;
    end if;
    perform private.log_activity('content_post', old.id, old.title, old.project_id, old.client_id, 'deleted', '{}'::jsonb);
  else
    foreach field in array array[
      'title', 'stage', 'copy_status', 'design_status', 'video_status', 'publish_on', 'owner_id', 'format'
    ] loop
      changes := private.diff(changes, field, old_row -> field, new_row -> field);
    end loop;
    perform private.log_activity('content_post', new.id, new.title, new.project_id, new.client_id, 'updated', private.without_cascade(changes));
  end if;
  return null;
end;
$$;

create trigger log_content_post_activity
  after insert or update or delete on public.content_posts
  for each row execute function private.log_content_post_activity();

-- Comentários também nos posts.
create or replace function private.fill_comment_context()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  -- Histórico gravado pelo banco, ou ajuste em cascata (projeto ou cliente
  -- excluído limpa o vínculo): passa direto.
  if new.action <> 'comment' or pg_trigger_depth() > 1 then
    return new;
  end if;
  new.actor_id := auth.uid();
  new.changes := '{}'::jsonb;
  new.body := trim(new.body);
  if tg_op = 'UPDATE' then
    new.entity_type := old.entity_type;
    new.entity_id := old.entity_id;
    new.entity_title := old.entity_title;
    new.project_id := old.project_id;
    new.client_id := old.client_id;
    new.created_at := old.created_at;
    new.actor_id := old.actor_id;
    new.edited_at := clock_timestamp();
    return new;
  end if;
  new.created_at := clock_timestamp();
  new.edited_at := null;
  if new.entity_type = 'task' then
    select t.title, t.project_id, t.client_id into new.entity_title, new.project_id, new.client_id
      from public.tasks t where t.id = new.entity_id;
  elsif new.entity_type = 'project' then
    select p.name, p.id, p.client_id into new.entity_title, new.project_id, new.client_id
      from public.projects p where p.id = new.entity_id;
  elsif new.entity_type = 'decision' then
    select d.title, d.project_id, d.client_id into new.entity_title, new.project_id, new.client_id
      from public.decisions d where d.id = new.entity_id;
  elsif new.entity_type = 'deal' then
    select d.title, d.project_id, d.client_id into new.entity_title, new.project_id, new.client_id
      from public.deals d where d.id = new.entity_id;
  elsif new.entity_type = 'content_post' then
    select c.title, c.project_id, c.client_id into new.entity_title, new.project_id, new.client_id
      from public.content_posts c where c.id = new.entity_id;
  else
    raise exception 'Este item não recebe comentários.' using errcode = '22023';
  end if;
  if not found then
    raise exception 'Item não encontrado.' using errcode = '23503';
  end if;
  new.entity_title := left(coalesce(new.entity_title, ''), 300);
  return new;
end;
$$;

-- RLS -------------------------------------------------------------------------

alter table public.content_posts enable row level security;
alter table public.content_ideas enable row level security;

create policy "equipe vê posts" on public.content_posts
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe cria posts" on public.content_posts
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita posts" on public.content_posts
  for update to authenticated
  using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "equipe exclui posts" on public.content_posts
  for delete to authenticated using ((select private.is_team_member()));

create policy "equipe vê ideias de conteúdo" on public.content_ideas
  for select to authenticated using ((select private.is_team_member()));
create policy "equipe cria ideias de conteúdo" on public.content_ideas
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita ideias de conteúdo" on public.content_ideas
  for update to authenticated
  using ((select private.is_team_member())) with check ((select private.is_team_member()));
create policy "equipe exclui ideias de conteúdo" on public.content_ideas
  for delete to authenticated using ((select private.is_team_member()));

-- Imagens de conteúdo ---------------------------------------------------------
-- Bucket privado (capas, slides e foto do perfil), caminho
-- "<client_id>/<arquivo>". Mesmo modelo do bucket `docs`: o app entrega cada
-- imagem por uma URL assinada e temporária.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'content', 'content', false, 5242880,
  array['image/png', 'image/jpeg', 'image/webp']
)
on conflict (id) do nothing;

create policy "equipe vê imagens de conteúdo" on storage.objects
  for select to authenticated
  using (bucket_id = 'content' and (select private.is_team_member()));
create policy "equipe envia imagens de conteúdo" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'content' and (select private.is_team_member()));
create policy "equipe apaga imagens de conteúdo" on storage.objects
  for delete to authenticated
  using (bucket_id = 'content' and (select private.is_team_member()));
