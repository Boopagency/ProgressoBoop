-- Boop Admin: portal do cliente, fase 3 (conteúdo e aprovação; banco, sem telas).
--
-- A conta do cliente (client_members, sem perfil) passa a ver os posts do
-- cliente dela a partir de "com o cliente" (com o cliente, aprovado,
-- programado, publicado), aprovar ou pedir ajuste nos que estão "com o
-- cliente" e conversar no chat de cada post. O chat é o canal do cliente
-- (channels/messages), filtrado pelo post: tudo o que o cliente escreve cai
-- em "Alterações – <cliente>", para a equipe.
--
-- Como na fase 1, nenhuma política das tabelas da equipe muda e o cliente lê
-- e escreve só por funções security definer, que conferem
-- private.my_client_ids() e devolvem só os campos liberados (nada de
-- orientação de design, roteiro, frentes, responsável, link do Drive ou
-- notas). A única política nova é a de leitura das imagens no Storage, só
-- das usadas nos posts que o cliente vê e da foto do perfil.

-- Histórico: autor só da equipe ------------------------------------------------
-- activity.actor_id aponta para profiles. Quando o cliente aprova (o post muda
-- de etapa pela função do portal), o histórico registra a mudança sem autor.

create or replace function private.log_activity(
  p_entity_type text,
  p_entity_id uuid,
  p_title text,
  p_project_id uuid,
  p_client_id uuid,
  p_action public.activity_action,
  p_changes jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  -- Só gente da equipe aparece como autor; uma conta de cliente (portal) fica
  -- vazia aqui (o histórico mostra "O sistema") e a voz dela fica no canal.
  actor uuid := (select p.id from public.profiles p where p.id = (select auth.uid()));
  stamp timestamptz := clock_timestamp();
  last_row public.activity%rowtype;
  merged jsonb;
  field text;
begin
  -- Projeto ou cliente que acabou de ser excluído (cascata): sem vínculo.
  if p_project_id is not null and not exists (select 1 from public.projects p where p.id = p_project_id) then
    p_project_id := null;
  end if;
  if p_client_id is not null and not exists (select 1 from public.clients c where c.id = p_client_id) then
    p_client_id := null;
  end if;
  if p_action = 'updated' then
    if p_changes = '{}'::jsonb then
      return;
    end if;
    select * into last_row
      from public.activity a
     where a.entity_type = p_entity_type
       and a.entity_id = p_entity_id
     order by a.created_at desc, a.id desc
     limit 1;
    if found
      and last_row.actor_id is not distinct from actor
      and last_row.action in ('created', 'updated')
    then
      if last_row.action = 'created' and last_row.created_at > now() - interval '2 minutes' then
        update public.activity
           set entity_title = left(coalesce(p_title, ''), 300),
               project_id = p_project_id,
               client_id = p_client_id
         where id = last_row.id;
        return;
      end if;
      if last_row.action = 'updated' and last_row.created_at > now() - interval '10 minutes' then
        merged := last_row.changes;
        for field in select jsonb_object_keys(p_changes) loop
          if merged ? field then
            merged := jsonb_set(merged, array[field], jsonb_build_array(merged -> field -> 0, p_changes -> field -> 1));
          else
            merged := merged || jsonb_build_object(field, p_changes -> field);
          end if;
          if (merged -> field -> 0) = (merged -> field -> 1) then
            merged := merged - field;
          end if;
        end loop;
        if merged = '{}'::jsonb then
          delete from public.activity where id = last_row.id;
        else
          update public.activity
             set changes = merged,
                 created_at = stamp,
                 entity_title = left(coalesce(p_title, ''), 300),
                 project_id = p_project_id,
                 client_id = p_client_id
           where id = last_row.id;
        end if;
        return;
      end if;
    end if;
  end if;

  insert into public.activity (entity_type, entity_id, entity_title, project_id, client_id, action, changes, actor_id, created_at)
  values (p_entity_type, p_entity_id, left(coalesce(p_title, ''), 300), p_project_id, p_client_id, p_action, p_changes, actor, stamp);
end;
$$;

revoke all on function private.log_activity(text, uuid, text, uuid, uuid, public.activity_action, jsonb) from public;

-- Posts que o cliente vê ---------------------------------------------------------

create function private.portal_visible_stage(stage public.content_stage)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select stage in ('client_review', 'approved', 'scheduled', 'published');
$$;

revoke all on function private.portal_visible_stage(public.content_stage) from public;
grant execute on function private.portal_visible_stage(public.content_stage) to authenticated;

-- Post que a conta logada pode ver no portal (do cliente dela, etapa liberada).
create function private.portal_can_see_post(target_post uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.content_posts p
     where p.id = target_post
       and p.client_id in (select private.my_client_ids())
       and private.portal_visible_stage(p.stage)
  );
$$;

revoke all on function private.portal_can_see_post(uuid) from public;
grant execute on function private.portal_can_see_post(uuid) to authenticated;

-- Perfil do Instagram do cliente (cabeçalho do feed).
create function public.portal_client_profile(target_client uuid)
returns table (client_id uuid, client_name text, instagram_handle text, instagram_bio text, avatar_path text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.id, c.name, c.instagram_handle, c.instagram_bio, c.avatar_path
    from public.clients c
   where c.id = target_client
     and c.active
     and c.id in (select private.my_client_ids());
$$;

-- Posts do cliente que já chegaram a ele, com o que ele precisa ver.
create function public.portal_posts(target_client uuid)
returns table (
  id uuid,
  title text,
  format public.content_format,
  networks public.content_network[],
  publish_on date,
  publish_time time,
  stage public.content_stage,
  caption text,
  slides jsonb,
  cover_path text,
  pinned boolean,
  published_at timestamptz,
  updated_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select p.id, p.title, p.format, p.networks, p.publish_on, p.publish_time, p.stage, p.caption, p.slides,
         p.cover_path, p.pinned, p.published_at, p.updated_at
    from public.content_posts p
    join public.clients c on c.id = p.client_id
   where p.client_id = target_client
     and c.active
     and p.client_id in (select private.my_client_ids())
     and private.portal_visible_stage(p.stage)
   order by p.publish_on nulls last, p.publish_time nulls last, p.created_at;
$$;

-- Chat do post -----------------------------------------------------------------

-- Mensagens do canal do cliente sobre o post, com o nome de quem escreveu
-- (equipe pelo perfil, cliente pelo nome do acesso). Só as do canal do
-- cliente: nada de canal interno.
create function public.portal_post_messages(target_post uuid)
returns table (
  id uuid,
  kind public.message_kind,
  body text,
  author_name text,
  from_team boolean,
  mine boolean,
  resolved boolean,
  created_at timestamptz,
  edited_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select m.id,
         m.kind,
         m.body,
         coalesce(pr.full_name, cm.full_name, 'Conta removida'),
         pr.id is not null,
         m.author_id is not distinct from (select auth.uid()),
         m.resolved_at is not null,
         m.created_at,
         m.edited_at
    from public.messages m
    join public.channels ch on ch.id = m.channel_id and ch.kind = 'client'
    join public.content_posts p on p.id = m.post_id and p.client_id = ch.client_id
    left join public.profiles pr on pr.id = m.author_id
    left join public.client_members cm on cm.user_id = m.author_id and cm.client_id = ch.client_id
   where m.post_id = target_post
     and private.portal_can_see_post(target_post)
   order by m.created_at;
$$;

-- O cliente escreve no chat do post (vai para o canal do cliente).
create function public.portal_send_message(target_post uuid, message_body text)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_channel uuid;
  created uuid;
begin
  if not private.portal_can_see_post(target_post) then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  if char_length(trim(coalesce(message_body, ''))) not between 1 and 5000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;

  select ch.id into target_channel
    from public.channels ch
    join public.content_posts p on p.client_id = ch.client_id
   where p.id = target_post and ch.kind = 'client';
  if target_channel is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;

  insert into public.messages (channel_id, post_id, author_id, kind, body)
  values (target_channel, target_post, (select auth.uid()), 'text', message_body)
  returning id into created;
  return created;
end;
$$;

-- Aprovar ou pedir ajuste ---------------------------------------------------------

-- Só em post "com o cliente". Aprovar leva a "aprovado"; pedir ajuste (com o
-- que mudar) volta para "revisão interna". As duas viram mensagem no chat do
-- post (aprovação ou pedido de ajuste, que a equipe transforma em tarefa).
create function public.portal_review_post(target_post uuid, decision text, note text default null)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  post public.content_posts%rowtype;
  target_channel uuid;
  text_note text := nullif(trim(coalesce(note, '')), '');
  created uuid;
begin
  if decision not in ('approve', 'changes') then
    raise exception 'invalid_decision' using errcode = '22023';
  end if;
  if decision = 'changes' and text_note is null then
    raise exception 'note_required' using errcode = '22023';
  end if;
  if char_length(coalesce(text_note, '')) > 5000 then
    raise exception 'invalid_body' using errcode = '22023';
  end if;

  select * into post from public.content_posts p where p.id = target_post for update;
  if not found or post.client_id not in (select private.my_client_ids()) or not private.portal_visible_stage(post.stage) then
    raise exception 'post_not_found' using errcode = 'P0002';
  end if;
  if post.stage <> 'client_review' then
    raise exception 'not_in_client_review' using errcode = 'P0001';
  end if;

  select ch.id into target_channel from public.channels ch where ch.client_id = post.client_id and ch.kind = 'client';
  if target_channel is null then
    raise exception 'channel_not_found' using errcode = 'P0002';
  end if;

  update public.content_posts p
     set stage = case when decision = 'approve' then 'approved'::public.content_stage else 'internal_review'::public.content_stage end
   where p.id = target_post;

  insert into public.messages (channel_id, post_id, author_id, kind, body)
  values (
    target_channel,
    target_post,
    (select auth.uid()),
    case when decision = 'approve' then 'approval'::public.message_kind else 'change_request'::public.message_kind end,
    coalesce(text_note, 'Aprovado.')
  )
  returning id into created;
  return created;
end;
$$;

revoke execute on function public.portal_client_profile(uuid) from public, anon;
grant execute on function public.portal_client_profile(uuid) to authenticated;
revoke execute on function public.portal_posts(uuid) from public, anon;
grant execute on function public.portal_posts(uuid) to authenticated;
revoke execute on function public.portal_post_messages(uuid) from public, anon;
grant execute on function public.portal_post_messages(uuid) to authenticated;
revoke execute on function public.portal_send_message(uuid, text) from public, anon;
grant execute on function public.portal_send_message(uuid, text) to authenticated;
revoke execute on function public.portal_review_post(uuid, text, text) from public, anon;
grant execute on function public.portal_review_post(uuid, text, text) to authenticated;

-- Imagens ------------------------------------------------------------------------
-- O app gera a URL assinada com a sessão da pessoa, então o cliente precisa
-- ler o objeto no Storage. Só os usados como capa ou slide de um post que ele
-- vê e a foto do perfil do cliente dele; nada mais da pasta.

create function private.portal_can_read_content_object(object_name text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.clients c
     where c.id in (select private.my_client_ids())
       and c.active
       and object_name like c.id::text || '/%'
       and (
         c.avatar_path = object_name
         or exists (
           select 1 from public.content_posts p
            where p.client_id = c.id
              and private.portal_visible_stage(p.stage)
              and (
                p.cover_path = object_name
                or p.slides @> jsonb_build_array(jsonb_build_object('image_path', object_name))
              )
         )
       )
  );
$$;

revoke all on function private.portal_can_read_content_object(text) from public;
grant execute on function private.portal_can_read_content_object(text) to authenticated;

create policy "cliente vê as imagens dos próprios posts" on storage.objects
  for select to authenticated
  using (bucket_id = 'content' and private.portal_can_read_content_object(name));
