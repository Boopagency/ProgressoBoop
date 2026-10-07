-- O mês de uma recorrência só é gravado na primeira mudança (marcar como
-- recebido, pular, mudar o valor). Essa gravação não é um "lançamento novo":
-- o histórico mostra só a mudança ("deu baixa em 06/10"), não "lançou".

create or replace function private.log_finance_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  kind text := case when tg_table_name = 'finance_recurrences' then 'recurrence' else 'finance' end;
  changes jsonb := '{}'::jsonb;
  old_row jsonb := case when tg_op <> 'INSERT' then to_jsonb(old) end;
  new_row jsonb := case when tg_op <> 'DELETE' then to_jsonb(new) end;
  field text;
begin
  if pg_trigger_depth() > 1 then
    return null;
  end if;
  if tg_op = 'INSERT' then
    -- Mês de recorrência gravado agora: a mudança logo em seguida é que conta.
    if new_row ->> 'recurrence_id' is not null then
      return null;
    end if;
    perform private.log_activity(kind, new.id, new.description, new.project_id, new.client_id, 'created', '{}'::jsonb);
  elsif tg_op = 'DELETE' then
    perform private.log_activity(kind, old.id, old.description, old.project_id, old.client_id, 'deleted', '{}'::jsonb);
  else
    foreach field in array array[
      'description', 'amount_cents', 'due_on', 'paid_on', 'skipped', 'day_of_month', 'ends_on',
      'client_id', 'project_id', 'category'
    ] loop
      if new_row ? field then
        changes := private.diff(changes, field, old_row -> field, new_row -> field);
      end if;
    end loop;
    perform private.log_activity(kind, new.id, new.description, new.project_id, new.client_id, 'updated', private.without_cascade(changes));
  end if;
  return null;
end;
$$;
