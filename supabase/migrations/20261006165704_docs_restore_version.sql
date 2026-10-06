-- Boop Admin: Processos — restaurar uma versão sem perder o texto atual.
--
-- O trigger set_doc_fields guarda no máximo uma versão a cada 30 minutos por
-- pessoa. Ao restaurar uma versão, o estado atual precisa ir SEMPRE para o
-- histórico (para dar para desfazer a restauração): restore_doc_version
-- liga uma opção da transação que o trigger respeita.

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
      current_setting('boop.force_doc_version', true) = 'on'
      or old.content_updated_by is distinct from auth.uid()
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

-- Volta o documento para uma versão. Roda com as permissões de quem chama
-- (RLS de docs e doc_versions). `version_text` é o texto puro da versão,
-- calculado pelo app. Devolve o novo carimbo do conteúdo, ou null se a
-- versão não existe.
create function public.restore_doc_version(version_id uuid, version_text text)
returns timestamptz
language plpgsql
security invoker
set search_path = ''
as $$
declare
  restored timestamptz;
begin
  perform set_config('boop.force_doc_version', 'on', true);
  update public.docs d
  set title = v.title,
      content = v.content,
      content_text = left(coalesce(version_text, ''), 300000)
  from public.doc_versions v
  where v.id = version_id and d.id = v.doc_id
  returning d.content_updated_at into restored;
  perform set_config('boop.force_doc_version', 'off', true);
  return restored;
end;
$$;

revoke all on function public.restore_doc_version(uuid, text) from public, anon;
grant execute on function public.restore_doc_version(uuid, text) to authenticated;
