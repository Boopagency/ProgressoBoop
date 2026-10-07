# Boop Admin — Arquitetura e plano

Documento de referência da primeira versão do Boop Admin, a ferramenta interna
da Boop. Reúne a análise do repositório, a arquitetura, o schema do Supabase,
as dependências, a estrutura das telas, a infraestrutura e o plano de
implementação.

> Status: **V1 real em produção** em <https://admin.deumboop.com.br>
> (Supabase + Vercel). Como rodar: [README](../README.md).

---

## 1. Análise do repositório

- Repositório `Boopagency/ProgressoBoop`: estava **vazio** (sem commits, sem
  branches remotas) no início do trabalho.
- É um projeto **novo e independente** do site institucional
  (`deumboop.com.br`). Nada do repositório do site foi lido, alterado ou
  reutilizado.
- A `main` é a branch padrão no GitHub e a branch de produção na Vercel. A
  V1 foi desenvolvida em `claude/nifty-cray-02c7u5` e levada para a `main`
  depois da aprovação.
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
│   │   ├── reunioes/           # "/reunioes" e "/reunioes/[id]" ("/segunda" redireciona)
│   │   ├── clientes/           # "/clientes" e "/clientes/[id]" (?mes=aaaa-mm)
│   │   └── processos/          # "/processos" e "/processos/[id]"
│   ├── api/keepalive/          # visita diária ao banco (cron da Vercel)
│   ├── api/arquivos/           # imagens dos processos (confere a sessão, redireciona
│   │                           # para uma URL assinada e temporária do Storage)
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
│   ├── today/                  # tela Hoje: indicadores, progresso e os quadros que vêm
│   │                           # das outras áreas (reunião, combinados, processos)
│   ├── calendar/               # semana/mês, recorrência, eventos
│   ├── meetings/               # reuniões: lista, pauta automática, assuntos,
│   │                           # combinados, resumo e transcrição
│   ├── docs/                   # processos: biblioteca, editor (BlockNote), modelos,
│   │                           # versões, checklist → tarefas
│   ├── clients/                # clientes: cadastro, revisão mensal, saúde, quadros
│   │                           # da tela Hoje e da weekly
│   └── search/                 # busca geral (Ctrl/⌘ + K): janela, ações e resultados
├── hooks/                      # use-mobile (shadcn), use-url-trigger (?novo= abre o
│                               # diálogo de criar da tela)
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
  `@supabase/ssr` e cookies. Única exceção, sem acesso ao banco: o envio de
  imagens dos processos vai do navegador direto ao Storage, numa URL de envio
  assinada que o servidor gera (com a sessão) para um caminho só.

## 5. Schema do Supabase

Tabelas pedidas: `profiles`, `clients`, `tasks`, `events`, `weekly_decisions`.
Duas adições com necessidade real, documentadas abaixo: `task_assignees` e
`plans`. Depois vieram as reuniões (`meetings` e `meeting_items`) e os
processos (`docs` e `doc_versions`) e as revisões de clientes
(`client_reviews`). O SQL está em `supabase/migrations/`, uma migration por
etapa:
[`initial_schema`](../supabase/migrations/20260925162330_initial_schema.sql),
[`meetings`](../supabase/migrations/20261006141627_meetings.sql),
[`docs`](../supabase/migrations/20261006163448_docs.sql),
[`docs_content_stamp`](../supabase/migrations/20261006165216_docs_content_stamp.sql) e
[`docs_restore_version`](../supabase/migrations/20261006165704_docs_restore_version.sql) e
[`clients_reviews`](../supabase/migrations/20261006173103_clients_reviews.sql).

