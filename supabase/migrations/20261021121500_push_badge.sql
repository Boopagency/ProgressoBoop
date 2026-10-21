-- Boop Admin: número de não lidas no ícone do app (notificações no celular).
--
-- O push passa a levar quantos avisos a pessoa tem sem ler (contando o novo),
-- e o service worker põe esse número no ícone do app instalado (no iPhone,
-- o número; no Android, o Chrome mostra um ponto). Com o app aberto, o sino
-- (equipe) e as Notificações do portal atualizam o número na hora, e ler
-- tudo zera. Só troca as duas funções dos triggers de push_subscriptions;
-- tabelas, políticas e o resto do envio ficam iguais.

create or replace function private.push_team_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.send_push('team', (
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'kind', a.kind, 'actor_name', a.actor_name, 'client_id', a.client_id,
             'client_name', c.name, 'title', a.title, 'body', a.body, 'item_count', a.item_count,
             'link', a.link, 'created_at', a.created_at,
             'unread', (select count(*) from public.notifications n where n.user_id = a.user_id and n.read_at is null),
             'subscriptions', subs.list))
      from added a
      left join public.clients c on c.id = a.client_id
      cross join lateral (
        select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) as list
          from public.push_subscriptions s
         where s.user_id = a.user_id
      ) subs
     where subs.list is not null
  ));
  return null;
end;
$$;

create or replace function private.push_client_notifications()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform private.send_push('client', (
    select jsonb_agg(jsonb_build_object(
             'id', a.id, 'kind', a.kind, 'actor_name', a.actor_name, 'client_id', a.client_id,
             'client_name', c.name, 'title', a.title, 'body', a.body,
             'link', a.link, 'created_at', a.created_at,
             'unread', (select count(*) from public.client_notifications n where n.user_id = a.user_id and n.read_at is null),
             'subscriptions', subs.list))
      from added a
      left join public.clients c on c.id = a.client_id
      cross join lateral (
        select jsonb_agg(jsonb_build_object('endpoint', s.endpoint, 'p256dh', s.p256dh, 'auth', s.auth)) as list
          from public.push_subscriptions s
         where s.user_id = a.user_id
      ) subs
     where subs.list is not null
  ));
  return null;
end;
$$;
