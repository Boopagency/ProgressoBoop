-- Boop Admin: limites do conector do Claude no próprio banco.
--
-- O conector (MCP, /api/mcp) usa o token que o servidor OAuth do Supabase
-- Auth emite para a pessoa. Esse token traz o claim `client_id` (o aplicativo
-- que a pessoa autorizou); as sessões do app não. As ferramentas do conector
-- já não apagam nada nem leem o financeiro; estas políticas garantem o mesmo
-- no banco, inclusive se o token for usado direto na API do Supabase.
--
-- Só acréscimos: políticas restritivas (somam condição às que já existem)
-- que valem apenas para tokens com `client_id`. Para o app nada muda.

create function private.is_oauth_client()
returns boolean
language sql
stable
set search_path = ''
as $$
  select coalesce((select auth.jwt()) ->> 'client_id', '') <> '';
$$;

comment on function private.is_oauth_client() is
  'Token emitido pelo servidor OAuth do Supabase (conector do Claude), não pela sessão do app.';

revoke all on function private.is_oauth_client() from public;
grant execute on function private.is_oauth_client() to authenticated;

-- Financeiro: o conector não vê, não cria, não muda e não apaga nada. -------------

create policy "conector do Claude sem financeiro" on public.finance_entries
  as restrictive for all to authenticated
  using (not (select private.is_oauth_client()))
  with check (not (select private.is_oauth_client()));

create policy "conector do Claude sem financeiro" on public.finance_recurrences
  as restrictive for all to authenticated
  using (not (select private.is_oauth_client()))
  with check (not (select private.is_oauth_client()));

create policy "conector do Claude sem financeiro" on public.finance_settings
  as restrictive for all to authenticated
  using (not (select private.is_oauth_client()))
  with check (not (select private.is_oauth_client()));

create policy "conector do Claude sem financeiro" on public.finance_closings
  as restrictive for all to authenticated
  using (not (select private.is_oauth_client()))
  with check (not (select private.is_oauth_client()));

-- Nada de apagar: todas as tabelas da equipe e as imagens do Storage. ------------
-- Exclusões feitas pelo próprio banco (cascata, funções security definer como
-- o histórico) não passam por estas políticas e continuam como estão.

do $$
declare
  target text;
begin
  foreach target in array array[
    'activity', 'channel_members', 'channel_reads', 'channels', 'client_members',
    'client_reviews', 'clients', 'communications', 'content_ideas', 'content_posts',
    'deals', 'decisions', 'doc_versions', 'docs', 'events', 'finance_closings',
    'finance_entries', 'finance_recurrences', 'finance_settings', 'key_results',
    'meeting_items', 'meetings', 'messages', 'objectives', 'plans', 'profiles',
    'projects', 'saved_views', 'task_assignees', 'tasks', 'weekly_decisions'
  ]
  loop
    execute format(
      'create policy "conector do Claude não apaga" on public.%I '
      'as restrictive for delete to authenticated '
      'using (not (select private.is_oauth_client()))',
      target
    );
  end loop;
end
$$;

create policy "conector do Claude não apaga arquivos" on storage.objects
  as restrictive for delete to authenticated
  using (not (select private.is_oauth_client()));