| Tabela             | Colunas principais                                                                 |
| ------------------ | ---------------------------------------------------------------------------------- |
| `profiles`         | `id` (= `auth.users.id`), `full_name`, `avatar_url`, `role`, `created_at`          |
| `clients`          | `id`, `name` (único), `active`, `owner_id` (responsável da Boop), `services` (frentes), `since`, `contact_name`, `contact_email`, `contact_phone`, `notes`, `review_day` (dia do mês em que a revisão vence; vazio = sem revisão mensal), `created_at`, `updated_at` |
| `plans`            | `id`, `name`, `starts_on`, `ends_on`, `created_at`                                 |
| `tasks`            | `id`, `title`, `description`, `client_id`, `plan_id`, `area`, `status`, `priority`, `due_date`, `completed_at`, `created_by`, `created_at`, `updated_at` |
| `task_assignees`   | `task_id`, `profile_id` (chave composta)                                           |
| `events`           | `id`, `title`, `description`, `event_type`, `start_at`, `end_at`, `all_day`, `recurrence_rule`, `client_id`, `created_by`, `created_at` |
| `weekly_decisions` | `id`, `content`, `week_start` (sempre segunda), `created_by`, `created_at`. Sem uso desde as Reuniões; sai numa migration de limpeza |
| `meetings`         | `id`, `event_id`, `occurs_on`, `status`, `summary`, `transcript`, `transcript_length` (gerada), `agenda` (pauta congelada, jsonb), `closed_at`, `closed_by`, `created_by`, `created_at`, `updated_at`, `search` (tsvector gerado) |
| `meeting_items`    | `id`, `meeting_id`, `kind` (assunto ou combinado), `content`, `owner_id`, `due_date`, `done`, `task_id`, `created_by`, `created_at` |
| `docs`             | `id`, `title`, `kind`, `status`, `area`, `client_id`, `owner_id`, `summary` ("para que serve"), `content` (blocos do editor, jsonb), `content_text` (texto puro), `review_every_months`, `reviewed_on`, `next_review_on` (gerada), `pinned`, `created_by`, `updated_by`, `created_at`, `updated_at`, `content_updated_at`, `content_updated_by`, `search` (tsvector gerado) |
| `doc_versions`     | `id`, `doc_id`, `title`, `content`, `saved_by`, `saved_at` (quem deixou o texto assim, e quando), `created_at` |
| `client_reviews`   | `id`, `client_id`, `period` (mês, sempre dia 1; uma por cliente e mês), `health`, `checklist` (jsonb), `notes`, `done`, `done_at`, `done_by`, `created_by`, `created_at`, `updated_at` |

`tasks` ganhou `meeting_id` (a reunião em que a tarefa nasceu), `doc_id` (o
processo de cujo checklist ela saiu) e `client_review_id` (a revisão mensal
de cliente em que ela virou próximo passo). Imagens dos processos ficam no bucket
privado `docs` do Storage (até 5 MB; PNG, JPG, WebP e GIF).

Enums: `task_status` (`todo`, `doing`, `done`), `task_priority` (`low`,
`normal`, `high`), `task_area` (`commercial`, `finance`, `operations`,
`brand`, `technology`, `clients`), `event_type` (`meeting`, `internal`,
`delivery`), `meeting_status` (`scheduled`, `done`, `canceled`),
`meeting_item_kind` (`topic`, `agreement`), `doc_kind` (`process`,
`checklist`, `policy`, `guide`), `doc_status` (`draft`, `active`, `review`) e
`client_health` (`healthy`, `attention`, `at_risk`).

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
10. **Reunião = evento + registro.** A agenda continua no Calendário: uma
    reunião é um evento do tipo `meeting`, único ou semanal. O registro
    (`meetings`) guarda o que aconteceu numa ocorrência e nasce quando alguém
    abre a reunião (ou adiciona um assunto antes dela), com chave única
    `(event_id, occurs_on)`. Em eventos únicos, o trigger `sync_meeting_dates`
    leva o registro junto quando a reunião é remarcada. Excluir o evento apaga
    os registros (o Calendário avisa antes).
11. **Pauta congelada.** Ao encerrar, o app guarda em `meetings.agenda` a pauta
    como estava (tarefas por pessoa ou do cliente, combinados anteriores).
    O histórico mostra o que foi discutido, mesmo que as tarefas mudem depois.
    `closed_at`/`closed_by` são preenchidos pelo trigger `set_meeting_fields`.
12. **Busca sem acento.** `private.unaccent_text()` (extensão `unaccent` com
    dicionário fixo, por isso imutável) alimenta a coluna gerada `search` com
    o resumo e a transcrição; o app busca com `websearch` em português. Nos
    processos, o título pesa mais que o "para que serve", que pesa mais que o
    texto.
