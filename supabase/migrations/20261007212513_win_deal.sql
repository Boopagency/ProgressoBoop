-- Boop Admin: negócio ganho vira cliente, contrato e projeto numa operação só.
--
-- O comercial não copia valores para o financeiro: ao ganhar, o negócio cria
-- (ou liga) o cliente, a receita recorrente do contrato (finance_recurrences),
-- a entrada pontual (finance_entries) e o projeto, e guarda os vínculos. Tudo
-- na mesma transação, com as permissões de quem está logado (RLS).

create function public.win_deal(
  deal_id uuid,
  client_id uuid default null,
  client_name text default null,
  contract_day smallint default null,
  contract_starts_on date default null,
  contract_months smallint default null,
  one_time_due_on date default null,
  project_name text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  deal public.deals%rowtype;
  today date := (now() at time zone 'America/Sao_Paulo')::date;
  resolved_client uuid := client_id;
  resolved_name text;
  existing record;
  created_client boolean := false;
  new_project uuid;
  new_recurrence uuid;
  new_entry uuid;
begin
  select * into deal from public.deals d where d.id = win_deal.deal_id for update;
  if not found then
    raise exception 'deal_not_found' using errcode = 'P0002';
  end if;
  if deal.stage in ('won', 'lost') then
    raise exception 'deal_closed' using errcode = 'P0001';
  end if;
  if contract_day is not null and (contract_day not between 1 and 31
    or contract_starts_on is null or extract(day from contract_starts_on) <> 1
    or (contract_months is not null and contract_months not between 1 and 120)) then
    raise exception 'invalid_contract' using errcode = '22023';
  end if;

  -- Cliente: o escolhido, o de mesmo nome ou um novo (com o contato do negócio).
  if resolved_client is not null then
    select c.name into resolved_name from public.clients c where c.id = resolved_client;
    if not found then
      raise exception 'client_not_found' using errcode = 'P0002';
    end if;
  else
    resolved_name := nullif(trim(coalesce(client_name, deal.company, deal.title)), '');
    if resolved_name is null or char_length(resolved_name) > 120 then
      raise exception 'invalid_client' using errcode = '22023';
    end if;
    select c.id, c.name into existing
      from public.clients c where lower(c.name) = lower(resolved_name) limit 1;
    if found then
      resolved_client := existing.id;
      resolved_name := existing.name;
    else
      insert into public.clients (name, contact_name, contact_email, contact_phone, owner_id, services, since)
      values (
        resolved_name,
        deal.contact_name,
        deal.contact_email,
        deal.contact_phone,
        deal.owner_id,
        case when deal.service is null then '{}'::text[] else array[deal.service] end,
        today
      )
      returning id into resolved_client;
      created_client := true;
    end if;
  end if;

  if nullif(trim(coalesce(project_name, '')), '') is not null then
    insert into public.projects (name, client_id, owner_id, starts_on, description)
    values (left(trim(project_name), 200), resolved_client, deal.owner_id, today, deal.notes)
    returning id into new_project;
  end if;

  if contract_day is not null and deal.recurring_cents > 0 then
    insert into public.finance_recurrences (
      kind, account, description, amount_cents, day_of_month, category, client_id, project_id, starts_on, ends_on, notes
    )
    values (
      'income',
      'client_revenue',
      left('Mensalidade ' || resolved_name, 200),
      deal.recurring_cents,
      contract_day,
      deal.service,
      resolved_client,
      new_project,
      contract_starts_on,
      case when contract_months is null then null
        else (contract_starts_on + make_interval(months => contract_months - 1))::date end,
      left('Negócio: ' || deal.title, 2000)
    )
    returning id into new_recurrence;
  end if;

  if one_time_due_on is not null and deal.one_time_cents > 0 then
    insert into public.finance_entries (kind, account, description, amount_cents, due_on, category, client_id, project_id, notes)
    values (
      'income',
      'client_revenue',
      left(deal.title, 200),
      deal.one_time_cents,
      one_time_due_on,
      deal.service,
      resolved_client,
      new_project,
      'Entrada pontual do negócio'
    )
    returning id into new_entry;
  end if;

  update public.deals d
     set stage = 'won',
         client_id = resolved_client,
         project_id = coalesce(new_project, d.project_id),
         recurrence_id = coalesce(new_recurrence, d.recurrence_id)
   where d.id = deal.id;

  return jsonb_build_object(
    'client_id', resolved_client,
    'client_created', created_client,
    'project_id', new_project,
    'recurrence_id', new_recurrence,
    'entry_id', new_entry
  );
end;
$$;

comment on function public.win_deal is
  'Marca o negócio como ganho e cria (ou liga) cliente, contrato recorrente, entrada pontual e projeto.';

revoke execute on function public.win_deal(uuid, uuid, text, smallint, date, smallint, date, text) from public, anon;
grant execute on function public.win_deal(uuid, uuid, text, smallint, date, smallint, date, text) to authenticated;
