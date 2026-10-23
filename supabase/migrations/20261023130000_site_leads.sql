-- Boop Admin: leads do link da bio (deumboop.com.br/link).
--
-- A página pública do link da bio (site da Boop, sem login) pede nome e
-- WhatsApp antes de abrir a conversa. O formulário chama public.site_lead com
-- a chave publicável (papel anon). A função grava um negócio no Comercial, na
-- etapa Lead, com as UTMs da visita em `deals.utm` e um resumo nas notas, e
-- avisa quem cuida das indicações (`profiles.receives_referrals`), que também
-- vira o responsável. Sem ninguém marcado, a equipe toda é avisada.
--
-- Nenhuma política das tabelas muda: o anon só executa esta função (security
-- definer, search_path vazio), que não devolve nada. Contra abuso: o mesmo
-- WhatsApp não vira outro negócio em 24 h, e acima de 30 leads do site por
-- hora a função recusa.
--
-- Aditivo para o código que está na main: coluna nova em deals, um tipo novo
-- de aviso e uma função nova.

-- Tipo do aviso ---------------------------------------------------------------

alter type public.notification_kind add value if not exists 'site_lead';

-- Coluna ----------------------------------------------------------------------

alter table public.deals add column utm jsonb;
comment on column public.deals.utm is
  'UTMs da visita, nos negócios que chegaram pelo site (link da bio). Vazio nos criados pela equipe.';

-- Lead do site ----------------------------------------------------------------

create function public.site_lead(
  lead_name text,
  lead_phone text,
  lead_company text,
  lead_service text,
  lead_profile text,
  lead_utm jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  person text := nullif(trim(regexp_replace(coalesce(lead_name, ''), '\s+', ' ', 'g')), '');
  company text := nullif(trim(regexp_replace(coalesce(lead_company, ''), '\s+', ' ', 'g')), '');
  service text := nullif(trim(regexp_replace(coalesce(lead_service, ''), '\s+', ' ', 'g')), '');
  -- A aba escolhida na página: tem uma empresa ou é profissional (marca pessoal).
  profile text := case lead_profile
    when 'company' then 'tem uma empresa'
    when 'professional' then 'é profissional (marca pessoal)'
  end;
  digits text := regexp_replace(coalesce(lead_phone, ''), '\D', '', 'g');
  phone text;
  utm jsonb := '{}'::jsonb;
  utm_key text;
  utm_value text;
  origin public.lead_source;
  owner uuid;
  created uuid;
begin
  if person is null or char_length(person) > 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if char_length(company) > 200 then
    raise exception 'invalid_company' using errcode = '22023';
  end if;
  if char_length(service) > 60 then
    raise exception 'invalid_service' using errcode = '22023';
  end if;
  -- Celular ou fixo do Brasil: DDD + número, com ou sem o 55.
  if digits ~ '^55\d{10,11}$' then
    digits := substr(digits, 3);
  end if;
  if digits !~ '^[1-9]{2}\d{8,9}$' then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  phone := '+55 ' || substr(digits, 1, 2) || ' ' || substr(digits, 3, char_length(digits) - 6) || '-' || right(digits, 4);

  if jsonb_typeof(lead_utm) = 'object' then
    foreach utm_key in array array['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] loop
      utm_value := left(nullif(trim(lead_utm ->> utm_key), ''), 100);
      if utm_value is not null then
        utm := utm || jsonb_build_object(utm_key, utm_value);
      end if;
    end loop;
  end if;
  -- Sem UTM, a visita veio do link da bio no Instagram.
  origin := case
    when not utm ? 'utm_source' then 'instagram'
    when lower(utm ->> 'utm_source') in ('instagram', 'google', 'linkedin', 'whatsapp')
      then (lower(utm ->> 'utm_source'))::public.lead_source
    else 'other'
  end;

  -- Pediu de novo (voltou e mandou outra vez): o negócio já está no Comercial.
  if exists (
    select 1 from public.deals d
     where d.utm is not null
       and d.contact_phone = phone
       and d.created_at > now() - interval '1 day'
  ) then
    return;
  end if;
  if (
    select count(*) from public.deals d
     where d.utm is not null
       and d.created_at > now() - interval '1 hour'
  ) >= 30 then
    raise exception 'too_many_leads' using errcode = '54000';
  end if;

  select p.id into owner
    from public.profiles p
   where p.receives_referrals
   order by p.created_at
   limit 1;

  -- created_by aponta para profiles: o lead fica em nome de quem cuida das
  -- indicações (ou de alguém da equipe, se ninguém foi marcado).
  insert into public.deals (
    title, company, contact_name, contact_phone, source, service, stage, owner_id, utm, notes, created_by
  )
  values (
    left(concat_ws(' — ', service, coalesce(company, person)), 200),
    company,
    person,
    phone,
    origin,
    service,
    'lead',
    owner,
    utm,
    'Veio pelo link da bio'
      || coalesce(' (' || nullif(concat_ws(' · ',
           utm ->> 'utm_source', utm ->> 'utm_medium', utm ->> 'utm_campaign', utm ->> 'utm_content', utm ->> 'utm_term'
         ), '') || ')', '')
      || '.' || coalesce(' Perfil: ' || profile || '.', ''),
    coalesce(owner, (select p.id from public.profiles p order by p.created_at limit 1))
  )
  returning id into created;

  insert into public.notifications (user_id, kind, actor_name, title, body, link)
  select p.id, 'site_lead', person, company,
         left(concat_ws(' · ', phone, service, utm ->> 'utm_campaign'), 280),
         '/comercial?negocio=' || created
    from public.profiles p
   where p.receives_referrals
      or not exists (select 1 from public.profiles r where r.receives_referrals);
end;
$$;

revoke execute on function public.site_lead(text, text, text, text, text, jsonb) from public;
grant execute on function public.site_lead(text, text, text, text, text, jsonb) to anon, authenticated;