13. **Processo = blocos + texto puro.** O conteúdo é o JSON de blocos do
    editor (BlockNote), guardado como veio; o servidor tira dele o texto puro
    (`content_text`), que alimenta a busca e os trechos. Os modelos e as
    sugestões são blocos prontos, em `features/docs/templates.ts`.
14. **Versões pelo banco.** O trigger `set_doc_fields` guarda o estado
    anterior em `doc_versions` quando o título ou o texto mudam: sempre que
    quem edita é outra pessoa, e no máximo uma vez a cada 30 minutos para
    quem segue editando. Restaurar (`restore_doc_version`) guarda o texto
    atual sempre, então dá para desfazer. Ninguém grava versões direto.
15. **Conflito de edição.** O editor salva sozinho, levando o carimbo
    (`content_updated_at`) do texto que a pessoa tinha. Se outra pessoa salvou
    no meio, o servidor não sobrescreve: a tela mostra quem salvou e deixa
    escolher entre manter as suas alterações (a outra versão fica no
    histórico) ou carregar a outra. O carimbo só muda com o texto, então
    trocar status ou responsável não gera falso alarme.
16. **Imagens privadas.** O documento guarda um endereço estável do app
    (`/api/arquivos/<processo>/<arquivo>`), que confere a sessão e redireciona
    para uma URL assinada de uma hora. O envio vai direto ao Storage (URL de
    envio assinada), sem passar pelo limite de 1 MB das Server Actions; fotos
    grandes são reduzidas no navegador antes. Excluir o processo apaga as
    imagens dele.
17. **Revisão mensal = uma linha por cliente e mês.** `client_reviews` tem
    chave única `(client_id, period)` e nasce na primeira mudança (saúde,
    item do checklist, nota ou próximo passo), com o checklist padrão
    copiado (`features/clients/logic.ts`): o histórico guarda o checklist
    como foi usado, mesmo que o padrão mude. O trigger
    `set_client_review_fields` registra quem concluiu e quando e não deixa
    trocar cliente, mês nem autor numa edição. A saúde atual do cliente é a
    da revisão mais recente com saúde marcada; não há coluna duplicada.
18. **Vencimento configurável por cliente** (`review_day`, padrão dia 10;
    vazio = sem revisão, como a Boop). A tela Hoje e a weekly mostram as
    revisões do mês por fazer, atrasadas primeiro.

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
| `meetings`, `meeting_items` | ver, criar (como autor), editar e excluir            |
| `docs`             | ver, criar (como autor), editar e excluir                     |
| `doc_versions`     | só ver (quem grava é o banco, pelo trigger)                   |
| `client_reviews`   | ver, criar (como autor), editar e excluir                     |
| Storage, bucket `docs` | ver, enviar e apagar imagens                              |

- Nenhuma chave secreta ou service role é usada pelo app. O servidor fala com
  o Supabase com a chave publicável + a sessão da pessoa, então o RLS vale
  para tudo o que o app faz.

### 5.3 Contas

