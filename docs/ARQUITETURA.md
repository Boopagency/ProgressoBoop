# Boop Admin — Arquitetura e plano

Documento de referência da primeira versão do Boop Admin, a ferramenta interna
da Boop. Reúne a análise do repositório, a arquitetura, o schema proposto para
o Supabase, as dependências, a estrutura das telas e o plano de implementação.

> Status: **Etapa 1 (protótipo visual com dados mockados)**. O Supabase ainda
> não está conectado. O schema abaixo é uma proposta para aprovação.

---

## 1. Análise do repositório

- Repositório `Boopagency/ProgressoBoop`: estava **vazio** (sem commits, sem
  branches remotas) no início do trabalho.
- É um projeto **novo e independente** do site institucional
  (`deumboop.com.br`). Nada do repositório do site foi lido, alterado ou
  reutilizado.
- Todo o trabalho acontece na branch `claude/nifty-cray-02c7u5`. Nada é
  commitado na `main`. Como o repositório estava vazio, essa branch pode
  aparecer como padrão no GitHub até criarmos a `main` na aprovação.

## 2. Stack

| Camada       | Escolha                                                      |
| ------------ | ------------------------------------------------------------ |
| Framework    | Next.js 16 (App Router, Turbopack, Server Actions)           |
| Linguagem    | TypeScript em modo estrito                                   |
| Estilo       | Tailwind CSS v4 (configuração em CSS, tokens em `globals.css`) |
| Componentes  | shadcn/ui (estilo new-york, primitivas Radix)                |
| Ícones       | Lucide                                                       |
| Datas        | date-fns (locale `pt-BR`)                                    |
| Backend      | Supabase (Auth + PostgreSQL com RLS) — etapa 2               |
| Deploy       | Vercel em `admin.deumboop.com.br` — etapa 3                  |

## 3. Arquitetura de pastas

Organização por funcionalidade (_features_), que é o padrão recomendado na
documentação atual do Next.js. As rotas em `app/` só compõem componentes das
features.

```
src/
├── app/
│   ├── (app)/                  # área autenticada (layout com sidebar)
│   │   ├── layout.tsx          # sidebar + dados de referência (equipe, clientes, planos)
│   │   ├── page.tsx            # Hoje  → "/"
│   │   ├── loading.tsx / error.tsx
│   │   ├── tarefas/            # "/tarefas"
│   │   ├── calendario/         # "/calendario"
│   │   └── segunda/            # "/segunda"
│   ├── login/                  # "/login" (sem "Criar conta")
│   ├── layout.tsx              # raiz: fonte, <html lang="pt-BR">, Toaster
│   └── globals.css             # Tailwind v4 + tokens do design system
├── components/
│   ├── ui/                     # shadcn/ui (código gerado)
│   └── layout/                 # sidebar, menu do usuário, cabeçalho de página
├── features/
│   ├── auth/                   # sessão, login/logout
│   ├── workspace/              # equipe, clientes, planos (dados de referência)
│   ├── tasks/                  # lista, linha, Sheet, "Nova tarefa", filtros, lógica pura
│   ├── today/                  # blocos da tela Hoje
│   ├── calendar/               # semana/mês, recorrência, eventos
│   └── weekly/                 # tela Segunda e decisões da semana
├── lib/                        # utilitários compartilhados (datas, rótulos, tipos, cn)
├── server/                     # mock em memória (somente etapa 1)
└── proxy.ts                    # proteção de rotas (no Next 16, substitui o middleware)
```

Regras:

- Cada feature concentra `queries.ts` (leitura, só servidor), `actions.ts`
  (Server Actions) e seus componentes.
- A lógica de negócio (agrupamento por prazo, progresso, recorrência) fica em
  funções puras, sem React, fáceis de testar e reaproveitar.
- `components/ui` não recebe regra de negócio.

## 4. Fluxo de dados

```
Server Component (page.tsx)
  └─ lê dados via queries.ts   ── etapa 1: mock em memória / etapa 2: Supabase
      └─ Client Component (visão da tela)
           ├─ useOptimistic → a UI muda no mesmo frame (checkbox, progresso)
           └─ Server Action → grava → refresh() → o servidor re-renderiza a tela
```

