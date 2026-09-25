# Boop Admin — Arquitetura e plano

Documento de referência da primeira versão do Boop Admin, a ferramenta interna
da Boop. Reúne a análise do repositório, a arquitetura, o schema do Supabase,
as dependências, a estrutura das telas, a infraestrutura e o plano de
implementação.

> Status: **V1 real em produção** em <https://boop-admin.vercel.app>
> (Supabase + Vercel). O domínio `admin.deumboop.com.br` já está no projeto e
> passa a funcionar quando os registros DNS forem criados no Registro.br
> (seção 12). Como rodar: [README](../README.md).

---

## 1. Análise do repositório

- Repositório `Boopagency/ProgressoBoop`: estava **vazio** (sem commits, sem
  branches remotas) no início do trabalho.
- É um projeto **novo e independente** do site institucional
  (`deumboop.com.br`). Nada do repositório do site foi lido, alterado ou
  reutilizado.
- Todo o trabalho acontece na branch `claude/nifty-cray-02c7u5`. Nada é
  commitado na `main`. Como o repositório estava vazio, essa é a única branch
  e aparece como padrão no GitHub; por isso ela é também a branch de produção
  do projeto na Vercel até a `main` ser criada.
- A infraestrutura também é independente do site: organização "Boop" no
  Supabase e projeto próprio na Vercel (`boop-admin`), sem compartilhar nada
  com o projeto do site.

## 2. Stack

| Camada       | Escolha                                                      |
| ------------ | ------------------------------------------------------------ |
| Framework    | Next.js 16 (App Router, Turbopack, Server Actions)           |
| Linguagem    | TypeScript em modo estrito                                   |
| Estilo       | Tailwind CSS v4 (configuração em CSS, tokens em `globals.css`) |
| Componentes  | shadcn/ui (estilo new-york, primitivas Radix)                |
| Ícones       | Lucide                                                       |
| Datas        | date-fns (locale `pt-BR`)                                    |
| Backend      | Supabase (Auth + PostgreSQL com RLS), região `sa-east-1`      |
| Deploy       | Vercel (projeto `boop-admin`, funções em `gru1`) em `admin.deumboop.com.br` |

## 3. Arquitetura de pastas

Organização por funcionalidade (_features_), que é o padrão recomendado na
documentação atual do Next.js. As rotas em `app/` só compõem componentes das
features.

```
src/
├── app/
│   ├── (app)/                  # área autenticada (layout com sidebar)
│   │   ├── layout.tsx          # sidebar + dados de referência (equipe, clientes, planos)
│   │   ├── hoje/               # "/hoje" (a raiz "/" redireciona para cá)
│   │   ├── loading.tsx / error.tsx
│   │   ├── tarefas/            # "/tarefas"
│   │   ├── calendario/         # "/calendario"
│   │   └── segunda/            # "/segunda"
│   ├── login/                  # "/login" (sem "Criar conta")
│   ├── layout.tsx              # raiz: fonte, <html lang="pt-BR">, Toaster
│   └── globals.css             # Tailwind v4 + tokens do design system
├── components/
│   ├── ui/                     # shadcn/ui (código gerado)
│   ├── layout/                 # sidebar, menu do usuário, cabeçalho de página
│   └── *.tsx                   # peças visuais genéricas: date-picker, stat-grid,
│                               # segmented-control, progress-meter
├── features/
│   ├── auth/                   # sessão, login/logout
│   ├── workspace/              # equipe, clientes, planos (dados de referência)
│   ├── tasks/                  # lista, linha, Sheet, "Nova tarefa", filtros, lógica pura
│   ├── today/                  # blocos da tela Hoje
│   ├── calendar/               # semana/mês, recorrência, eventos
│   └── weekly/                 # tela Segunda e decisões da semana
├── hooks/                      # use-mobile (shadcn)
├── lib/
│   ├── supabase/               # clientes do Supabase (servidor e proxy), tipos do banco
│   └── *.ts                    # datas (fuso de SP), rótulos, tipos, cn()
└── proxy.ts                    # sessão + proteção de rotas (no Next 16, substitui o middleware)

supabase/
├── migrations/                 # schema, trigger e RLS (fonte da verdade do banco)
└── seed.sql                    # dados reais: equipe, clientes, plano, 25 tarefas, reunião
public/brand/                   # marca oficial da Boop (SVG do site)
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
  └─ lê dados via queries.ts   ── Supabase com a sessão da pessoa (RLS)
      └─ Client Component (visão da tela)
           ├─ useOptimistic → a UI muda no mesmo frame (checkbox, progresso)
           └─ Server Action → grava no Supabase → revalida → o servidor re-renderiza
```

