-- Boop Admin: Processos (documentação interna).
--
-- Cada documento é um processo, checklist, política ou guia, escrito no
-- editor do app (blocos do BlockNote, em jsonb) e organizado por área e/ou
-- cliente. O texto puro (`content_text`) alimenta a busca. Versões anteriores
-- são guardadas automaticamente pelo banco; imagens ficam num bucket privado.

-- Tipos -----------------------------------------------------------------------

create type public.doc_kind as enum ('process', 'checklist', 'policy', 'guide');
create type public.doc_status as enum ('draft', 'active', 'review');

-- Tabelas ---------------------------------------------------------------------

create table public.docs (
  id uuid primary key default gen_random_uuid(),
  title text not null check (char_length(trim(title)) between 1 and 200),
  kind public.doc_kind not null default 'process',
  status public.doc_status not null default 'draft',
  area public.task_area,
  client_id uuid references public.clients (id) on delete set null,
  owner_id uuid references public.profiles (id) on delete set null,
  -- "Para que serve", em uma frase (aparece nas listas).
  summary text check (char_length(summary) <= 500),
  content jsonb not null default '[]'::jsonb,
  content_text text not null default '' check (char_length(content_text) <= 300000),
  -- Revisão periódica: a cada N meses a partir da última revisão.
  review_every_months smallint check (review_every_months between 1 and 24),
  reviewed_on date,
  next_review_on date generated always as (
    (reviewed_on + make_interval(months => review_every_months))::date
  ) stored,
  pinned boolean not null default false,
  created_by uuid not null default auth.uid() references public.profiles (id),
  updated_by uuid references public.profiles (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  search tsvector generated always as (
    setweight(to_tsvector('portuguese'::regconfig, private.unaccent_text(title)), 'A') ||
    setweight(to_tsvector('portuguese'::regconfig, private.unaccent_text(coalesce(summary, ''))), 'B') ||
    setweight(to_tsvector('portuguese'::regconfig, private.unaccent_text(content_text)), 'C')
  ) stored
);
comment on table public.docs is
  'Processos, checklists, políticas e guias da Boop (conteúdo em blocos do BlockNote).';

-- Estado anterior a uma edição: quem deixou o documento assim e quando.
create table public.doc_versions (
  id uuid primary key default gen_random_uuid(),
  doc_id uuid not null references public.docs (id) on delete cascade,
  title text not null,
  content jsonb not null,
  saved_by uuid references public.profiles (id) on delete set null,
  saved_at timestamptz not null,
  created_at timestamptz not null default now()
);

-- Origem da tarefa: o checklist de um processo.
alter table public.tasks
  add column doc_id uuid references public.docs (id) on delete set null;

-- Índices ---------------------------------------------------------------------

create index docs_area_idx on public.docs (area);
create index docs_client_id_idx on public.docs (client_id);
create index docs_owner_id_idx on public.docs (owner_id);
create index docs_created_by_idx on public.docs (created_by);
create index docs_updated_by_idx on public.docs (updated_by);
create index docs_search_idx on public.docs using gin (search);
create index doc_versions_doc_id_idx on public.doc_versions (doc_id, saved_at desc);
create index doc_versions_saved_by_idx on public.doc_versions (saved_by);
create index tasks_doc_id_idx on public.tasks (doc_id);

-- Triggers --------------------------------------------------------------------

-- Autoria e data de cada alteração. Ao mudar título ou conteúdo, guarda o
-- estado anterior como versão, no máximo uma a cada 30 minutos por pessoa
-- (sempre que quem edita é outra pessoa). security definer porque só o banco
-- grava versões: a equipe não tem política de insert em doc_versions.
create function private.set_doc_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();
  if tg_op = 'UPDATE' then
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    if (new.content is distinct from old.content or new.title is distinct from old.title)
      and (
        old.updated_by is distinct from auth.uid()
        or not exists (
          select 1 from public.doc_versions v
          where v.doc_id = old.id and v.created_at > now() - interval '30 minutes'
        )
      )
    then
      insert into public.doc_versions (doc_id, title, content, saved_by, saved_at)
      values (old.id, old.title, old.content, coalesce(old.updated_by, old.created_by), old.updated_at);
    end if;
  end if;
  return new;
end;
$$;

revoke all on function private.set_doc_fields() from public;

create trigger set_doc_fields
  before insert or update on public.docs
  for each row execute function private.set_doc_fields();

-- RLS -------------------------------------------------------------------------

alter table public.docs enable row level security;
alter table public.doc_versions enable row level security;

create policy "equipe vê processos" on public.docs
  for select to authenticated
  using ((select private.is_team_member()));
create policy "equipe cria processos" on public.docs
  for insert to authenticated
  with check ((select private.is_team_member()) and created_by = (select auth.uid()));
create policy "equipe edita processos" on public.docs
  for update to authenticated
  using ((select private.is_team_member()))
  with check ((select private.is_team_member()));
create policy "equipe exclui processos" on public.docs
  for delete to authenticated
  using ((select private.is_team_member()));

-- Versões: só leitura para a equipe (quem grava é o trigger).
create policy "equipe vê versões dos processos" on public.doc_versions
  for select to authenticated
  using ((select private.is_team_member()));

-- Imagens dos processos -------------------------------------------------------
-- Bucket privado: o app entrega cada imagem por /api/arquivos/<caminho>,
-- que confere a sessão e redireciona para uma URL assinada e temporária.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'docs', 'docs', false, 5242880,
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do nothing;

create policy "equipe vê imagens dos processos" on storage.objects
  for select to authenticated
  using (bucket_id = 'docs' and (select private.is_team_member()));
create policy "equipe envia imagens dos processos" on storage.objects
  for insert to authenticated
  with check (bucket_id = 'docs' and (select private.is_team_member()));
create policy "equipe apaga imagens dos processos" on storage.objects
  for delete to authenticated
  using (bucket_id = 'docs' and (select private.is_team_member()));