- **Leitura:** as páginas são Server Components e buscam os dados no servidor.
  O volume é pequeno (dezenas ou centenas de tarefas), então cada tela busca o
  que precisa e os filtros rodam no cliente, de forma instantânea.
- **Escrita:** Server Actions com validação simples no servidor. Na etapa 2, o
  RLS do Postgres é a segunda camada de proteção.
- **Otimismo:** concluir uma tarefa atualiza checkbox, contadores e barras de
  progresso na hora. Se o servidor falhar, a UI volta e aparece um toast.
- **Etapa 1 → etapa 2:** as telas não mudam. Só a implementação de
  `queries.ts`/`actions.ts` e da sessão troca do mock para o Supabase.

## 5. Schema do Supabase (proposta)

Tabelas pedidas: `profiles`, `clients`, `tasks`, `events`, `weekly_decisions`.
Duas adições com necessidade real, documentadas abaixo: `task_assignees` e
`plans`.

### 5.1 Decisões sobre o schema

1. **`task_assignees` (tarefa ↔ pessoa)** em vez de `assignee_id`. O plano tem
   tarefas de duas pessoas e de "Todos". A tabela de relação mantém
   integridade (FK + cascade) e a consulta continua simples.
   "Todos" = as três pessoas atribuídas, e a interface mostra "Todos".
2. **`plans` (nova, pequena)**. A tela Hoje mostra
   "Estruturação da Boop até 31/10 — 12 de 25 tarefas". Para isso é preciso
   saber **quais** tarefas pertencem ao plano. Filtrar por data misturaria
   tarefas avulsas de clientes com as do plano. Com `plans` + `tasks.plan_id`,
   o progresso sai de uma contagem, e o próximo plano (novembro, por exemplo)
   é só uma nova linha.
3. **`recurrence`** substitui `recurring` + `recurrence_rule`. Uma coluna só
   (`null` = não recorrente, `'weekly'` = toda semana no mesmo dia e horário)
   evita estados inválidos e dispensa biblioteca de RRULE. Novos valores
   (mensal etc.) entram por migration quando houver necessidade.
4. **`all_day`** em `events`: entregas costumam não ter horário.
5. **Enums** com códigos em inglês e rótulos em português num único arquivo
   (`src/lib/labels.ts`).
6. **`completed_at`** é preenchido por trigger no banco quando o status vira
   `done` e limpo quando sai de `done`. A regra fica garantida para qualquer
   cliente.
7. **Área, cliente e prazo** são opcionais no banco. O formulário rápido pede
   prazo, mas não bloqueia.

### 5.2 SQL

