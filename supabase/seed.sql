-- Boop Admin: dados iniciais reais. Nada de exemplo ou demonstração.
--
-- Pré-requisito: as contas jabez@, renatha@ e leo@deumboop.com.br já existem
-- no Supabase Auth (criadas à mão; não há cadastro público).
-- Pode rodar mais de uma vez: não duplica nada.

begin;

-- Perfis (a ordem de created_at é a ordem da equipe na interface) -----------------

insert into public.profiles (id, full_name, role, created_at)
select u.id, p.full_name, p.role, now() + make_interval(secs => p.position)
from (values
  (1, 'jabez@deumboop.com.br', 'Jabez', 'Estratégia, tecnologia e operação'),
  (2, 'renatha@deumboop.com.br', 'Renatha', 'Comercial e relacionamento'),
  (3, 'leo@deumboop.com.br', 'Léo', 'Administrativo e financeiro')
) as p (position, email, full_name, role)
join auth.users u on lower(u.email) = p.email
on conflict (id) do nothing;

-- Clientes -----------------------------------------------------------------------

insert into public.clients (name)
values ('Hertmann'), ('Velmont'), ('Hapuck Scents'), ('Boop')
on conflict (name) do nothing;

-- Plano atual ----------------------------------------------------------------------

insert into public.plans (name, starts_on, ends_on)
select 'Estruturação da Boop até 31/10', date '2026-09-25', date '2026-10-31'
where not exists (select 1 from public.plans where name = 'Estruturação da Boop até 31/10');

-- As 25 tarefas do plano -------------------------------------------------------------
-- responsáveis: J = Jabez, R = Renatha, L = Léo (Todos = JRL)

create temporary table plan_seed (
  position int,
  title text,
  people text,
  due date,
  area public.task_area,
  client text
) on commit drop;

insert into plan_seed values
  -- Semana 0 — 25 a 27/09
  (1,  'Banco, login e deploy em admin.deumboop.com.br', 'J', '2026-09-26', 'technology', null),
  (2,  'Cadastrar as tarefas deste plano', 'J', '2026-09-27', 'operations', null),
  (3,  'Criar a conta dos três e testar', 'LR', '2026-09-27', 'technology', null),
  -- Semana 1 — 28/09 a 04/10
  (4,  'Primeira reunião de segunda rodando na ferramenta', 'JRL', '2026-09-28', 'operations', null),
  (5,  'Planilha financeira no ar, com setembro lançado', 'L', '2026-09-30', 'finance', null),
  (6,  'Certificado digital e nota fiscal emitida no Asaas', 'L', '2026-10-02', 'finance', null),
  (7,  'Chip e WhatsApp Business da Boop', 'R', '2026-09-30', 'commercial', null),
  (8,  'Bitwarden, com os acessos da Hertmann e da Velmont migrados', 'J', '2026-10-02', 'technology', null),
  (9,  'Pasta padrão por cliente no Drive', 'L', '2026-10-02', 'operations', null),
  (10, 'Data de reajuste da Hertmann definida e combinada', 'J', '2026-10-04', 'clients', 'Hertmann'),
  -- Semana 2 — 05 a 11/10
  (11, 'Faixas internas de preço, piso por frente', 'JR', '2026-10-07', 'commercial', null),
  (12, 'Roteiro de diagnóstico para reuniões', 'R', '2026-10-09', 'commercial', null),
  (13, 'Lista de 30 empresas de Curitiba para abordagem', 'R', '2026-10-09', 'commercial', null),
  (14, 'Proposta e follow-up do WePlay até fechar', 'R', '2026-10-11', 'commercial', null),
  -- Semana 3 — 12 a 18/10
  (15, 'Case Velmont', 'J', '2026-10-14', 'brand', 'Velmont'),
  (16, 'Calendário editorial da Boop e 4 primeiros vídeos gravados', 'JR', '2026-10-16', 'brand', 'Boop'),
  (17, 'Google Meu Negócio, área de atendimento', 'R', '2026-10-16', 'commercial', null),
  (18, 'Primeiras 10 abordagens da lista feitas', 'R', '2026-10-18', 'commercial', null),
  -- Semana 4 — 19 a 25/10
  (19, 'Stack padrão de hospedagem documentada', 'J', '2026-10-21', 'technology', null),
  (20, 'Checklist de QA de sites', 'J', '2026-10-23', 'technology', null),
  (21, 'Site da Boop com case e serviços', 'J', '2026-10-25', 'brand', 'Boop'),
  (22, 'Mais 20 abordagens e 3 diagnósticos marcados', 'R', '2026-10-25', 'commercial', null),
  -- Semana 5 — 26 a 31/10
  (23, 'Revisão do plano: o que funcionou e o que cortar', 'JRL', '2026-10-26', 'operations', null),
  (24, 'Fechamento de outubro na planilha', 'L', '2026-10-31', 'finance', null),
  (25, 'Meta: 2 propostas enviadas, 1 contrato novo fechado', 'R', '2026-10-31', 'commercial', null);

insert into public.tasks (title, due_date, area, client_id, plan_id, created_by, created_at)
select s.title, s.due, s.area, c.id, pl.id, jabez.id, now() + make_interval(secs => s.position)
from plan_seed s
cross join (select id from public.plans where name = 'Estruturação da Boop até 31/10') pl
cross join (
  select p.id from public.profiles p
  join auth.users u on u.id = p.id
  where lower(u.email) = 'jabez@deumboop.com.br'
) jabez
left join public.clients c on c.name = s.client
where not exists (
  select 1 from public.tasks t where t.plan_id = pl.id and t.title = s.title
);

insert into public.task_assignees (task_id, profile_id)
select t.id, p.id
from plan_seed s
join public.tasks t on t.title = s.title
join public.plans pl on pl.id = t.plan_id and pl.name = 'Estruturação da Boop até 31/10'
join (values
  ('J', 'jabez@deumboop.com.br'),
  ('R', 'renatha@deumboop.com.br'),
  ('L', 'leo@deumboop.com.br')
) as initials (letter, email) on position(initials.letter in s.people) > 0
join auth.users u on lower(u.email) = initials.email
join public.profiles p on p.id = u.id
on conflict do nothing;

-- Reunião semanal: toda segunda-feira às 07:00 (São Paulo), a partir de 28/09 -------

insert into public.events (title, event_type, start_at, all_day, recurrence_rule, created_by)
select 'Reunião semanal da Boop', 'meeting', timestamptz '2026-09-28 07:00:00-03', false, 'FREQ=WEEKLY', p.id
from public.profiles p
join auth.users u on u.id = p.id
where lower(u.email) = 'jabez@deumboop.com.br'
  and not exists (select 1 from public.events where title = 'Reunião semanal da Boop');

commit;