- Não há cadastro público (desligado no Supabase Auth: "Allow new users to
  sign up") nem botão "Criar conta". As três contas
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
| `@blocknote/core`, `@blocknote/react`, `@blocknote/shadcn` | editor de blocos dos Processos (estilo Notion; licença MPL-2.0, código aberto). Carregado só na página do documento |

Sem biblioteca de estado global, de formulário, de calendário completo, de
gráficos ou de validação. O volume de dados e as regras não justificam. O
editor de documentos é a exceção que vale o peso: escrever um editor de
blocos (títulos, listas, checklists, tabelas, imagens, arrastar) do zero não
faria sentido.

## 7. Telas

Rotas em português. Todas usam o mesmo layout: sidebar à esquerda (Hoje,
Tarefas, Calendário, Reuniões, Clientes, Processos; usuário e sair no rodapé)
e conteúdo num painel branco sobre fundo off-white. No topo de todas,
**Buscar…** (Ctrl/⌘ + K) abre a busca geral.

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
- **Combinados em aberto** das reuniões, os que não viraram tarefa (os que
  viraram já estão nas listas). No Minhas, os da pessoa e os da equipe. O
  checkbox marca como cumprido.
- Coluna lateral, o painel do dia:
  - **Próxima reunião**: quando, tipo, quantos assuntos já estão na pauta e o
    campo "Algo para discutir?", que põe um assunto na pauta sem sair da tela;
  - **Revisões de clientes** do mês por fazer (todos os clientes, com o
    responsável);
  - **Processos para revisar** (no Minhas, os da pessoa e os sem responsável);
  - **Próximos compromissos** (7 dias). Clicar numa reunião abre a pauta dela.
  Quadro sem nada para mostrar não aparece.
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
- Reuniões têm o botão **Abrir reunião** (pauta, combinados e transcrição).

### Reuniões (`/reunioes`)

Substitui a antiga tela Segunda (`/segunda` redireciona para cá).

- **Próxima reunião** em destaque: quando, tipo (Weekly, cliente ou interna),
  quantos assuntos já estão na pauta e combinados anteriores em aberto. Dá
  para adicionar um assunto ali mesmo, sem abrir a reunião.
- **Próximas** (a weekly aparece uma vez só) e **histórico por mês**, com
  combinados (e quantos seguem em aberto), transcrição e situação
  (encerrada, em aberto, cancelada, sem registro).
- Filtro por tipo e **busca** em títulos, assuntos, combinados, resumos e
  transcrições (sem acento).
- **Nova reunião** cria o evento no Calendário e abre a página dela.

### Reunião (`/reunioes/[id]`)

- **Assuntos**: o que a equipe quer discutir; qualquer pessoa adiciona antes.
- **Combinados**: o que ficou decidido, com responsável (ou "Equipe") e prazo.
  **Virar tarefa** cria a tarefa num clique (responsável, prazo e cliente da
  reunião) e o combinado passa a seguir o status dela.
- **Pauta automática**: combinados anteriores da série (da última reunião e
  os que seguem em aberto) e tarefas: na weekly, por pessoa (atrasadas, até
  domingo e concluídas desde a última), com o progresso do plano; com
  cliente, as tarefas daquele cliente.
- **Resumo** (salva sozinho) e **transcrição** colada, com busca que destaca
  e navega pelos trechos.
- **Encerrar** guarda a pauta como estava; dá para reabrir, cancelar ou
  excluir o registro. Setas levam à reunião anterior e à próxima da série.

### Clientes (`/clientes`)

- **Revisões do mês**: quantas foram feitas, quantas faltam e quantas estão
  atrasadas.
- Um cartão por cliente ativo: saúde (Saudável, Atenção, Em risco ou sem
  avaliação), responsável, frentes, situação da revisão do mês, tarefas
  abertas e atrasadas e o próximo compromisso no Calendário. Inativos
  recolhidos no fim.
- **Novo cliente**: nome, responsável, frentes (sugestões ou livres), cliente
  desde, contato, revisão mensal (e o dia em que vence) e observações.

### Cliente (`/clientes/[id]`)

- **Revisão do mês** (setas para os meses anteriores): saúde, checklist,
  notas que salvam sozinhas, **próximos passos** que viram tarefas do
  cliente, **Concluir** e **Reabrir**.
- **Tarefas** do cliente por prazo (e as concluídas nos últimos 30 dias) e
  **Reuniões** (próximas e recentes, com "Nova reunião" já com o cliente).
- Lateral: **Sobre o cliente** (responsável, frentes, contato com e-mail e
  WhatsApp, observações), **Saúde mês a mês** (seis meses) e **Processos do
  cliente**.
- Menu: nova reunião, novo processo do cliente, desativar/reativar e excluir.

### Processos (`/processos`)

A documentação interna da Boop: processos, checklists, políticas e guias.

- **Comece por aqui**: os documentos fixados (ex.: "Como funciona a Boop").
- Lista **por área**, com tipo, status, cliente, responsável e quando foi
  editado. Filtros: Todos, **Para revisar** (marcados ou com a revisão
  vencida), Rascunhos, cada área e cada cliente.
- **Busca** no título, no "para que serve" e no texto, sem acento, com o
  trecho encontrado destacado.
- **Novo documento** com modelo (processo passo a passo, checklist, política,
  guia, onboarding de cliente ou em branco), área e cliente.
- **Sugestões para documentar**: dez documentos que toda agência precisa,
  já com estrutura (com a biblioteca vazia, elas são a tela inicial).

### Processo (`/processos/[id]`)

- Título, "para que serve" e o **editor de blocos**: títulos, listas,
  checklists, tabelas, citações, código e imagens (colar, arrastar ou pelo
  menu "/"). Salva sozinho; Ctrl/⌘ + S salva na hora.
- **Detalhes**: tipo, status, área, cliente, responsável e revisão periódica
  (a cada 1, 3, 6 ou 12 meses), com **Revisado hoje**. Quando a revisão
  vence, um aviso aparece no topo.
- **Neste documento** (índice das seções), **Tarefas geradas** e
  **Histórico** (ver cada versão e restaurar).
- **Gerar tarefas**: os itens do checklist viram tarefas (mesmo responsável,
  prazo e cliente), ligadas ao processo.
- Menu: fixar em "Comece por aqui", duplicar, copiar link e excluir.

### Busca geral (Ctrl/⌘ + K)

- Abre em qualquer tela, pelo atalho ou pelo botão **Buscar…** do topo (no
  celular, a lupa). No editor de processos, Ctrl/⌘ + K continua criando link.
- Sem texto: **Ações** (nova tarefa, reunião, documento ou cliente) e **Ir
  para** (as telas).
- A partir de 2 letras, sem acento: **Tarefas** (título e descrição; abertas
  primeiro), **Reuniões** (título, cliente, assuntos, combinados, resumo e
  transcrição; das próximas, uma por série), **Processos** (título, "para que
  serve" e, a partir de 3 letras, o texto) e **Clientes** (nome). Até seis
  resultados por grupo.
- ↑ ↓ navegam, Enter abre, Esc fecha.
- Links usados pela busca: `/tarefas?tarefa=<id>` abre o Sheet da tarefa;
  `/reunioes`, `/processos` e `/clientes` com `?novo=<marca>` abrem o diálogo
  de criar. O parâmetro sai do endereço depois de usado.

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
| `StatGrid`           | indicadores discretos (tela Hoje)                              |
| `ProgressMeter`      | barra + percentual + "X de Y"                                  |
| `AssigneePicker`     | escolha de responsáveis (uma ou mais pessoas, "Todos")          |
| `DueLabel`           | prazo relativo ("hoje", "amanhã", "venceu 24/09")              |
| `WeekView` / `MonthView` | calendário sem bibliotecas extras (CSS grid + date-fns)    |
| `MeetingsView` / `MeetingView` | lista de reuniões e página da reunião                 |
| `AgreementsCard` / `TopicsCard` | combinados e assuntos, com mudanças otimistas         |
| `TasksAgendaCard`    | pauta automática (por pessoa ou do cliente), ao vivo ou guardada |
| `TranscriptCard`     | transcrição recolhida, com busca e destaque                    |
| `DocsView` / `DocView` | biblioteca de processos e página do documento                 |
| `DocEditor`          | editor de blocos (BlockNote) com salvamento automático e conflito |
| `VersionsSheet`      | histórico de versões com visualização e restauração            |
| `GenerateTasksDialog` | itens do checklist → tarefas                                 |
| `ClientsView` / `ClientView` | lista de clientes e página do cliente                   |
| `ReviewCard`         | revisão mensal: saúde, checklist, notas, próximos passos       |
| `ReviewsDueCard` / `ClientsPulseCard` | revisões por fazer (Hoje) e clientes na weekly |
| `NextMeetingCompact` / `OpenAgreements` / `DocsToReview` | quadros da tela Hoje: próxima reunião, combinados em aberto e processos para revisar |
| `CommandPaletteProvider` / `SearchButton` | busca geral (Ctrl/⌘ + K) e o botão "Buscar…" do topo |

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
- **Pauta da reunião:** "atrasadas" são as abertas com prazo antes de hoje;
  "até domingo" vai de hoje até o domingo da semana da reunião (com cliente,
  pelo menos duas semanas); "concluídas desde" conta `completed_at` a partir
  da reunião anterior da série (ou dos 7 dias anteriores).
- **Combinado em aberto:** o que virou tarefa segue o status da tarefa; o
  resto, o próprio "feito".
- **Processo para revisar:** status "Revisar", ou "Em vigor" com a próxima
  revisão (última revisão + período) vencida.
- **Revisão do cliente:** uma por mês para cada cliente ativo com revisão
  mensal. Vence no `review_day` do mês. Situação: feita (concluída), em
  andamento (começada), pendente (não começada, ainda no prazo) ou atrasada
  (não concluída depois do vencimento).
- **Saúde do cliente:** a da revisão mais recente que tem saúde marcada.

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
    isso a mesma linha funciona na lista larga de Tarefas e na pauta das
    Reuniões.
11. **Estado na URL quando é uma "visão"** (filtros de Tarefas, semana/mês e
    data do Calendário). Preferências pessoais simples, como Todas/Minhas na
    tela Hoje e a sidebar recolhida, ficam em cookie.
12. **Busca geral sem índice novo.** Com o volume da Boop, títulos e nomes são
    filtrados no servidor (sem acento) a cada busca, e os textos longos
    (processos, resumos e transcrições) usam a busca do Postgres que já
    existia. É uma Server Action só (`searchEverything`), com a sessão da
    pessoa e o RLS, chamada 220 ms depois da última tecla.
13. **Criar pela busca com `?novo=`.** A busca leva à tela certa com
    `?novo=<marca>`, e a própria tela abre o diálogo dela (uma vez por marca)
    e limpa o endereço (`useUrlTrigger`). Cada tela continua dona do seu
    diálogo; a busca não duplica formulários.

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

### Etapa 3 — sair do Notion: tudo num lugar só ✅

1. **Reuniões** ✅: weekly e reuniões com clientes, pauta automática,
   assuntos, combinados que viram tarefa, resumo e transcrição com busca.
   Visita diária ao banco para o Supabase gratuito não pausar.
2. **Processos** ✅: documentação interna com editor de blocos, modelos e
   sugestões, responsável, revisão periódica, versões com restauração, busca
   no texto, imagens privadas; organizada por área e por cliente; checklists
   viram tarefas.
3. **Clientes** ✅: cadastro completo no portal, semáforo de saúde, revisão
   mensal (checklist, notas, próximos passos que viram tarefas, histórico),
   página do cliente reunindo tarefas, reuniões e processos; revisões por
   fazer na tela Hoje e na weekly.
4. **Unificação** ✅: busca geral (Ctrl/⌘ + K) em tarefas, reuniões,
   processos e clientes, com ações rápidas; tela Hoje como painel do dia
   (próxima reunião, combinados em aberto, revisões de clientes e processos
   para revisar); links que abrem a tarefa ou o diálogo de criar.

### Próximos passos

1. Cada pessoa troca a senha temporária.
2. Limpeza opcional: apagar a tabela `weekly_decisions` (vazia e sem uso)
   numa migration nova e regenerar os tipos. O Supabase pede confirmação para
   apagar tabela, e a ferramenta usada no desenvolvimento não conseguiu
   confirmar; por isso ela continua no banco.

## 12. Infraestrutura e variáveis de ambiente

| Peça        | Onde                                                                 |
| ----------- | -------------------------------------------------------------------- |
| Banco/Auth  | Supabase, organização "Boop", projeto `boop-admin` (`zqugfixszhfoochvaaol`), região `sa-east-1` |
| Hospedagem  | Vercel, projeto `boop-admin` (só este repositório), funções em `gru1` |
| Produção    | branch `main` → <https://admin.deumboop.com.br> e <https://boop-admin.vercel.app> |
| Domínio     | `admin.deumboop.com.br`: CNAME e TXT `_vercel` na zona `deumboop.com.br` (Registro.br) |
| Visita diária | cron da Vercel (`vercel.json`) abre `/api/keepalive` às 08:00 e às 20:00 (Brasília) |

- As URLs `*.vercel.app` ficam atrás da autenticação da Vercel (só quem é da
  conta na Vercel abre). O domínio próprio é público, e o app exige login.
- O projeto do site (`boop`, com `deumboop.com.br` e `www`) não foi alterado.
- O Supabase gratuito pausa o projeto depois de 7 dias com pouca atividade.
  A visita diária faz quatro consultas sem sessão (o RLS devolve zero
  linhas, mas o banco conta o uso). A rota é pública porque não expõe nada
  além do que a chave publicável já permite.

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