```sql
-- Tipos
create type public.task_status     as enum ('todo', 'doing', 'done');
create type public.task_priority   as enum ('low', 'normal', 'high');
create type public.task_area       as enum ('commercial', 'finance', 'operations', 'brand', 'technology', 'clients');
create type public.event_type      as enum ('meeting', 'internal', 'delivery');
create type public.event_recurrence as enum ('weekly');

-- Pessoas (1:1 com auth.users)
create table public.profiles (
  id          uuid primary key references auth.users on delete cascade,
  full_name   text not null,
  avatar_url  text,
  role        text,
  created_at  timestamptz not null default now()
);

create table public.clients (
  id          uuid primary key default gen_random_uuid(),
  name        text not null unique,
  active      boolean not null default true,
  created_at  timestamptz not null default now()
);

create table public.plans (
  id          uuid primary key default gen_random_uuid(),
  name        text not null,
  starts_on   date not null,
  ends_on     date not null check (ends_on >= starts_on),
  created_at  timestamptz not null default now()
);

create table public.tasks (
  id            uuid primary key default gen_random_uuid(),
  title         text not null check (length(btrim(title)) > 0),
  description   text,
  client_id     uuid references public.clients on delete set null,
  plan_id       uuid references public.plans on delete set null,
  area          public.task_area,
  status        public.task_status not null default 'todo',
  priority      public.task_priority not null default 'normal',
  due_date      date,
  completed_at  timestamptz,
  created_by    uuid not null default auth.uid() references public.profiles,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

create table public.task_assignees (
  task_id     uuid not null references public.tasks on delete cascade,
  profile_id  uuid not null references public.profiles on delete cascade,
  primary key (task_id, profile_id)
);

create table public.events (
  id           uuid primary key default gen_random_uuid(),
  title        text not null check (length(btrim(title)) > 0),
  description  text,
  event_type   public.event_type not null default 'meeting',
  start_at     timestamptz not null,
  end_at       timestamptz check (end_at is null or end_at >= start_at),
  all_day      boolean not null default false,
  recurrence   public.event_recurrence,
  client_id    uuid references public.clients on delete set null,
  created_by   uuid not null default auth.uid() references public.profiles,
  created_at   timestamptz not null default now()
);

create table public.weekly_decisions (
  id          uuid primary key default gen_random_uuid(),
  content     text not null check (length(btrim(content)) > 0),
  week_start  date not null check (extract(isodow from week_start) = 1), -- sempre segunda
  created_by  uuid not null default auth.uid() references public.profiles,
  created_at  timestamptz not null default now()
);

create index on public.tasks (due_date);
create index on public.tasks (plan_id);
create index on public.task_assignees (profile_id);
create index on public.events (start_at);
create index on public.weekly_decisions (week_start);

-- completed_at e updated_at automáticos
create function public.set_task_timestamps() returns trigger
language plpgsql as $$
begin
  new.updated_at := now();
  if new.status = 'done' then
    if tg_op = 'INSERT' or old.status is distinct from 'done' then
      new.completed_at := coalesce(new.completed_at, now());
    end if;
  else
    new.completed_at := null;
  end if;
  return new;
end $$;

create trigger tasks_set_timestamps
before insert or update on public.tasks
for each row execute function public.set_task_timestamps();

-- Segurança: só quem tem perfil (a equipe) acessa
create function public.is_team_member() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from public.profiles where id = (select auth.uid()))
$$;

alter table public.profiles         enable row level security;
alter table public.clients          enable row level security;
alter table public.plans            enable row level security;
alter table public.tasks            enable row level security;
alter table public.task_assignees   enable row level security;
alter table public.events           enable row level security;
alter table public.weekly_decisions enable row level security;

create policy "equipe lê perfis" on public.profiles
  for select to authenticated using (public.is_team_member());
create policy "cada um edita o próprio perfil" on public.profiles
  for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- Para clients, plans, tasks, task_assignees, events e weekly_decisions:
-- a equipe lê e escreve tudo (sem permissões por cargo nesta versão).
create policy "equipe acessa" on public.tasks
  for all to authenticated
  using (public.is_team_member()) with check (public.is_team_member());
-- (mesma policy repetida para as demais tabelas)
```

### 5.3 Contas e segurança

- Cadastro público **desativado** no Supabase (Auth → Email → sem signup).
- As três contas são criadas manualmente no painel. Um `seed.sql` cria os
  perfis correspondentes, os clientes, o plano, as 25 tarefas e a reunião
  semanal.
- O acesso depende de ter **perfil**, não só de estar autenticado. Um usuário
  criado por engano, sem perfil, não vê nenhum dado.
- Sessão persistente via cookies (`@supabase/ssr`). O `proxy.ts` renova a
  sessão e redireciona para `/login` quando não há usuário. Cada Server Action
  também verifica a sessão.

## 6. Dependências

| Pacote                                       | Uso                                          |
| -------------------------------------------- | -------------------------------------------- |
| `next`, `react`, `react-dom`                 | framework                                    |
| `tailwindcss`, `@tailwindcss/postcss`        | estilos                                      |
| `radix-ui`                                   | primitivas acessíveis usadas pelo shadcn/ui  |
| `class-variance-authority`, `clsx`, `tailwind-merge` | variantes e composição de classes (shadcn) |
| `tw-animate-css`                             | animações discretas (Sheet, Dialog, Popover) |
| `lucide-react`                               | ícones                                       |
| `date-fns`                                   | datas em pt-BR                               |
| `react-day-picker`                           | base do componente Calendar (seletor de data) |
| `sonner`                                     | toasts discretos                             |
| `@supabase/supabase-js`, `@supabase/ssr`     | **etapa 2**: banco e autenticação            |

Sem biblioteca de estado global, de formulário, de calendário completo, de
gráficos ou de validação. O volume de dados e as regras não justificam.

## 7. Telas

Rotas em português. Todas usam o mesmo layout: sidebar à esquerda (Hoje,
Tarefas, Calendário, Segunda; usuário e sair no rodapé) e conteúdo num painel
branco sobre fundo off-white.