- **Leitura:** as páginas são Server Components e buscam os dados no servidor.
  O volume é pequeno (dezenas ou centenas de tarefas), então cada tela busca o
  que precisa e os filtros rodam no cliente, de forma instantânea.
- **Escrita:** Server Actions com validação simples no servidor. O RLS do
  Postgres é a segunda camada de proteção.
- **Otimismo:** concluir uma tarefa atualiza checkbox, contadores e barras de
  progresso na hora. Se o servidor falhar, a UI volta e aparece um toast.
- **Sem cliente do Supabase no navegador.** Todo acesso ao banco passa pelo
  servidor (Server Components e Server Actions) com a sessão da pessoa, via
  `@supabase/ssr` e cookies.

## 5. Schema do Supabase

Tabelas pedidas: `profiles`, `clients`, `tasks`, `events`, `weekly_decisions`.
Duas adições com necessidade real, documentadas abaixo: `task_assignees` e
`plans`. O SQL completo está em
[`supabase/migrations/20260925162330_initial_schema.sql`](../supabase/migrations/20260925162330_initial_schema.sql).

| Tabela             | Colunas principais                                                                 |
| ------------------ | ---------------------------------------------------------------------------------- |
| `profiles`         | `id` (= `auth.users.id`), `full_name`, `avatar_url`, `role`, `created_at`          |
| `clients`          | `id`, `name` (único), `active`, `created_at`                                       |
| `plans`            | `id`, `name`, `starts_on`, `ends_on`, `created_at`                                 |
| `tasks`            | `id`, `title`, `description`, `client_id`, `plan_id`, `area`, `status`, `priority`, `due_date`, `completed_at`, `created_by`, `created_at`, `updated_at` |
| `task_assignees`   | `task_id`, `profile_id` (chave composta)                                           |
| `events`           | `id`, `title`, `description`, `event_type`, `start_at`, `end_at`, `all_day`, `recurrence_rule`, `client_id`, `created_by`, `created_at` |
| `weekly_decisions` | `id`, `content`, `week_start` (sempre segunda), `created_by`, `created_at`         |

Enums: `task_status` (`todo`, `doing`, `done`), `task_priority` (`low`,
`normal`, `high`), `task_area` (`commercial`, `finance`, `operations`,
`brand`, `technology`, `clients`) e `event_type` (`meeting`, `internal`,
`delivery`).

### 5.1 Decisões sobre o schema

1. **`task_assignees` (tarefa ↔ pessoa)** em vez de `assignee_id`. O plano tem
   tarefas de uma, duas ou das três pessoas ("Todos"). A tabela de relação
   mantém integridade (FK + cascade) e a consulta continua simples: a tarefa
   vem com os responsáveis numa única chamada.
2. **`plans` (nova, pequena)**. A tela Hoje mostra o progresso de
   "Estruturação da Boop até 31/10". Para isso é preciso saber **quais**
   tarefas pertencem ao plano; filtrar por data misturaria tarefas avulsas de
   clientes com as do plano. Com `plans` + `tasks.plan_id`, o progresso sai de
   uma contagem, e o próximo plano é só uma nova linha.
