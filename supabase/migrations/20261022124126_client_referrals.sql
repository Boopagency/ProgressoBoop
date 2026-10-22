-- Boop Admin: indicações do cliente pelo portal.
--
-- A pessoa do cliente indica alguém (nome, empresa, contato e o que a pessoa
-- precisa) em "Indicar" no portal. A indicação vira um negócio no Comercial,
-- na etapa Lead, com a origem "Indicação" e o cliente que indicou guardado em
-- `deals.referred_by_client_id`. O responsável é quem cuida das indicações
-- (`profiles.receives_referrals`); essa pessoa recebe o aviso no sino e no
-- celular (client_referral). Sem ninguém marcado, o negócio fica sem
-- responsável e a equipe toda é avisada.
--
-- Como nas outras fases do portal, nenhuma política das tabelas da equipe
-- muda: a conta do cliente grava e lê só pelas funções `portal_*` (security
-- definer, search_path vazio), que conferem private.my_client_ids() e o
-- cliente ativo. O cliente vê só as indicações do próprio cliente, com o
-- mínimo: quem, quando e em que pé está (nada de valores nem notas).
--
-- Aditivo para o código que está na main: coluna nova em deals e profiles,
-- um tipo novo de aviso e funções novas.

-- Tipo do aviso ---------------------------------------------------------------

alter type public.notification_kind add value if not exists 'client_referral';

-- Colunas ---------------------------------------------------------------------

alter table public.profiles
  add column receives_referrals boolean not null default false;
comment on column public.profiles.receives_referrals is
  'Cuida das indicações dos clientes: vira responsável pelo negócio e recebe o aviso.';

alter table public.deals
  add column referred_by_client_id uuid references public.clients (id) on delete set null;
comment on column public.deals.referred_by_client_id is
  'Cliente que indicou (indicação feita pelo portal).';

create index deals_referred_by_client_id_idx on public.deals (referred_by_client_id);

-- Indicar ---------------------------------------------------------------------

-- Grava a indicação como negócio (Lead, origem Indicação) e avisa quem cuida
-- das indicações. Nome obrigatório e pelo menos um contato (telefone ou
-- e-mail). Até 20 indicações por cliente por dia, contra envio repetido.
create function public.portal_refer_lead(
  target_client uuid,
  referral_name text,
  referral_company text,
  referral_phone text,
  referral_email text,
  referral_note text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  me uuid := (select auth.uid());
  client_name text;
  member_name text;
  owner uuid;
  person text := nullif(trim(regexp_replace(coalesce(referral_name, ''), '\s+', ' ', 'g')), '');
  company text := nullif(trim(regexp_replace(coalesce(referral_company, ''), '\s+', ' ', 'g')), '');
  phone text := nullif(trim(coalesce(referral_phone, '')), '');
  email text := nullif(lower(trim(coalesce(referral_email, ''))), '');
  note text := nullif(trim(coalesce(referral_note, '')), '');
  created uuid;
begin
  select c.name into client_name
    from public.clients c
   where c.id = target_client
     and c.active
     and c.id in (select private.my_client_ids());
  if client_name is null then
    raise exception 'client_not_found' using errcode = 'P0002';
  end if;
  if person is null or char_length(person) > 120 then
    raise exception 'invalid_name' using errcode = '22023';
  end if;
  if char_length(company) > 200 then
    raise exception 'invalid_company' using errcode = '22023';
  end if;
  if char_length(phone) > 40 then
    raise exception 'invalid_phone' using errcode = '22023';
  end if;
  if char_length(email) > 200 or (email is not null and email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$') then
    raise exception 'invalid_email' using errcode = '22023';
  end if;
  if phone is null and email is null then
    raise exception 'contact_required' using errcode = '22023';
  end if;
  if char_length(note) > 2000 then
    raise exception 'invalid_note' using errcode = '22023';
  end if;
  if (
    select count(*) from public.deals d
     where d.referred_by_client_id = target_client
       and d.created_at > now() - interval '1 day'
  ) >= 20 then
    raise exception 'too_many_referrals' using errcode = '54000';
  end if;

  select left(cm.full_name, 120) into member_name
    from public.client_members cm
   where cm.user_id = me and cm.client_id = target_client;
  select p.id into owner
    from public.profiles p
   where p.receives_referrals
   order by p.created_at
   limit 1;

  -- created_by aponta para profiles: a indicação fica em nome de quem cuida
  -- delas (ou de alguém da equipe, se ninguém foi marcado).
  insert into public.deals (
    title, company, contact_name, contact_email, contact_phone, source, stage, owner_id,
    referred_by_client_id, notes, created_by
  )
  values (
    left(coalesce(company, person), 200),
    company,
    person,
    email,
    phone,
    'referral',
    'lead',
    owner,
    target_client,
    left(
      'Indicação de ' || coalesce(member_name, 'alguém') || ' (' || client_name || '), pelo portal.'
        || coalesce(E'\n\n' || note, ''),
      5000
    ),
    coalesce(owner, (select p.id from public.profiles p order by p.created_at limit 1))
  )
  returning id into created;

  insert into public.notifications (user_id, kind, actor_id, actor_name, client_id, title, body, link)
  select p.id, 'client_referral', me, member_name, target_client,
         left(coalesce(company, person), 300),
         left(trim(regexp_replace(
           concat_ws(' · ', case when company is not null then person end, phone, email, note), '\s+', ' ', 'g'
         )), 280),
         '/comercial?negocio=' || created
    from public.profiles p
   where p.receives_referrals
      or not exists (select 1 from public.profiles r where r.receives_referrals);

  return created;
end;
$$;

-- Indicações do cliente, a mais recente primeiro: quem, quando e em que pé
-- está (recebida, em conversa, virou cliente ou encerrada). Até 100.
create function public.portal_referrals(target_client uuid)
returns table (
  id uuid,
  contact_name text,
  company text,
  status text,
  created_at timestamptz
)
language sql
stable
security definer
set search_path = ''
as $$
  select d.id, d.contact_name, d.company,
         case d.stage
           when 'lead' then 'received'
           when 'won' then 'won'
           when 'lost' then 'closed'
           else 'talking'
         end,
         d.created_at
    from public.deals d
    join public.clients c on c.id = d.referred_by_client_id
   where d.referred_by_client_id = target_client
     and c.active
     and target_client in (select private.my_client_ids())
   order by d.created_at desc
   limit 100;
$$;

revoke execute on function public.portal_refer_lead(uuid, text, text, text, text, text) from public, anon;
grant execute on function public.portal_refer_lead(uuid, text, text, text, text, text) to authenticated;
revoke execute on function public.portal_referrals(uuid) from public, anon;
grant execute on function public.portal_referrals(uuid) to authenticated;