### Hoje (`/`)

- Cabeçalho: "Bom dia, Jabez" (nome do usuário logado) + data por extenso +
  botão "Nova tarefa".
- Alternância **Todas / Minhas**. A escolha fica salva no navegador.
- Quatro indicadores discretos: atrasadas, para hoje, esta semana,
  concluídas na semana. Clicar leva à seção.
- Progresso: **semana** (tarefas com prazo nesta semana: concluídas / total)
  e **plano atual** ("Estruturação da Boop · até 31/10": concluídas / total,
  dias restantes). Só barra, percentual e contagem.
- Seções em lista: **Atrasadas**, **Hoje**, **Esta semana**. Cada linha mostra
  checkbox, título, área, cliente, responsáveis e prazo.
- Clicar numa tarefa abre o **Sheet lateral** de detalhes, que pode ser
  editado sem sair da tela.

### Tarefas (`/tarefas`)

- Filtro de pessoa no topo: Todas · Minhas · Jabez · Renatha · Léo.
- Filtros adicionais: status (padrão: abertas), área, cliente, prazo.
- Lista agrupada: Atrasadas, Hoje, Esta semana, Depois, Sem prazo e
  Concluídas (quando o filtro inclui concluídas).
- Linha no estilo de lista de tarefas: checkbox, título, área/cliente, status,
  responsáveis e prazo.
- "Nova tarefa" abre um Dialog: título → responsável → prazo → salvar. Área,
  cliente, prioridade e descrição são opcionais.

### Calendário (`/calendario`)

- Visualizações **Semana** e **Mês**, navegação anterior/próximo e "Hoje".
- Mostra tarefas com prazo, reuniões, eventos internos e entregas, com cor
  discreta por tipo.
- Eventos recorrentes são expandidos para o período visível. Primeiro evento:
  **Reunião semanal da Boop**, toda segunda às 07:00.
- Clicar num item abre os detalhes no Sheet lateral.

### Segunda (`/segunda`)

- Cabeçalho "Weekly" + período da semana atual.
- Visão geral: concluídas na semana anterior, atrasadas, vencem nesta semana
  e progresso da semana.
- Uma seção por pessoa (Jabez, Renatha, Léo), com concluídas, atrasadas e
  desta semana.
- **Decisões da semana**: lista simples. Dá para adicionar e remover.

## 8. Componentes principais

| Componente           | Papel                                                          |
| -------------------- | -------------------------------------------------------------- |
| `AppSidebar`         | navegação + usuário/sair (shadcn Sidebar, variante inset)      |
| `PageHeader`         | título forte, subtítulo e ações da página                      |
| `TaskRow`            | linha de tarefa: checkbox, título e metadados compactos        |
| `TaskSection`        | grupo de tarefas com título, contagem e estado vazio           |
| `TaskSheet`          | detalhes e edição da tarefa no Sheet lateral                   |
| `NewTaskDialog`      | criação rápida (título, responsáveis, prazo) + campos opcionais |
| `TasksProvider`      | estado otimista das tarefas da tela + Sheet aberto             |
| `SummaryStats`       | os quatro indicadores do topo                                  |
| `ProgressBlock`      | barra + percentual + "X de Y"                                  |
| `AssigneeAvatars`    | avatares empilhados / "Todos"                                  |
| `DueLabel`           | prazo relativo ("hoje", "amanhã", "venceu 24/09")              |
| `WeekView` / `MonthView` | calendário sem bibliotecas extras (CSS grid + date-fns)    |
| `DecisionsList`      | decisões da semana                                             |

## 9. Definições de negócio

- **Fuso:** `America/Sao_Paulo`. "Hoje" é sempre a data em Curitiba, mesmo
  com o servidor em UTC.
- **Semana:** segunda a domingo (igual ao plano: "Semana 1 — 28/09 a 04/10").
- **Atrasada:** não concluída e prazo antes de hoje.
- **Hoje:** não concluída e prazo = hoje.
- **Esta semana:** não concluída, prazo depois de hoje e até domingo.
- **Depois:** prazo depois deste domingo. **Sem prazo:** sem data.
- **Concluídas na semana:** `completed_at` entre segunda e domingo da semana
  atual.