3. **`recurrence_rule`** no formato do padrão iCalendar (RFC 5545). Nesta
   versão só existe `FREQ=WEEKLY` (garantido por `check`): toda semana no
   mesmo dia e horário de `start_at`. `null` = evento único. Sem motor de
   recorrência: o app expande as ocorrências para o período visível. Outras
   regras entram por migration quando houver necessidade.
4. **`all_day`** em `events`: entregas costumam não ter horário.
5. **Enums** com códigos em inglês e rótulos em português num único arquivo
   (`src/lib/labels.ts`).
6. **`completed_at` e `updated_at`** são mantidos pelo trigger
   `set_task_timestamps`: `completed_at` é preenchido quando o status vira
   `done` e limpo quando sai de `done`. A regra vale para qualquer cliente.
7. **Área, cliente e prazo** são opcionais no banco. O formulário rápido pede
   prazo, mas não bloqueia.
8. **Eventos chegam ao servidor como data + horário de São Paulo** (ex.:
   `2026-09-28` + `07:00`) e o servidor converte para `timestamptz`,
   calculando o deslocamento real do fuso. Assim a conversão fica certa mesmo
   se o horário de verão voltar.
9. **Ordem da equipe** (Jabez, Renatha, Léo) = ordem de `profiles.created_at`.
   Sem coluna extra.

### 5.2 Segurança (RLS)

- RLS ligado em **todas** as tabelas. Usuários anônimos não têm nenhuma
  política, então não leem nem gravam nada.
- **Ser da equipe = ter perfil em `profiles`.** A função
  `private.is_team_member()` (`security definer`, `search_path` vazio, num
  schema fora da API) responde isso para as políticas. Uma conta do Auth sem
  perfil não vê nenhum dado, e o app a trata como deslogada.
- Políticas da V1 (sem papéis nem permissões por pessoa):

| Tabela             | Quem é da equipe pode…                                        |
| ------------------ | ------------------------------------------------------------- |
| `profiles`         | ver a equipe; editar só o próprio perfil                      |
| `clients`, `plans`, `task_assignees` | ver, criar, editar e excluir                  |
| `tasks`, `events`  | ver, criar (sempre como autor: `created_by = auth.uid()`), editar e excluir |
| `weekly_decisions` | ver, registrar (como autor) e excluir                         |

- Nenhuma chave secreta ou service role é usada pelo app. O servidor fala com
  o Supabase com a chave publicável + a sessão da pessoa, então o RLS vale
  para tudo o que o app faz.

### 5.3 Contas

- Não há cadastro público nem botão "Criar conta". As três contas
  (`jabez@`, `renatha@` e `leo@deumboop.com.br`) foram criadas direto no
  Supabase Auth, com senha temporária.
- `supabase/seed.sql` cria os perfis dessas contas, os clientes, o plano, as
  25 tarefas e a reunião semanal. Pode rodar de novo sem duplicar nada.
- Para adicionar uma pessoa: criar a conta em Authentication → Users → Add
  user (com "Auto Confirm User") e inserir o perfil
  (`insert into profiles (id, full_name, role) values (...)`).
- Sessão persistente via cookies (`@supabase/ssr`). O `proxy.ts` renova a
  sessão a cada requisição (`getClaims()`, que valida o JWT) e manda para
  `/login` quem não tem sessão. Páginas, queries e Server Actions conferem a
  sessão e o perfil de novo no servidor (`requireUser`).

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
| `react-day-picker` (v9)                      | base do componente Calendar (seletor de data); fixado na v9, a versão para a qual o Calendar do shadcn foi escrito (é a que o próprio shadcn usa) |
| `sonner`                                     | toasts discretos                             |
| `@supabase/supabase-js`, `@supabase/ssr`     | banco e autenticação (sessão em cookies)     |

Sem biblioteca de estado global, de formulário, de calendário completo, de
gráficos ou de validação. O volume de dados e as regras não justificam.

## 7. Telas

Rotas em português. Todas usam o mesmo layout: sidebar à esquerda (Hoje,
Tarefas, Calendário, Segunda; usuário e sair no rodapé) e conteúdo num painel
branco sobre fundo off-white.

