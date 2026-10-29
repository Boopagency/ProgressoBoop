-- Boop Admin: Instagram dos clientes, parte 3/3 (métricas dos posts).
--
-- Cada post publicado no Instagram (pelo app ou ligado à mão a uma publicação
-- da conta) ganha leituras das métricas em alguns momentos depois da
-- publicação: feed e reels em +1 h, +24 h, +3 dias, +7 dias e +30 dias;
-- stories em +1 h, +12 h e +23 h, antes de sumirem da API (24 h). A regra de
-- quando ler fica no app (src/features/instagram/metrics-logic.ts); o banco
-- guarda as leituras e diz quais posts ainda podem ter leitura.
--
-- O mesmo desenho das partes 1/3 e 2/3: o pg_cron chama, de hora em hora,
-- private.run_instagram_job('collect_metrics'); a rota do app pede os posts
-- candidatos (instagram_metrics_due), lê a Meta com o token de cada cliente
-- (instagram_account_token) e grava cada leitura (instagram_metrics_save).
-- As duas conferem o segredo do Vault.
--
-- Ligar à mão (link_instagram_media, com a sessão da equipe): post publicado
-- sem `instagram_media_id` (reels, vídeo ou post feito direto no Instagram)
-- recebe o id, o link e a data da publicação escolhida; daí entra na coleta.
--
-- Quem lê: a equipe vê tudo; o cliente vê as leituras dos posts publicados
-- dele (cliente ativo), sem as que deram erro. O JSON bruto da Meta (`raw`)
-- fica fora da API.
--
-- Aditivo para o código que está na main: uma tabela, uma view, funções novas
-- e um job novo. Sem delete nem drop.

-- Leituras --------------------------------------------------------------------

create table public.content_post_metrics (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.content_posts (id) on delete cascade,
  -- A publicação lida (o post só tem uma; guardada para conferência).
  instagram_media_id text not null check (char_length(instagram_media_id) between 1 and 64),
  -- O momento da leitura em relação à publicação (metrics-logic.ts).
  checkpoint text not null check (checkpoint in ('1h', '12h', '23h', '24h', '3d', '7d', '30d')),
  collected_at timestamptz not null default now(),
  -- feed (imagem e carrossel), reels (vídeo) ou story.
  media_kind text not null check (media_kind in ('feed', 'reels', 'story')),
  -- O que a Meta deu (null quando a métrica não existe para o tipo ou não veio).
  views bigint check (views >= 0),
  reach bigint check (reach >= 0),
  likes bigint check (likes >= 0),
  comments bigint check (comments >= 0),
  saved bigint check (saved >= 0),
  shares bigint check (shares >= 0),
  total_interactions bigint check (total_interactions >= 0),
  -- Feed e stories.
  follows bigint check (follows >= 0),
  profile_visits bigint check (profile_visits >= 0),
  -- Stories.
  replies bigint check (replies >= 0),
  navigation bigint check (navigation >= 0),
  -- Reels, em milissegundos.
  avg_watch_time_ms bigint check (avg_watch_time_ms >= 0),
  total_watch_time_ms bigint check (total_watch_time_ms >= 0),
  -- A Meta respondeu com erro (a leitura conta como feita, para não insistir).
  error text check (char_length(error) <= 500),
  -- Resposta da Meta, como veio (sem token).
  raw jsonb not null default '{}'::jsonb check (pg_column_size(raw) <= 65536),
  constraint content_post_metrics_post_checkpoint_key unique (post_id, checkpoint)
);
comment on table public.content_post_metrics is
  'Leituras das métricas do Instagram de cada post publicado. Gravadas só por instagram_metrics_save (job, com o segredo).';

create index content_post_metrics_post_collected_idx on public.content_post_metrics (post_id, collected_at desc);

alter table public.content_post_metrics enable row level security;

-- Só leitura pela API, e sem o JSON bruto.
revoke all on public.content_post_metrics from anon;
revoke insert, update, delete, truncate on public.content_post_metrics from authenticated;
revoke select on public.content_post_metrics from authenticated;
grant select (
  id, post_id, instagram_media_id, checkpoint, collected_at, media_kind, views, reach, likes, comments, saved,
  shares, total_interactions, follows, profile_visits, replies, navigation, avg_watch_time_ms, total_watch_time_ms, error
) on public.content_post_metrics to authenticated;