- **Progresso da semana:** entre as tarefas com prazo nesta semana, quantas
  estão concluídas.
- **Progresso do plano:** entre as tarefas do plano atual, quantas estão
  concluídas. O plano atual é o que contém a data de hoje.
- **Segunda:** "concluídas na semana anterior" usa `completed_at`. "Vencem
  nesta semana" são as abertas com prazo de hoje até domingo.

## 10. Decisões técnicas importantes

1. **Protótipo com dados em memória (etapa 1).** Um "banco" em memória no
   servidor, com o plano real e alguns exemplos avulsos para exercitar
   atrasadas e concluídas. Login simulado por cookie, com a mesma estrutura
   do login real. Os dados voltam ao inicial quando o servidor reinicia. Serve
   para avaliação local, não para uso real.
2. **Sem cache do Next (`cacheComponents` desligado).** As telas dependem da
   sessão e mudam o tempo todo. Renderização dinâmica é simples e correta
   para três usuários.
3. **Otimismo só onde importa.** Concluir tarefa é instantâneo. Criar e editar
   mostram estado de envio e confirmam em cerca de 100–300 ms.
4. **Tarefa recém-concluída fica no lugar.** Ela aparece riscada até a próxima
   carga da tela. Isso evita que a lista "pule", e o toast oferece
   "Desfazer".
5. **Calendário sem biblioteca.** Semana e mês em CSS grid com date-fns cobrem
   o que foi pedido. Bibliotecas completas seriam pesadas e difíceis de
   deixar com a cara do produto.
6. **Recorrência editada como série.** Editar a reunião semanal altera todas
   as ocorrências. Exceções (pular um feriado, por exemplo) ficam para depois.
7. **shadcn/ui:** o registry oficial estava bloqueado no ambiente de
   desenvolvimento. Os componentes foram copiados do repositório oficial
   (estilo new-york v4), que é o mesmo código que o CLI instala. O
   `components.json` está configurado, então `npx shadcn add` funciona
   normalmente na máquina de vocês.
8. **Região:** Supabase em São Paulo (`sa-east-1`) e funções da Vercel em
   `gru1`, para reduzir latência.
9. **Tema escuro:** fora da v1. Os tokens de cor já estão centralizados, o que
   facilita adicionar depois.

## 11. Plano de implementação

### Etapa 1 — protótipo visual (esta entrega)

1. Scaffold: Next 16, TypeScript estrito, Tailwind v4, ESLint, shadcn/ui,
   tokens visuais e fonte.
2. Domínio: tipos, rótulos, datas (fuso de SP), lógica pura (agrupamento e
   progresso), mock em memória com o plano real.
3. Layout: sidebar, menu do usuário, login visual com sessão simulada e rotas
   protegidas.
4. Tela Hoje completa, com Sheet de detalhes e "Nova tarefa".
5. Tela Tarefas: filtros e agrupamento.
6. Tela Segunda: visão geral, por pessoa e decisões.
7. Tela Calendário: semana, mês e recorrência.
8. Estados de loading, vazio e erro; responsivo; build e lint limpos.

### Etapa 2 — Supabase e Auth (após aprovação visual)

1. Criar o projeto no Supabase (sa-east-1); migration com schema, trigger e
   RLS.
2. Desativar o signup, criar as três contas e rodar o seed (perfis, clientes,
   plano, 25 tarefas, reunião semanal).
3. `@supabase/ssr`: clients de servidor e navegador, sessão no `proxy.ts`,
   login e logout reais.
4. Trocar `queries.ts`/`actions.ts` do mock pelo Supabase e remover o mock.
5. Gerar tipos TypeScript a partir do banco.
6. Testar os fluxos e o RLS (usuário sem perfil não vê nada).

### Etapa 3 — deploy

1. Projeto na Vercel ligado ao repositório, com as variáveis de ambiente.
2. Domínio `admin.deumboop.com.br` (CNAME) e SSL.
3. Teste em produção; criar a `main` e defini-la como branch padrão.

## 12. Fora do escopo (v1)

CRM, pipeline, Kanban, chat, comentários, portal do cliente, uploads,
financeiro, aprovações, dashboards avançados, IA, notificações, automações,
integrações, documentos, permissões por cargo, metas avançadas e relatórios.