### Hoje (`/hoje`)

- É a tela inicial: o login leva para cá e a raiz `/` redireciona para cá.
- Cabeçalho: "Bom dia, Jabez" (nome do usuário logado) + data por extenso +
  botão "Nova tarefa".
- Alternância **Minhas / Todas**, com **Minhas** como padrão. A escolha fica
  salva no navegador.
- Quatro indicadores discretos: atrasadas, para hoje, esta semana,
  concluídas na semana. Clicar leva à seção.
- Progresso: o **plano atual** ("Estruturação da Boop até 31/10") é a
  informação principal: percentual grande, barra, "X de 25 tarefas" e dias
  restantes. Conta a equipe inteira; no filtro Minhas aparece também a parte
  da pessoa ("suas: X de Y"). A **semana** vem abaixo, menor (tarefas com
  prazo nesta semana: concluídas / total). Só barra, percentual e contagem.
- Seções em lista: **Atrasadas**, **Hoje**, **Esta semana**. Cada linha mostra
  checkbox, título, área, cliente, responsáveis e prazo.
- Coluna lateral com **Próximos compromissos** (7 dias). É um bloco pequeno,
  adicionado para responder "o que precisa acontecer nesta semana" sem ir ao
  calendário. Dá para remover se não fizer sentido.
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
  cliente, prioridade e descrição são opcionais. Atalho: tecla **N** em
  qualquer tela.
- Os filtros ficam na URL (`/tarefas?pessoa=…&prazo=week`), então dá para
  compartilhar uma visão.

### Calendário (`/calendario`)

- Visualizações **Semana** e **Mês**, navegação anterior/próximo e "Hoje".
- Mostra tarefas com prazo, reuniões, eventos internos e entregas, com cor
  discreta por tipo.
- Eventos recorrentes são expandidos para o período visível. Primeiro evento:
  **Reunião semanal da Boop**, toda segunda às 07:00.
- Clicar num item abre os detalhes no Sheet lateral. Tarefas podem ser
  concluídas direto na visão semana.
- Criar, editar e excluir eventos (tipo, data, horário ou dia inteiro,
  repetição semanal, cliente, descrição).

### Segunda (`/segunda`)

- Cabeçalho "Weekly" + período da semana atual.
- Visão geral: concluídas na semana anterior, atrasadas, vencem nesta semana
  e progresso da semana.
- Uma seção por pessoa (Jabez, Renatha, Léo), com concluídas, atrasadas e
  desta semana.
- **Decisões da semana**: lista simples. Dá para adicionar e remover. As
  decisões da semana anterior aparecem logo abaixo, só para consulta.

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
| `StatGrid`           | indicadores discretos (Hoje e Segunda)                         |
| `ProgressMeter`      | barra + percentual + "X de Y"                                  |
| `AssigneePicker`     | escolha de responsáveis (uma ou mais pessoas, "Todos")          |
| `DueLabel`           | prazo relativo ("hoje", "amanhã", "venceu 24/09")              |
| `WeekView` / `MonthView` | calendário sem bibliotecas extras (CSS grid + date-fns)    |
| `WeeklyDecisions`    | decisões da semana                                             |

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

1. **Identidade Boop em 5–10% da interface.** A base continua neutra
   (branco, off-white, cinzas, quase preto). A cor da marca aparece só em
   detalhes: barras de progresso, item ativo da sidebar, foco, o dia de hoje
   no calendário, pontos indicadores e hover de links. Ciano `#00C2FF` só como
   preenchimento; quando precisa ser texto, `#0079A8`; o botão principal é o
   azul-marinho da marca (`#0B1B2C`). Vermelho, verde e laranja continuam
   reservados para atrasado, concluído e atenção. Logo: o "olhar" oficial, o
   mesmo SVG do favicon do site, sem redesenho. Poppins (fonte da marca) só em
   títulos e números de destaque; o resto da interface usa Inter.
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
   `gru1` (`vercel.json`), para reduzir latência.
