-- O cliente do portal não via as imagens de um post que mudou de cliente: os
-- arquivos ficam na pasta de quem era o cliente quando foram enviados
-- (`<cliente antigo>/<arquivo>`), e a política exigia a pasta do cliente atual.
-- Basta o objeto ser a capa ou um slide de um post que ele vê (ou a foto do
-- perfil do cliente dele); a pasta não importa.

create or replace function private.portal_can_read_content_object(object_name text)
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
       and (
         c.avatar_path = object_name
         or exists (
           select 1 from public.content_posts p
            where p.client_id = c.id
              and private.portal_visible_post(p.id, p.stage)
              and (
                p.cover_path = object_name
                or p.slides @> jsonb_build_array(jsonb_build_object('image_path', object_name))
              )
         )
       )
  );
$$;