-- Post publicado de um cliente (ativo) da conta logada.
create function private.portal_can_see_post_metrics(target_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.content_posts p
      join public.clients c on c.id = p.client_id
     where p.id = target_post
       and p.stage = 'published'
       and p.client_id in (select private.my_client_ids())
       and c.active
  );
$$;

revoke all on function private.portal_can_see_post_metrics(uuid) from public;
grant execute on function private.portal_can_see_post_metrics(uuid) to authenticated;

create policy "equipe vê as métricas dos posts" on public.content_post_metrics
  for select to authenticated
  using ((select private.is_team_member()));

-- Só as leituras que deram certo: o erro da Meta é coisa da equipe.
create policy "cliente vê as métricas dos posts publicados dele" on public.content_post_metrics
  for select to authenticated
  using (error is null and private.portal_can_see_post_metrics(post_id));

-- A última leitura que deu certo de cada post (com o RLS de quem lê).
create view public.content_post_latest_metrics
with (security_invoker = true)
as
  select distinct on (m.post_id)
         m.post_id, m.checkpoint, m.collected_at, m.media_kind, m.views, m.reach, m.likes, m.comments, m.saved,
         m.shares, m.total_interactions, m.follows, m.profile_visits, m.replies, m.navigation,
         m.avg_watch_time_ms, m.total_watch_time_ms
    from public.content_post_metrics m
   where m.error is null
   order by m.post_id, m.collected_at desc;

comment on view public.content_post_latest_metrics is
  'Última leitura sem erro das métricas do Instagram de cada post.';

revoke all on public.content_post_latest_metrics from anon;
grant select on public.content_post_latest_metrics to authenticated;

-- Ligar à mão (com a sessão da equipe) --------------------------------------