9. **Tema escuro:** fora da v1. Os tokens de cor já estão centralizados, o que
   facilita adicionar depois.
10. **Layout responsivo por container query.** A linha de tarefa e o
    calendário se adaptam à largura do próprio bloco, não à da tela. Por
    isso a mesma linha funciona na lista larga de Tarefas e nas colunas
    estreitas da Segunda.
11. **Estado na URL quando é uma "visão"** (filtros de Tarefas, semana/mês e
    data do Calendário). Preferências pessoais simples, como Todas/Minhas na
    tela Hoje e a sidebar recolhida, ficam em cookie.

## 11. Plano de implementação

### Etapa 1 — protótipo visual ✅

Scaffold, domínio, layout, as quatro telas com dados em memória, estados de
loading/vazio/erro e responsivo. Aprovada visualmente.

### Etapa 2 — V1 real ✅

1. Refinamentos de identidade: logo oficial, cor da marca nos detalhes,
   Poppins nos títulos; "Minhas" como padrão e progresso do plano em
   destaque na tela Hoje.
2. Supabase: organização "Boop", projeto `boop-admin` (`sa-east-1`),
   migration com schema, trigger e RLS; três contas e seed com os dados reais
   (sem nada de demonstração).
3. `@supabase/ssr`: sessão no `proxy.ts`, login e logout reais, queries e
   Server Actions no banco; mock removido; tipos gerados do banco.
4. Vercel: projeto `boop-admin` ligado só a este repositório, variáveis de
   ambiente, deploy de produção e domínio `admin.deumboop.com.br`.

### Próximos passos

1. Criar os registros DNS de `admin.deumboop.com.br` no Registro.br
   (seção 12).
2. Desligar o cadastro público no Supabase (Authentication → Sign In /
   Providers → "Allow new users to sign up"). O RLS já impede qualquer
   acesso de contas sem perfil; isso fecha também a criação de contas.
3. Cada pessoa troca a senha temporária.
4. Criar a `main` a partir desta branch e defini-la como branch padrão no
   GitHub e de produção na Vercel.

## 12. Infraestrutura e variáveis de ambiente

| Peça        | Onde                                                                 |
| ----------- | -------------------------------------------------------------------- |
| Banco/Auth  | Supabase, organização "Boop", projeto `boop-admin` (`zqugfixszhfoochvaaol`), região `sa-east-1` |
| Hospedagem  | Vercel, projeto `boop-admin` (só este repositório), funções em `gru1` |
| Produção    | branch `claude/nifty-cray-02c7u5` → <https://boop-admin.vercel.app> |
| Domínio     | `admin.deumboop.com.br` (DNS da zona `deumboop.com.br` no Registro.br) |

- As URLs `*.vercel.app` ficam atrás da autenticação da Vercel (só quem é da
  conta na Vercel abre). O domínio próprio é público, e o app exige login.
- O projeto do site (`boop`, com `deumboop.com.br` e `www`) não foi alterado.

| Variável                               | Tipo   | Onde                          |
| -------------------------------------- | ------ | ----------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | CONFIG | Vercel (Production, Preview e Development) e `.env.local` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | CONFIG | Vercel (Production, Preview e Development) e `.env.local` |

- **CONFIG**: valores públicos por natureza. A chave publicável
  (`sb_publishable_…`) pode estar no navegador; quem protege os dados é o RLS.
- **SECRET**: nenhuma. O app não usa `service_role` nem chave secreta
  (`sb_secret_…`). Se um dia alguma rotina administrativa precisar, ela deve
  ficar só no servidor, como variável sensível, e nunca com prefixo
  `NEXT_PUBLIC_`.

## 13. Fora do escopo (v1)

CRM, pipeline, Kanban, chat, comentários, portal do cliente, uploads,
financeiro, aprovações, dashboards avançados, IA, notificações, automações,
integrações, documentos, permissões por cargo, metas avançadas e relatórios.
