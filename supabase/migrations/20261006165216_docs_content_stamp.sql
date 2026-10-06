-- Boop Admin: Processos — quando e por quem o texto mudou.
--
-- `updated_at`/`updated_by` mudam com qualquer alteração (status, responsável,
-- revisão...). O editor precisa saber só se outra pessoa salvou o CONTEÚDO
-- enquanto alguém editava: para isso, `content_updated_at`/`content_updated_by`
-- mudam apenas quando o conteúdo muda. Sem falso alarme de conflito quando
-- alguém só troca o status, e o histórico atribui cada versão a quem
-- escreveu o texto.

alter table public.docs
  add column content_updated_at timestamptz not null default now(),
  add column content_updated_by uuid references public.profiles (id) on delete set null;

-- Documentos que já existiam: o carimbo começa no da última alteração.
update public.docs
set content_updated_at = updated_at,
    content_updated_by = coalesce(updated_by, created_by)
where content_updated_by is null;

create index docs_content_updated_by_idx on public.docs (content_updated_by);

-- Mesmo trigger, agora com o carimbo do conteúdo. Versões: ao mudar título ou
-- conteúdo, guarda o estado anterior se quem escreveu o texto anterior é
-- outra pessoa ou se não há versão dos últimos 30 minutos.
create or replace function private.set_doc_fields()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.updated_by := auth.uid();

  if tg_op = 'INSERT' then
    new.content_updated_at := now();
    new.content_updated_by := auth.uid();
    return new;
  end if;

  new.created_by := old.created_by;
  new.created_at := old.created_at;

  if new.content is distinct from old.content then
    new.content_updated_at := now();
    new.content_updated_by := auth.uid();
  else
    new.content_updated_at := old.content_updated_at;
    new.content_updated_by := old.content_updated_by;
  end if;

  if (new.content is distinct from old.content or new.title is distinct from old.title)
    and (
      old.content_updated_by is distinct from auth.uid()
      or not exists (
        select 1 from public.doc_versions v
        where v.doc_id = old.id and v.created_at > now() - interval '30 minutes'
      )
    )
  then
    insert into public.doc_versions (doc_id, title, content, saved_by, saved_at)
    values (
      old.id,
      old.title,
      old.content,
      coalesce(old.content_updated_by, old.created_by),
      old.content_updated_at
    );
  end if;

  return new;
end;
$$;

revoke all on function private.set_doc_fields() from public;