-- O app lista as publicações da conta do cliente (com o token, no servidor),
-- a pessoa escolhe uma e o app confere na Meta que ela é dessa conta antes de
-- chamar aqui. Só post publicado, do Instagram, ainda sem publicação ligada;
-- uma publicação liga a um post só. A data da publicação no Instagram passa a
-- ser a do post (é dela que a coleta conta o tempo).
create function public.link_instagram_media(
  p_post_id uuid,
  p_media_id text,
  p_permalink text,
  p_published_at timestamptz
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  post public.content_posts%rowtype;
begin
  if not private.is_team_member() then
    raise exception 'not_allowed' using errcode = '42501';
  end if;
  if coalesce(char_length(p_media_id), 0) not between 1 and 64 then
    raise exception 'invalid_media' using errcode = '22023';
  end if;
  select * into post from public.content_posts p where p.id = p_post_id for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0002';
  end if;
  if post.stage <> 'published' or not ('instagram' = any (post.networks)) then
    raise exception 'not_published' using errcode = '22023';
  end if;
  if post.instagram_media_id is not null then
    raise exception 'already_linked' using errcode = '55000';
  end if;
  if exists (select 1 from public.content_posts p where p.instagram_media_id = p_media_id) then
    raise exception 'media_taken' using errcode = '23505';
  end if;
  update public.content_posts p
     set instagram_media_id = p_media_id,
         instagram_permalink = case
           when p_permalink ~ '^https://' and char_length(p_permalink) <= 500 then p_permalink
         end,
         publish_status = 'published',
         publish_error = null,
         published_at = case
           when p_published_at is not null and p_published_at <= now() + interval '5 minutes' then p_published_at
           else p.published_at
         end
   where p.id = p_post_id;
end;
$$;

revoke all on function public.link_instagram_media(uuid, text, text, timestamptz) from public, anon;
grant execute on function public.link_instagram_media(uuid, text, text, timestamptz) to authenticated;

-- Job sem sessão (segredo do Vault) -------------------------------------------

-- Posts que ainda podem ter leitura: publicados, com a publicação ligada, da
-- conta de um cliente conectada, há menos de 35 dias (stories: menos de 24 h)
-- e sem leitura nos últimos 30 minutos. Com as leituras já feitas, para o app
-- decidir (metrics-logic.ts). Stories primeiro, porque somem.
create function public.instagram_metrics_due(p_secret text)
returns table (
  post_id uuid,
  client_id uuid,
  media_id text,
  format text,
  published_at timestamptz,
  done text[]
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.instagram_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  return query
    select p.id, p.client_id, p.instagram_media_id, p.format::text, p.published_at,
           coalesce(array_agg(m.checkpoint order by m.collected_at) filter (where m.id is not null), '{}'::text[])
      from public.content_posts p
      left join public.content_post_metrics m on m.post_id = p.id
     where p.stage = 'published'
       and p.instagram_media_id is not null
       and p.published_at is not null
       and p.published_at > now() - interval '35 days'
       and (p.format <> 'stories' or p.published_at > now() - interval '24 hours')
       and exists (
         select 1 from public.social_accounts a
          where a.client_id = p.client_id
            and a.network = 'instagram'
            and a.status <> 'expired'
            and a.token_expires_at > now()
       )
     group by p.id
    having coalesce(max(m.collected_at), '-infinity'::timestamptz) < now() - interval '30 minutes'
     order by (p.format = 'stories') desc, p.published_at
     limit 500;
end;
$$;

revoke all on function public.instagram_metrics_due(text) from public;
grant execute on function public.instagram_metrics_due(text) to anon, authenticated;

-- Número da métrica no JSON (inteiro, não negativo), ou null.
create function private.metric_value(p_metrics jsonb, p_key text)
returns bigint
language sql
immutable
set search_path = ''
as $$
  select case
    when jsonb_typeof(p_metrics -> p_key) = 'number' and (p_metrics ->> p_key)::numeric between 0 and 9e15
      then round((p_metrics ->> p_key)::numeric)::bigint
  end;
$$;

revoke all on function private.metric_value(jsonb, text) from public;

-- Grava uma leitura (ou o erro da Meta). Se a publicação do post mudou
-- enquanto o job lia, descarta. A mesma leitura de novo substitui a anterior.
create function public.instagram_metrics_save(
  p_secret text,
  p_post_id uuid,
  p_media_id text,
  p_checkpoint text,
  p_media_kind text,
  p_metrics jsonb,
  p_raw jsonb,
  p_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  m jsonb := case when jsonb_typeof(p_metrics) = 'object' then p_metrics else '{}'::jsonb end;
begin
  if not private.instagram_secret_ok(p_secret) then
    raise exception 'Não autorizado.' using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.content_posts p where p.id = p_post_id and p.instagram_media_id = p_media_id
  ) then
    return false;
  end if;
  insert into public.content_post_metrics as c (
    post_id, instagram_media_id, checkpoint, collected_at, media_kind, views, reach, likes, comments, saved, shares,
    total_interactions, follows, profile_visits, replies, navigation, avg_watch_time_ms, total_watch_time_ms, error, raw
  )
  values (
    p_post_id, p_media_id, p_checkpoint, now(), p_media_kind,
    private.metric_value(m, 'views'), private.metric_value(m, 'reach'), private.metric_value(m, 'likes'),
    private.metric_value(m, 'comments'), private.metric_value(m, 'saved'), private.metric_value(m, 'shares'),
    private.metric_value(m, 'total_interactions'), private.metric_value(m, 'follows'),
    private.metric_value(m, 'profile_visits'), private.metric_value(m, 'replies'),
    private.metric_value(m, 'navigation'), private.metric_value(m, 'avg_watch_time_ms'),
    private.metric_value(m, 'total_watch_time_ms'),
    left(nullif(trim(p_error), ''), 500),
    case when pg_column_size(p_raw) <= 65536 and p_raw is not null then p_raw else '{}'::jsonb end
  )
  on conflict (post_id, checkpoint) do update
    set instagram_media_id = excluded.instagram_media_id,
        collected_at = excluded.collected_at,
        media_kind = excluded.media_kind,
        views = excluded.views,
        reach = excluded.reach,
        likes = excluded.likes,
        comments = excluded.comments,
        saved = excluded.saved,
        shares = excluded.shares,
        total_interactions = excluded.total_interactions,
        follows = excluded.follows,
        profile_visits = excluded.profile_visits,
        replies = excluded.replies,
        navigation = excluded.navigation,
        avg_watch_time_ms = excluded.avg_watch_time_ms,
        total_watch_time_ms = excluded.total_watch_time_ms,
        error = excluded.error,
        raw = excluded.raw;
  return true;
end;
$$;

revoke all on function public.instagram_metrics_save(text, uuid, text, text, text, jsonb, jsonb, text) from public;
grant execute on function public.instagram_metrics_save(text, uuid, text, text, text, jsonb, jsonb, text) to anon, authenticated;

-- Coleta das métricas: de hora em hora, aos 23 minutos.
select cron.schedule(
  'instagram-collect-metrics',
  '23 * * * *',
  $$select private.run_instagram_job('collect_metrics')$$
);
