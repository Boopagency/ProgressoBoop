# Boop Admin — Arquitetura e plano

Documento de referência da primeira versão do Boop Admin, a ferramenta interna
da Boop. Reúne a análise do repositório, a arquitetura, o schema do Supabase,
as dependências, a estrutura das telas, a infraestrutura e o plano de
implementação.

> Status: **em produção** em <https://admin.deumboop.com.br> (Supabase +
> Vercel), com a operação (etapas 1–4) e a gestão (etapa 5: financeiro
> gerencial, comercial, indicadores, metas e relatórios). Como rodar:
> [README](../README.md). O que cada tela faz: [FUNCIONALIDADES](FUNCIONALIDADES.md).

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
│   │   ├── layout.tsx          # sidebar + dados de referência (equipe, clientes,
│   │   │                       # projetos, visões salvas)
│   │   ├── hoje/               # "/hoje" (a raiz "/" redireciona para cá)
│   │   ├── loading.tsx / error.tsx
│   │   ├── tarefas/            # "/tarefas" (?ver=tabela|quadro e os filtros)
│   │   ├── projetos/           # "/projetos" e "/projetos/[id]"
│   │   ├── calendario/         # "/calendario"
│   │   ├── reunioes/           # "/reunioes" e "/reunioes/[id]" ("/segunda" redireciona)
│   │   ├── clientes/           # "/clientes" e "/clientes/[id]" (?mes=aaaa-mm)
│   │   ├── comunicacoes/       # "/comunicacoes" (?cliente=…)
│   │   ├── decisoes/           # "/decisoes"
│   │   ├── processos/          # "/processos" e "/processos/[id]"
│   │   ├── financeiro/         # "/financeiro" (?mes=aaaa-mm) e as abas dre/, projecao/,
│   │   │                       # contratos/, lancamentos/, fechamento/, parametros/
│   │   ├── comercial/          # "/comercial" (funil de vendas; ?negocio=<id>)
│   │   ├── indicadores/        # "/indicadores" (?periodo=&ref=&comparar=&area=)
│   │   ├── metas/              # "/metas" (OKRs)
│   │   └── relatorios/         # "/relatorios" (montar relatório ou Excel)
│   ├── relatorio/              # "/relatorio": relatório para apresentar/imprimir (fora
│   │                           # do layout com sidebar, exige sessão)
│   ├── api/relatorios/excel/   # o .xlsx gerado no servidor (com a sessão da pessoa)
│   ├── api/keepalive/          # visita diária ao banco (cron da Vercel)
│   ├── api/arquivos/           # imagens dos processos (confere a sessão, redireciona
│   │                           # para uma URL assinada e temporária do Storage)
│   ├── login/                  # "/login" (sem "Criar conta")
│   ├── layout.tsx              # raiz: fonte, <html lang="pt-BR">, Toaster
│   └── globals.css             # Tailwind v4 + tokens do design system
├── components/
│   ├── ui/                     # shadcn/ui (código gerado)
│   ├── layout/                 # sidebar, menu do usuário, cabeçalho de página
│   ├── charts/                 # gráficos sem biblioteca: colunas, linhas, sparkline,
│   │                           # barras horizontais (tooltip, teclado, legenda)
│   └── *.tsx                   # peças visuais genéricas: date-picker, stat-grid,
│                               # segmented-control, progress-meter, panel-card, kpi-tile
├── features/
│   ├── auth/                   # sessão, login/logout
│   ├── workspace/              # equipe, clientes, projetos, visões salvas (referência)
│   ├── tasks/                  # lista, tabela, quadro, linha, Sheet, "Nova tarefa",
│   │                           # filtros, lógica pura
│   ├── projects/               # projetos: lista, página, modelos de tarefas, progresso
│   ├── views/                  # visões salvas da tela Tarefas
│   ├── activity/               # histórico (quem mudou o quê) e comentários
│   ├── decisions/              # decisões: registro, lista, cartões de reunião,
│   │                           # cliente e projeto
│   ├── communications/         # comunicações com clientes (pedido → tarefa)
│   ├── finance/                # receitas e despesas, recorrências, atrasados e a gestão
│   │                           # (management.ts: DRE, MRR, projeção, divisão do resultado,
│   │                           # receita necessária, inadimplência, fechamento)
│   ├── deals/                  # comercial: negócios, funil, conversão em cliente
│   ├── metrics/                # catálogo de indicadores (KPIs), períodos e painéis
│   ├── goals/                  # metas (OKRs) com progresso pelos indicadores
│   ├── reports/                # relatório para apresentar e as abas do Excel
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
│   ├── xlsx.ts                 # gerador de .xlsx (SpreadsheetML + zip), sem dependência
│   └── *.ts                    # datas (fuso de SP), rótulos, tipos, formatos, cn()
└── proxy.ts                    # sessão + proteção de rotas (no Next 16, substitui o middleware)

supabase/
├── migrations/                 # schema, trigger e RLS (fonte da verdade do banco)
└── seed.sql                    # dados reais: equipe, clientes, projeto interno, 25 tarefas,
                                # reunião
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
`plans`. Depois vieram as reuniões (`meetings` e `meeting_items`), os
processos (`docs` e `doc_versions`), as revisões de clientes
(`client_reviews`), a operação (`projects`, `saved_views`, `decisions`,
`communications`, `finance_recurrences`, `finance_entries` e `activity`) e a
gestão (`finance_settings`, `finance_closings`, `deals`, `objectives` e
`key_results`) e a Central de Conteúdo (`content_posts` e `content_ideas`). O
SQL está em `supabase/migrations/`, uma migration por etapa:
[`initial_schema`](../supabase/migrations/20260925162330_initial_schema.sql),
[`meetings`](../supabase/migrations/20261006141627_meetings.sql),
[`docs`](../supabase/migrations/20261006163448_docs.sql),
[`docs_content_stamp`](../supabase/migrations/20261006165216_docs_content_stamp.sql),
[`docs_restore_version`](../supabase/migrations/20261006165704_docs_restore_version.sql),
[`clients_reviews`](../supabase/migrations/20261006173103_clients_reviews.sql),
[`projects`](../supabase/migrations/20261007144307_projects.sql),
[`decisions_communications_finance`](../supabase/migrations/20261007144345_decisions_communications_finance.sql),
[`activity`](../supabase/migrations/20261007144504_activity.sql),
[`finance_occurrence_activity`](../supabase/migrations/20261007162915_finance_occurrence_activity.sql),
[`finance_management`](../supabase/migrations/20261007174116_finance_management.sql),
[`commercial`](../supabase/migrations/20261007174202_commercial.sql),
[`goals`](../supabase/migrations/20261007174228_goals.sql),
[`win_deal`](../supabase/migrations/20261007212513_win_deal.sql) e
[`content`](../supabase/migrations/20261008122847_content.sql).

| Tabela             | Colunas principais                                                                 |
| ------------------ | ---------------------------------------------------------------------------------- |
| `profiles`         | `id` (= `auth.users.id`), `full_name`, `avatar_url`, `role`, `created_at`          |
| `clients`          | `id`, `name` (único), `active`, `owner_id` (responsável da Boop), `services` (frentes), `since`, `contact_name`, `contact_email`, `contact_phone`, `notes`, `review_day` (dia do mês em que a revisão vence; vazio = sem revisão mensal), `instagram_handle` (sem @), `instagram_bio`, `avatar_path` (foto do perfil no Storage), `created_at`, `updated_at` |
| `plans`            | `id`, `name`, `starts_on`, `ends_on`, `created_at`. **Obsoleta**: virou projeto (mesmo `id`); sai na migration de limpeza |
| `tasks`            | `id`, `title`, `description`, `client_id`, `project_id`, `area`, `status`, `priority`, `due_date`, `completed_at`, `created_by`, `created_at`, `updated_at` (e `plan_id`, obsoleta) |
| `task_assignees`   | `task_id`, `profile_id` (chave composta)                                           |
| `events`           | `id`, `title`, `description`, `event_type`, `start_at`, `end_at`, `all_day`, `recurrence_rule`, `client_id`, `created_by`, `created_at` |
| `weekly_decisions` | `id`, `content`, `week_start` (sempre segunda), `created_by`, `created_at`. Sem uso desde as Reuniões; sai numa migration de limpeza |
| `meetings`         | `id`, `event_id`, `occurs_on`, `status`, `summary`, `transcript`, `transcript_length` (gerada), `agenda` (pauta congelada, jsonb), `closed_at`, `closed_by`, `created_by`, `created_at`, `updated_at`, `search` (tsvector gerado) |
| `meeting_items`    | `id`, `meeting_id`, `kind` (assunto ou combinado), `content`, `owner_id`, `due_date`, `done`, `task_id`, `created_by`, `created_at` |
| `docs`             | `id`, `title`, `kind`, `status`, `area`, `client_id`, `owner_id`, `summary` ("para que serve"), `content` (blocos do editor, jsonb), `content_text` (texto puro), `review_every_months`, `reviewed_on`, `next_review_on` (gerada), `pinned`, `created_by`, `updated_by`, `created_at`, `updated_at`, `content_updated_at`, `content_updated_by`, `search` (tsvector gerado) |
| `doc_versions`     | `id`, `doc_id`, `title`, `content`, `saved_by`, `saved_at` (quem deixou o texto assim, e quando), `created_at` |
| `client_reviews`   | `id`, `client_id`, `period` (mês, sempre dia 1; uma por cliente e mês), `health`, `checklist` (jsonb), `notes`, `done`, `done_at`, `done_by`, `created_by`, `created_at`, `updated_at` |
| `projects`         | `id`, `name`, `client_id` (vazio = interno), `owner_id`, `status`, `template` (modelo usado), `description`, `starts_on`, `due_on`, `pinned` ("em foco"), `completed_at`, `created_by`, `created_at`, `updated_at` |
| `saved_views`      | `id`, `page` (por ora só `tasks`), `name`, `query` (filtros e modo, como na URL), `created_by`, `created_at` |
| `decisions`        | `id`, `title`, `context` (o porquê), `decided_on`, `status` (em vigor ou revogada), `area`, `client_id`, `project_id`, `meeting_id`, `created_by`, `created_at`, `updated_at` |
| `communications`   | `id`, `client_id` (obrigatório), `project_id`, `kind`, `channel`, `summary`, `details`, `occurred_on`, `created_by`, `created_at`, `updated_at` |
| `finance_recurrences` | `id`, `kind` (receita ou despesa), `account` (categoria gerencial), `description`, `amount_cents`, `day_of_month`, `category` (subcategoria livre; em receitas de cliente, a frente), `client_id`, `project_id`, `starts_on` e `ends_on` (meses, dia 1), `notes`, `created_by`, `created_at`, `updated_at` |
| `finance_entries`  | `id`, `kind`, `account`, `description`, `amount_cents` (valor bruto), `fee_cents` (taxa do gateway), `due_on`, `paid_on`, `skipped`, `category`, `client_id`, `project_id`, `recurrence_id` + `period` (o mês de uma recorrência; único por recorrência e mês), `notes`, `created_by`, `created_at`, `updated_at` |
| `finance_settings` | uma linha só: `tax_rate_bps` (alíquota, 600 = 6%), `tax_rate_confirmed`, `reserve_months` (caixa mínimo em meses de custo fixo), `reserve_share_bps` e `reinvest_share_bps` (divisão do resultado), `partners`, `owner_draw_target_cents` (alvo de pró-labore por sócio), `opening_balance_cents` + `opening_on` (saldo no início do controle), `contract_alert_days`, `updated_by`, `updated_at` |
| `finance_closings` | `period` (mês fechado), `ledger_balance_cents` (saldo pelos lançamentos), `bank_balance_cents` (saldo do extrato), `notes`, `closed_by`, `closed_at` |
| `deals`            | `id`, `title`, `client_id` (cliente da casa ou o criado ao ganhar), `company`, `contact_name`, `contact_email`, `contact_phone`, `source` (origem), `service` (frente), `stage`, `reached_stage` (etapa mais avançada, pelo trigger), `owner_id`, `recurring_cents`, `one_time_cents`, `term_months`, `probability`, `opened_on`, `expected_close_on`, `proposal_sent_on`, `closed_on`, `lost_reason`, `project_id` e `recurrence_id` (o que nasceu do ganho), `notes`, `created_by`, `created_at`, `updated_at` |
| `objectives`       | `id`, `title`, `description`, `area`, `owner_id`, `starts_on`, `ends_on`, `created_by`, `created_at`, `updated_at` |
| `key_results`      | `id`, `objective_id`, `title`, `metric` (indicador do catálogo; vazio = manual), `client_id` (recorte), `unit`, `target_value`, `baseline_value`, `manual_value`, `position`, `created_by`, `created_at`, `updated_at` |
| `content_posts`    | `id`, `client_id` (obrigatório), `project_id`, `title`, `format`, `networks` (pelo menos uma), `intents`, `publish_on`, `publish_time`, `stage`, `copy_status`, `design_status`, `video_status` (frentes), `owner_id`, `brief` (ideia), `design_notes` (orientação de design ou vídeo), `script` (roteiro), `slides` (jsonb `[{ text, image_path }]`, até 20), `caption` (legenda), `drive_url`, `cover_path` (capa no Storage), `pinned` (fixado no feed), `published_at` (trigger), `created_by`, `created_at`, `updated_at` |
| `content_ideas`    | `id`, `client_id` (obrigatório), `title`, `notes`, `format`, `reference_url`, `post_id` (o post em que virou), `created_by`, `created_at`, `updated_at` |
| `activity`         | `id`, `entity_type`, `entity_id`, `entity_title`, `project_id`, `client_id`, `action` (criou, mudou, excluiu, comentou), `changes` (jsonb `{campo: [antes, depois]}`), `body` (comentário), `actor_id`, `created_at`, `edited_at` |

`tasks` ganhou `meeting_id` (a reunião em que a tarefa nasceu), `doc_id` (o
processo de cujo checklist ela saiu), `client_review_id` (a revisão mensal
de cliente em que ela virou próximo passo), `project_id` (o projeto) e
`communication_id` (o pedido do cliente que ela atende) e `content_post_id`
(o post de cuja frente ela saiu). Imagens dos processos ficam no bucket
privado `docs` do Storage (até 5 MB; PNG, JPG, WebP e GIF); as de conteúdo
(capas, slides e foto do perfil do cliente), no bucket privado `content`, em
`<client_id>/<arquivo>` (até 5 MB; PNG, JPG e WebP). Dinheiro é sempre inteiro em centavos (`bigint`), sem arredondamento.

Enums: `task_status` (`todo`, `doing`, `done`), `task_priority` (`low`,
`normal`, `high`), `task_area` (`commercial`, `finance`, `operations`,
`brand`, `technology`, `clients`), `event_type` (`meeting`, `internal`,
`delivery`), `meeting_status` (`scheduled`, `done`, `canceled`),
`meeting_item_kind` (`topic`, `agreement`), `doc_kind` (`process`,
`checklist`, `policy`, `guide`), `doc_status` (`draft`, `active`, `review`),
`client_health` (`healthy`, `attention`, `at_risk`), `project_status`
(`planned`, `active`, `paused`, `done`, `canceled`), `decision_status`
(`active`, `revoked`), `communication_kind` (`update`, `request`, `approval`,
`feedback`, `other`), `communication_channel` (`whatsapp`, `email`, `call`,
`meeting`, `other`), `finance_kind` (`income`, `expense`), `activity_action`
(`created`, `updated`, `deleted`, `comment`), `finance_account`
(`client_revenue`, `other_revenue`, `owner_contribution`, `direct_cost`,
`fixed_cost`, `other_expense`, `tax`, `owner_draw`, `reinvestment`),
`deal_stage` (`lead`, `contact`, `proposal`, `negotiation`, `won`, `lost`) e
`lead_source` (`referral`, `instagram`, `website`, `google`, `linkedin`,
`whatsapp`, `outbound`, `event`, `existing_client`, `other`),
`content_format` (`reels`, `carousel`, `static`, `stories`, `video`,
`photo`, `text`), `content_network` (`instagram`, `tiktok`, `linkedin`),
`content_intent` (`conversion`, `growth`, `authority`, `connection`,
`sponsored`), `content_stage` (`production`, `internal_review`,
`client_review`, `approved`, `scheduled`, `published`) e
`content_front_status` (`not_needed`, `todo`, `in_progress`,
`missing_material`, `in_review`, `changes`, `done`).

Função exposta: `public.win_deal(...)` (`security invoker`, só para
`authenticated`), que ganha um negócio numa transação (item 30).

### 5.1 Decisões sobre o schema

1. **`task_assignees` (tarefa ↔ pessoa)** em vez de `assignee_id`. O plano tem
   tarefas de uma, duas ou das três pessoas ("Todos"). A tabela de relação
   mantém integridade (FK + cascade) e a consulta continua simples: a tarefa
   vem com os responsáveis numa única chamada.
2. **`plans` (nova, pequena)**. A tela Hoje mostra o progresso de
   "Estruturação da Boop até 31/10". Para isso é preciso saber **quais**
   tarefas pertencem ao plano; filtrar por data misturaria tarefas avulsas de
   clientes com as do plano. Com `plans` + `tasks.plan_id`, o progresso sai de
   uma contagem, e o próximo plano é só uma nova linha. **Substituída pelos
   projetos (item 19)**: o plano virou um projeto interno, "em foco".
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
19. **Projeto no lugar do plano, sem conceito paralelo.** `projects` cobre
    entregas para clientes (site, identidade, implantação) e ciclos internos
    ("Estruturação da Boop até 31/10"). O plano existente virou um projeto
    interno com o mesmo `id`, fixado ("em foco"), e as tarefas dele ganharam
    `project_id`. A tela Hoje e a weekly mostram os projetos em foco
    (fixados e abertos). `plans` e `tasks.plan_id` ficam só até a migration
    de limpeza; reuniões já encerradas guardam a pauta com o plano como
    estava e continuam mostrando.
20. **Modelos de projeto no código** (`features/projects/templates.ts`):
    listas de tarefas com prazo relativo ao começo (site institucional,
    identidade visual, social media, tráfego pago e plano interno). Um
    projeto novo também pode repetir as tarefas de outro (na mesma distância
    do começo) ou usar o checklist de um processo. As tarefas nascem com o
    responsável do projeto (ou quem criou) e com o cliente. Sem tabela de
    modelos: mudar um modelo é mudar o código, e o projeto guarda em
    `template` qual usou.
21. **Progresso do projeto = tarefas dele.** Sem campo de percentual:
    concluídas sobre o total, atrasadas e próxima entrega. Concluir o
    projeto preenche `completed_at` (trigger `set_project_fields`). Trocar o
    cliente do projeto leva o cliente novo às tarefas que estavam com o
    antigo ou sem cliente.
22. **Visão salva = a URL da tela Tarefas.** `saved_views.query` guarda os
    parâmetros (`pessoa`, `status`, `area`, `cliente`, `projeto`, `prazo`,
    `ver`), então aplicar uma visão é só navegar. As visões são da equipe
    (todos veem e editam) e aparecem também no menu lateral, abaixo de
    Tarefas.
23. **Histórico pelo banco.** Triggers (`log_*_activity`) gravam em
    `activity` quem criou, mudou ou excluiu tarefas (e responsáveis),
    projetos, decisões, comunicações e lançamentos, com
    `{campo: [antes, depois]}`. Vale para qualquer caminho de escrita, sem
    código no app. Para não virar ruído: mudanças da mesma pessoa no mesmo
    item se juntam (até 2 minutos depois de criar, entram na criação;
    edições seguidas em até 10 minutos viram uma linha "antes do primeiro →
    depois do último"; voltar ao valor original apaga a linha), exclusões
    em cascata (de um cliente ou projeto) não geram registros e o mês de
    recorrência gravado na primeira mudança não aparece como "lançou".
    Comentários são linhas `comment` (em tarefas, projetos e decisões); cada
    pessoa edita e apaga só os seus, e ninguém altera o resto do histórico.
24. **Decisão é entidade própria.** `decisions` guarda o que a Boop definiu e
    por quê, com status (em vigor ou revogada) e ligações opcionais com
    reunião, cliente e projeto. É diferente do combinado (`meeting_items`),
    que é uma ação com dono e prazo. `weekly_decisions` (vazia) sai na
    limpeza.
25. **Comunicação sempre de um cliente.** `communications.client_id` é
    obrigatório, e excluir o cliente apaga as comunicações dele. Um pedido
    vira tarefa (`tasks.communication_id`), e a lista conta os pedidos que
    ainda não viraram.
26. **Financeiro: lançamentos + recorrências calculadas.** Avulsos (entrada
    de projeto, extra, freelancer) são linhas em `finance_entries`. Fees e
    assinaturas são `finance_recurrences`: cada mês é uma ocorrência que o
    app calcula sem gravar e que só vira linha (`recurrence_id` + `period`,
    únicos) na primeira mudança (recebido/pago, pular o mês, valor ou
    vencimento só daquele mês). Mudar a recorrência vale para os meses ainda
    não gravados; apagá-la mantém os meses gravados. O item pertence ao mês
    do vencimento. É o mesmo padrão das revisões de clientes (item 17).
27. **Categoria gerencial (`account`) no próprio lançamento.** Cada lançamento
    e recorrência diz onde entra no DRE, com as categorias da planilha
    "Financeiro - Boop": receita de cliente, outras receitas, aporte de sócio
    (só caixa), custo direto de cliente, custo fixo, outras despesas, imposto
    pago (DAS), pró-labore e reinvestimento. É um enum (`finance_account`)
    com `check` que amarra entradas às contas de entrada; quem não informa
    recebe uma conta padrão pelo trigger (compatível com a versão anterior).
    `category` continua livre, como subcategoria (nas receitas de cliente, a
    frente: Social media, Site, Tráfego). Recebimentos pelo gateway guardam a
    taxa em `fee_cents`; o valor do lançamento é sempre o bruto.
28. **DRE no regime de caixa, calculado e nunca gravado.** Como na planilha:
    mês passado = o que foi recebido e pago nele; mês atual = realizado + o
    que ainda vence nele; meses futuros = contratos, custos fixos e
    lançamentos agendados. O imposto do DRE é provisão pela alíquota (o DAS
    pago fica fora do resultado); as taxas são as lançadas ou, no previsto, a
    taxa média dos últimos 12 meses. Pró-labore, aportes e reinvestimentos
    ficam fora do resultado (são o destino dele). Tudo em
    `features/finance/management.ts`: nenhum DRE, MRR ou margem fica gravado.
29. **Premissas numa linha só (`finance_settings`).** Alíquota (e se já foi
    confirmada com o contador), caixa mínimo em meses de custo fixo, divisão
    do resultado, sócios, alvo de pró-labore e saldo inicial; os valores
    iniciais são os da aba PARÂMETROS. A divisão segue a planilha: resultado
    negativo não se divide (sai do caixa); com o caixa abaixo do mínimo, tudo
    vai para o caixa; depois, caixa / reinvestimento / pró-labore (o resto).
30. **Fechamento do mês trava o realizado.** `finance_closings` guarda o
    saldo pelos lançamentos e o do extrato. O trigger `check_finance_lock`
    não deixa mudar valor, taxa, data de pagamento, conta, tipo ou "pular",
    nem excluir, lançamentos pagos num mês fechado (descrição, observação e
    vínculos podem mudar). O app fecha só meses que já acabaram, em ordem, a
    partir do primeiro mês do controle; reabrir (apagar o fechamento) só o
    último.
31. **Comercial sem copiar dados.** `deals` é o funil (lead → contato →
    proposta → negociação → ganho ou perdido). O trigger mantém
    `reached_stage` (o funil conta cada negócio pela etapa mais longe que
    alcançou; o perdido guarda onde parou), `proposal_sent_on` e `closed_on`.
    Ganhar é a função `win_deal`, numa transação e com o RLS de quem está
    logado: liga ou cria o cliente, cria o contrato (receita recorrente do
    cliente, do mês de início até o fim do prazo), a entrada pontual e o
    projeto, e grava os vínculos no negócio. Daí em diante o faturamento
    vem do financeiro, não do negócio.
32. **Indicadores são funções, não tabelas.** `features/metrics/catalog.ts`
    define cada KPI: valor num intervalo de datas, unidade, se subir é bom,
    a fórmula em português e as linhas de origem (o detalhamento). Painéis,
    comparação de períodos, tendência de 12 meses, metas, relatório e Excel
    usam o mesmo catálogo, então um número não diverge entre telas.
33. **Metas (OKRs) apontam para indicadores.** `key_results.metric` guarda a
    chave do catálogo e o progresso é calculado na hora, no período do
    objetivo (só o realizado). Resultado manual fica para o que o sistema não
    mede (ex.: NPS). Sem histórico paralelo de valores: o histórico é o dos
    próprios dados.
34. **Excel gerado no servidor, sem biblioteca.** `lib/xlsx.ts` escreve o
    SpreadsheetML e o zip, com o formato de moeda da planilha da Boop e
    fórmulas que já levam o valor calculado (margens, resultado, totais e o
    imposto pela alíquota da aba Premissas, que pode ser editada). A rota
    confere a sessão e lê os dados com o RLS da pessoa.
35. **Central de Conteúdo: os posts de todos os clientes numa tabela só.**
    `content_posts` traz o modelo "Central de Conteúdo" do Notion para o
    admin, com `client_id` obrigatório (excluir o cliente apaga os posts e as
    ideias dele, sem um "excluiu" por post no histórico), para a visão
    central filtrar por cliente, pessoa, rede, formato e etapa. A etapa
    (`stage`) é o fluxo do post (produção → revisão interna → cliente →
    aprovado → programado → publicado); as frentes (`copy_status`,
    `design_status`, `video_status`) dizem o que falta produzir, e "Falta
    material" em qualquer uma marca o post como travado. O trigger
    `set_content_post_fields` mantém `updated_at` e a autoria, decide a
    frente de vídeo na criação quando ninguém informa (A fazer em reels,
    vídeo e stories; Não precisa nos demais) e preenche `published_at` ao
    virar publicado (limpa ao sair). As regras (campos por formato, frentes
    iniciais, progresso, atraso, filtros, agrupamentos e ordem do feed)
    ficam em `features/content/logic.ts`. O histórico registra criação,
    exclusão e mudanças de título, etapa, frentes, data, responsável e
    formato; posts recebem comentários.
36. **Textos, imagens e ligações do post.** Slides são jsonb
    (`[{ text, image_path }]`, até 20), conferidos pelo check
    `private.content_slides_valid`; links (`drive_url`, `reference_url`) só
    `http(s)`. Imagens (capa, slides e a foto do perfil do cliente) ficam no
    bucket privado `content`, em `<client_id>/<arquivo>`, com o mesmo modelo
    do bucket `docs`. O perfil do Instagram (`instagram_handle`,
    `instagram_bio`, `avatar_path`) fica no próprio cliente, para o preview
    do feed. As frentes viram tarefas (`tasks.content_post_id`), e as ideias
    do banco de ideias (`content_ideas`) apontam para o post em que viraram.

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
| `projects`, `saved_views`, `decisions`, `communications`, `finance_recurrences`, `finance_entries` | ver, criar (como autor), editar e excluir |
| `finance_settings` | ver e editar (a linha única já existe; ninguém cria nem apaga) |
| `finance_closings` | ver, fechar o mês (como autor) e reabrir                      |
| `deals`, `objectives`, `key_results` | ver, criar (como autor), editar e excluir    |
| `content_posts`, `content_ideas` | ver, criar (como autor), editar e excluir        |
| `activity`         | ver; criar só comentários (como autor); editar e apagar só os próprios comentários. O resto é gravado pelo banco |
| Storage, buckets `docs` e `content` | ver, enviar e apagar imagens                 |

- `win_deal` é `security invoker`: roda com as permissões de quem chamou,
  então as políticas acima valem para tudo o que ela cria. Anônimos não
  podem executá-la.

- Nenhuma chave secreta ou service role é usada pelo app. O servidor fala com
  o Supabase com a chave publicável + a sessão da pessoa, então o RLS vale
  para tudo o que o app faz.

### 5.3 Contas

- Não há cadastro público (desligado no Supabase Auth: "Allow new users to
  sign up") nem botão "Criar conta". As três contas
  (`jabez@`, `renatha@` e `leo@deumboop.com.br`) foram criadas direto no
  Supabase Auth, com senha temporária.
- `supabase/seed.sql` cria os perfis dessas contas, os clientes, o projeto
  interno "Estruturação da Boop até 31/10", as 25 tarefas e a reunião
  semanal. Pode rodar de novo sem duplicar nada.
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
gráficos, de planilhas ou de validação. O volume de dados e as regras não
justificam: os gráficos (`components/charts`) e o gerador de Excel
(`lib/xlsx.ts`) são pequenos e feitos para estas telas. O editor de
documentos é a exceção que vale o peso: escrever um editor de blocos
(títulos, listas, checklists, tabelas, imagens, arrastar) do zero não faria
sentido.

## 7. Telas

Rotas em português. Todas usam o mesmo layout: sidebar à esquerda (Hoje,
Tarefas e as visões salvas, Projetos, Calendário, Reuniões; **Relacionamento**:
Comercial, Clientes, Comunicações; **Gestão**: Indicadores, Metas,
Financeiro, Relatórios, Decisões, Processos; usuário e sair no rodapé) e
conteúdo num painel branco sobre fundo off-white. No topo de todas,
**Buscar…** (Ctrl/⌘ + K) abre a busca geral. A exceção é `/relatorio`, a
página limpa do relatório para apresentar ou imprimir.

### Hoje (`/hoje`)

- É a tela inicial: o login leva para cá e a raiz `/` redireciona para cá.
- Cabeçalho: "Bom dia, Jabez" (nome do usuário logado) + data por extenso +
  botão "Nova tarefa".
- Alternância **Minhas / Todas**, com **Minhas** como padrão. A escolha fica
  salva no navegador.
- Quatro indicadores discretos: atrasadas, para hoje, esta semana,
  concluídas na semana. Clicar leva à seção.
- Progresso: os **projetos em foco** (fixados, até quatro). O primeiro
  ("Estruturação da Boop até 31/10") é a informação principal: percentual
  grande, barra, "X de Y tarefas", dias restantes e atrasadas; os outros vêm
  menores, com link para o projeto. Conta a equipe inteira; no filtro Minhas
  aparece também a parte da pessoa ("suas: X de Y"). A **semana** vem abaixo,
  menor (tarefas com prazo nesta semana: concluídas / total).
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
  - **Financeiro em atraso**: quanto há a receber e a pagar vencido, com
    link para o Financeiro;
  - **Processos para revisar** (no Minhas, os da pessoa e os sem responsável);
  - **Gestão**: mês a fechar, contratos terminando, queda prevista do MRR,
    caixa negativo na projeção e negócios com previsão de fechamento até
    daqui a 3 dias (ou já passada);
  - **Próximos compromissos** (7 dias). Clicar numa reunião abre a pauta dela.
  Quadro sem nada para mostrar não aparece.
- Clicar numa tarefa abre o **Sheet lateral** de detalhes, que pode ser
  editado sem sair da tela.

### Tarefas (`/tarefas`)

- Filtro de pessoa no topo: Todas · Minhas · Jabez · Renatha · Léo.
- Filtros adicionais: status (padrão: abertas), projeto (ou "sem projeto"),
  cliente, área e prazo.
- Três modos: **Lista** (agrupada por prazo: Atrasadas, Hoje, Esta semana,
  Depois, Sem prazo e Concluídas), **Tabela** (colunas ordenáveis: tarefa,
  status, prazo, prioridade, projeto, cliente e área) e **Quadro** (A fazer,
  Fazendo e Feito; arrastar muda o status; Feito mostra as concluídas dos
  últimos 14 dias).
- **Visões salvas**: os filtros e o modo atuais com um nome ("Velmont",
  "Minhas atrasadas"), para a equipe toda; ficam no topo da tela e no menu
  lateral.
- "Nova tarefa" abre um Dialog: título → responsável → prazo → salvar. Área,
  cliente, projeto, prioridade e descrição são opcionais. Atalho: tecla **N**
  em qualquer tela.
- Filtros e modo ficam na URL (`/tarefas?pessoa=…&prazo=week&ver=quadro`),
  então dá para compartilhar uma visão.
- O Sheet da tarefa ganhou **Projeto** (leva o cliente do projeto junto) e
  **Atividade**: o histórico da tarefa e os comentários.

### Projetos (`/projetos`)

- Cartões por status (Em andamento, Planejados, Pausados; concluídos e
  cancelados recolhidos), com cliente ou "Interno", prazo, progresso das
  tarefas, atrasadas, responsável e próxima entrega. Filtros: Todos,
  Clientes, Internos, Meus. O alfinete põe ou tira do foco.
- **Novo projeto**: nome, cliente (ou interno), responsável, começo, prazo,
  status, "em foco", descrição e as **tarefas iniciais**: em branco, um
  modelo da Boop (site institucional, identidade visual, social media,
  tráfego pago, plano interno), as tarefas de outro projeto ou o checklist de
  um processo.

### Projeto (`/projetos/[id]`)

- Cabeçalho com status, foco, modelo, cliente, responsável e período;
  menu para fixar, pausar, retomar, concluir, cancelar, criar um projeto a
  partir deste e excluir (com ou sem as tarefas).
- Progresso (percentual, tarefas, atrasadas, próxima entrega e prazo) e as
  **Tarefas** do projeto em lista ou quadro.
- **Atividade**: tudo o que mudou no projeto e nos itens dele, com
  comentários.
- Lateral: **Sobre o projeto**, **Decisões**, **Comunicações** (projetos de
  cliente) e **Financeiro** (receita, custos e resultado do projeto).

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
  domingo e concluídas desde a última), com o progresso dos projetos em
  foco; com cliente, as tarefas daquele cliente.
- **Decisões** da reunião (o que passa a valer), já ligadas a ela e ao
  cliente.
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
- **Projetos** do cliente (com "Novo"), **Tarefas** por prazo (e as
  concluídas nos últimos 30 dias), **Comunicações** e **Reuniões** (próximas
  e recentes, com "Nova reunião" já com o cliente).
- Lateral: **Sobre o cliente** (responsável, frentes, contato com e-mail e
  WhatsApp, observações), **Financeiro** (mensalidade, margem do contrato,
  fim do contrato, em atraso, recebido no ano e o link para os lançamentos
  do cliente), **Negócios** (upsell e renovação no funil), **Saúde mês a
  mês** (seis meses), **Decisões** e **Processos do cliente**.
- Menu: nova reunião, novo processo do cliente, desativar/reativar e excluir.

### Comunicações (`/comunicacoes`)

- O que foi falado com os clientes, do mais recente para o mais antigo
  (Hoje, Ontem, Esta semana, Semana passada, meses): tipo (Pedido,
  Aprovação, Feedback, Atualização, Outro), canal (WhatsApp, e-mail,
  ligação, reunião), cliente, projeto e quem registrou.
- Busca, filtro por cliente e por tipo. O cabeçalho conta os pedidos que
  ainda não viraram tarefa.
- **Registrar**: resumo, detalhes, cliente, projeto, canal e data. Um pedido
  **vira tarefa** num clique (cliente e projeto junto, ligada à
  comunicação).

### Decisões (`/decisoes`)

- O que a Boop definiu e por quê (preço mínimo, prazos, regras com
  clientes, escolhas de projeto), por mês. Filtros: Em vigor (padrão),
  Revogadas, Todas; área; cliente ou projeto; busca no título e no
  contexto. Cada decisão mostra a data, a área, a reunião de origem, o
  cliente, o projeto e quem registrou.
- **Nova decisão**: título, contexto, data, área, cliente e projeto (na
  reunião, já ligada a ela). Dá para revogar, voltar a valer e excluir.

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

### Financeiro (`/financeiro`)

A lógica da planilha "Financeiro - Boop" em abas, com o mesmo cabeçalho e o
botão **Novo lançamento** em todas.

- **Mês** (`/financeiro?mes=aaaa-mm`): receita bruta (recebido e a
  receber), custos e despesas, resultado e saldo em conta; **Em atraso**;
  **Receitas** e **Despesas** do mês (o checkbox marca recebido/pago com a
  data de hoje; ao receber, o toast oferece informar a taxa do gateway);
  **Resultado do mês** (mini-DRE, cada linha leva aos lançamentos), **Divisão
  do resultado** (caixa, reinvestimento e pró-labore por sócio, caixa
  acumulado em relação ao mínimo) e **Atenção** (alertas).
- **DRE** (`/financeiro/dre`, `?ano=`): período (últimos meses, ano),
  indicadores do período, gráficos de receita (recebido × previsto) e de
  resultado, e a tabela mês a mês com a situação de cada mês (fechado,
  realizado, parcial, previsto). Cada valor abre os lançamentos que o
  formam. Botão **Excel**.
- **Projeção** (`/financeiro/projecao`): 12 meses à frente pelos contratos,
  custos fixos e lançamentos agendados; MRR (6 meses para trás e 12 para a
  frente), caixa acumulado com a linha do mínimo, **receita necessária**
  para o alvo de pró-labore e a tabela mês a mês com a divisão do resultado.
- **Contratos e custos** (`/financeiro/contratos`): MRR, clientes com
  contrato, concentração no maior cliente, custos fixos; **margem por
  cliente** (MRR − imposto − taxa − custos diretos) e as recorrências por
  categoria, com fim do contrato e parcelas restantes.
- **Lançamentos** (`/financeiro/lancamentos`): o extrato com filtros na URL
  (`mes`, `de`/`ate`, `conta`, `cliente`, `situacao`, `tipo`,
  `conferencia`), busca e os totais (bruto, taxas, líquido). É o destino de
  todo "ver de onde vem" do financeiro.
- **Fechamento** (`/financeiro/fechamento`): o mês a fechar com os passos
  (vencimentos resolvidos, lançamentos conferidos, saldo do extrato) e os
  meses fechados (reabrir o último).
- **Parâmetros** (`/financeiro/parametros`): as premissas e o que o sistema
  calcula (taxa média do gateway, custos fixos, caixa mínimo).
- **Novo lançamento**: receita ou despesa, descrição, **categoria
  gerencial** (com a explicação de onde entra no DRE), valor bruto,
  vencimento, cliente (obrigatório em receita de cliente), projeto,
  subcategoria (ou frente), já recebido/pago (com a taxa do gateway), e
  **repetir todo mês** (contrato ou custo fixo, com fim ou número de
  parcelas). Num mês de recorrência dá para mudar só aquele mês, pular o mês
  ou editar a recorrência inteira.

### Comercial (`/comercial`)

- Indicadores do funil: em aberto (quantidade, mensal e valor), valor
  ponderado, ganhos no mês e taxa de ganho (90 dias, com o ciclo de venda).
- **Quadro** (Lead, Contato, Proposta, Negociação e a coluna dos fechados
  nos últimos 30 dias, com Ganho e Perdido; arrastar muda a etapa) e
  **Lista**; busca e filtro por responsável.
- **Negócio**: título, empresa ou cliente da casa, contato, origem, frente,
  valor mensal e pontual, prazo do contrato, etapa, chance de fechar (padrão
  da etapa), responsável, chegada, previsão de fechamento, observação,
  histórico e comentários. **Perder** pede o motivo; **Reabrir** volta ao
  funil.
- **Ganhar** (soltar em Ganho ou o botão): confirma o cliente (existente ou
  novo), o início, o dia de vencimento e a duração do contrato, a data da
  entrada pontual e o projeto; a função `win_deal` cria tudo de uma vez e o
  negócio passa a apontar para o que criou.

### Indicadores (`/indicadores`)

- Período (mês, trimestre ou ano, com setas) e comparação (período
  anterior ou mesmo período do ano passado), tudo na URL.
- Áreas: **Visão geral**, **Financeiro**, **Comercial** e **Operacional**.
  Cada indicador mostra o valor, a variação (verde ou vermelho conforme
  subir ser bom ou ruim) e a tendência de 12 meses.
- Clicar num indicador abre o **detalhe**: valor, comparação, a fórmula, o
  gráfico de 12 meses (no mês atual, realizado e previsto) e as linhas de
  origem, com o link para os dados (lançamentos, negócios, tarefas,
  projetos).
- Gráficos por área: faturamento e resultado por mês, MRR, receita por
  cliente, contas a receber em atraso por idade, funil do período, origem
  dos leads, leads e ganhos por mês, fechamentos previstos, tarefas
  concluídas por mês, tarefas abertas por pessoa e projetos atrasados.
- **Pede atenção**: os alertas do financeiro. Atalhos para o relatório e o
  Excel do mesmo período.

### Metas (`/metas`)

- Objetivos com período (este mês, trimestre, próximo trimestre, ano ou
  datas livres), área, responsável e descrição; filtro Em andamento,
  Próximas, Encerradas e Todas.
- Resultados-chave ligados a um **indicador** (progresso automático, com
  recorte por cliente quando faz sentido) ou **manuais** (alguém atualiza o
  valor). Meta, base opcional e **sugestões de meta** pelos dados (ritmo dos
  últimos 3 meses, +20%, receita necessária para o MRR).
- Cada resultado mostra atual × meta, a barra com a marca do esperado para
  hoje, a situação (no ritmo, atenção, atrasada, atingida, não atingida) e,
  no financeiro, a previsão para o fim do período.
- Sem objetivos, a tela oferece começar pela meta de MRR da planilha.

### Relatórios (`/relatorios`) e relatório (`/relatorio`)

- Escolha o período (mês, trimestre ou ano), a comparação, o recorte (toda
  a Boop ou um cliente) e as seções: indicadores, DRE, projeção, contratos,
  lançamentos, comercial, operação e metas.
- **Ver relatório** abre `/relatorio` numa página limpa (A4 deitado na
  impressão, sem quebrar blocos), para apresentar ou salvar em PDF.
- **Baixar Excel** gera o `.xlsx` (`/api/relatorios/excel`) com uma aba por
  seção, fórmulas (margens, resultado, totais, imposto pela premissa
  editável) e uma aba "Sobre" explicando os números.

### Busca geral (Ctrl/⌘ + K)

- Abre em qualquer tela, pelo atalho ou pelo botão **Buscar…** do topo (no
  celular, a lupa). No editor de processos, Ctrl/⌘ + K continua criando link.
- Sem texto: **Ações** (nova tarefa, projeto, reunião, documento, cliente,
  registrar comunicação, registrar decisão, novo lançamento, novo negócio,
  novo objetivo), as **visões salvas** e **Ir para** (as telas).
- A partir de 2 letras, sem acento: **Tarefas** (título e descrição; abertas
  primeiro), **Projetos**, **Reuniões** (título, cliente, assuntos,
  combinados, resumo e transcrição; das próximas, uma por série),
  **Decisões**, **Comunicações**, **Processos** (título, "para que serve" e,
  a partir de 3 letras, o texto), **Clientes** (nome), **Negócios** (título,
  empresa e contato; abre o negócio em `/comercial?negocio=<id>`) e
  **Financeiro** (descrição). Até seis resultados por grupo.
- ↑ ↓ navegam, Enter abre, Esc fecha.
- Links usados pela busca: `/tarefas?tarefa=<id>` abre o Sheet da tarefa;
  as telas com `?novo=<marca>` abrem o diálogo de criar; `/decisoes?q=` e
  `/comunicacoes?cliente=&q=` já abrem filtradas. O parâmetro de criar sai do
  endereço depois de usado.

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
| `TaskTable` / `TaskBoard` | modos Tabela (ordenável) e Quadro (arrastar muda o status) de Tarefas |
| `SavedViewsBar`      | visões salvas da tela Tarefas (salvar, atualizar, renomear, excluir) |
| `ProjectsView` / `ProjectView` / `ProjectDialog` | lista, página e criação de projetos (modelos, repetir, checklist) |
| `ActivityFeed`       | histórico em frases ("mudou o prazo de 10/10 para 12/10") + comentários |
| `DecisionsView` / `DecisionsCard` / `DecisionDialog` | decisões: tela, cartão (reunião, cliente, projeto) e registro |
| `CommunicationsView` / `CommunicationsCard` / `CommunicationDialog` | comunicações: tela, cartão (cliente, projeto), registro e "Virar tarefa" |
| `FinanceView` / `FinanceRows` / `FinanceDialog` | financeiro do mês, linhas com recebido/pago otimista, lançamento e recorrência |
| `ClientFinanceCard` / `ProjectFinanceCard` / `FinanceAlertCard` | financeiro na página do cliente, do projeto e na tela Hoje |
| `FinanceShell`       | cabeçalho e abas do Financeiro; o diálogo de lançamento compartilhado (`useFinanceDialog`) |
| `DreView` / `ProjectionView` / `ContractsView` / `LedgerView` / `ClosingView` / `SettingsView` | as abas do Financeiro |
| `DealsView` / `DealDialog` / `WinDialog` / `ClientDealsCard` | comercial: quadro e lista, negócio, ganhar (cliente, contrato e projeto) e o cartão no cliente |
| `MetricsView`        | Indicadores: período, comparação, áreas, KPIs, gráficos e o detalhe de cada número |
| `GoalsView` / `ObjectiveDialog` / `KeyResultDialog` | metas (OKRs) com progresso automático e sugestões de meta |
| `ReportBuilder` / `ReportView` | montar o relatório (período, recorte, seções) e a página para apresentar |
| `ManagementCard`     | quadro "Gestão" da tela Hoje                                   |
| `KpiTile`            | indicador: valor, variação colorida pelo sentido bom, tendência e alerta |
| `ColumnChart` / `LineChart` / `Sparkline` / `BarList` | gráficos em HTML/SVG, com tooltip, teclado (setas), legenda e clique para o detalhe |
| `PanelCard`          | cartão das páginas de detalhe (título, ação, conteúdo)          |

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
- **Progresso do projeto:** entre as tarefas do projeto, quantas estão
  concluídas (a equipe toda). **Próxima entrega:** o prazo mais próximo, de
  hoje em diante, entre as tarefas abertas; as vencidas contam como
  atrasadas. **Em foco:** projetos fixados e abertos (planejado, em
  andamento ou pausado); em andamento primeiro e, dentro do status, o prazo
  mais próximo.
- **Financeiro:** um item é do mês do vencimento. Recebido/pago = tem data de
  pagamento; **em atraso** = vencido antes de hoje, sem pagamento e não
  pulado (recorrências: até 12 meses para trás). Previsto do mês = tudo o
  que vence nele, menos os pulados. Resultado = recebido − pago. Fee mensal
  do cliente = soma das receitas recorrentes ativas no mês. Recorrência com
  dia 31 vence no último dia dos meses mais curtos.
- **Pedido em aberto:** comunicação do tipo Pedido sem tarefa ligada.
- **Histórico:** mudanças da mesma pessoa no mesmo item se juntam (2 minutos
  depois de criar; 10 minutos entre edições).
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

Gestão (dinheiro em centavos; o sinal vem da linha):

- **Receita bruta (faturamento):** receitas de cliente + outras receitas, no
  regime de caixa (data de recebimento; no mês atual e nos futuros, também o
  que vence). Aporte de sócio não é receita.
- **DRE:** receita bruta − imposto (alíquota × receita) − taxas do gateway −
  custos diretos = **margem de contribuição**; − custos fixos − outras
  despesas = **resultado**. Margem líquida = resultado ÷ receita.
- **Situação do mês no DRE:** fechado (conferido com o extrato), realizado
  (mês passado), parcial (mês atual) ou previsto (futuro).
- **MRR:** soma das receitas recorrentes de clientes que valem no mês.
  **Clientes com contrato:** os que têm alguma. **Ticket médio:** MRR ÷
  clientes. **MRR novo/perdido:** contratos que começaram ou terminaram.
- **Margem por cliente:** MRR − imposto − taxa média − custos diretos
  recorrentes do cliente.
- **Saldo em conta:** saldo inicial + entradas − saídas − taxas pagas, até o
  dia. **Caixa mínimo:** meses de custo fixo × custos fixos do mês.
- **Divisão do resultado:** resultado negativo → sai do caixa; caixa abaixo
  do mínimo → tudo para o caixa; senão caixa %, reinvestimento % e o resto
  para o pró-labore, dividido pelos sócios.
- **Receita necessária:** (sócios × alvo de pró-labore ÷ % do pró-labore +
  custos fixos) ÷ (1 − imposto − taxa média − custo direto % da carteira).
- **A receber em atraso:** receitas vencidas e não recebidas (por idade:
  até 30, 31–60, 61–90, mais de 90 dias). **Inadimplência:** do que venceu
  no período, quanto segue sem pagamento.
- **Projeção:** 12 meses pelos contratos (até o fim de cada um), custos
  fixos e lançamentos agendados, com a mesma divisão do resultado.
- **Valor do contrato (negócio):** pontual + mensal × meses (sem prazo, 12).
  **Ponderado:** valor × chance de fechar (padrão por etapa: lead 10%,
  contato 20%, proposta 40%, negociação 60%).
- **Funil do período:** negócios que chegaram no período, contados pela
  etapa mais longe que alcançaram. **Taxa de ganho:** ganhos ÷ (ganhos +
  perdidos) fechados no período. **Conversão de leads:** dos que chegaram no
  período, quantos já foram ganhos. **Ciclo de venda:** dias da chegada ao
  ganho.
- **Período dos indicadores:** mês, trimestre ou ano; o período em andamento
  soma o realizado e o que vence até o fim dele. Comparação com o período
  anterior ou com o mesmo período do ano passado.
- **Progresso de um resultado-chave:** (atual − base) ÷ (meta − base). A base
  padrão é zero para somas no período e o valor no começo do período para
  saldos e proporções. O **esperado** é a fração do período que passou; a
  situação é "no ritmo" até 10 pontos abaixo dele, "atenção" até 30 e
  "atrasada" além disso. O progresso do objetivo é a média dos resultados
  (cada um limitado a 100%).

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
14. **Um registro, vários lugares.** Decisões, comunicações e financeiro têm
    uma tela própria e um cartão (`DecisionsCard`, `CommunicationsCard`,
    `ClientFinanceCard`/`ProjectFinanceCard`) reaproveitado nas páginas de
    reunião, cliente e projeto, com os vínculos já preenchidos. O mesmo
    registro aparece onde importa, sem telas paralelas.
15. **Financeiro calculado em funções puras.** Com o volume da Boop, a tela
    busca lançamentos e recorrências e calcula meses, atrasados e totais em
    `features/finance/logic.ts`; o banco guarda só o que alguém registrou.
    Marcar como recebido/pago é otimista (`useOptimistic`).
16. **Quadro com arrastar e soltar nativo** (HTML, sem biblioteca). Soltar em
    Feito conclui a tarefa pelo mesmo caminho do checkbox (com "Desfazer").
    Onde arrastar não funciona (alguns celulares), o status muda pelo Sheet.
17. **Todo número leva à origem.** Cada indicador tem as linhas que o formam
    e um link para a tela de dados com os filtros certos (`/financeiro/
    lancamentos?mes=…&conta=…`, `/comercial?negocio=…`, `/tarefas?…`). Nas
    tabelas e gráficos do financeiro, clicar num valor abre os lançamentos.
18. **Gráficos acessíveis e sóbrios.** Paleta validada para contraste
    (azul principal, azul claro para o previsto, laranja para a segunda
    série), um eixo só, colunas finas, linha tracejada só para referência
    (caixa mínimo), legenda quando há duas séries, tooltip, navegação pelas
    setas e tabela equivalente onde o valor exato importa. Eixos em "R$ X
    mil" formatados à mão para o servidor e o navegador mostrarem o mesmo
    texto.
19. **Relatório = os mesmos componentes, numa página limpa.** `/relatorio`
    fica fora do layout com sidebar, usa o mesmo catálogo e os mesmos
    gráficos (versões prontas, sem funções vindas do servidor) e tem CSS de
    impressão (A4 deitado, sem quebrar blocos no meio).

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

### Etapa 4 — operação real ✅

1. **Projetos** no lugar do plano: de cliente ou internos, com status,
   responsável, prazo, foco, progresso pelas tarefas e página própria.
   **Modelos** (site, identidade, social media, tráfego pago, plano interno),
   repetir outro projeto ou usar o checklist de um processo.
2. **Tarefas** em Lista, Tabela e Quadro, filtro por projeto e **visões
   salvas** da equipe (também no menu lateral).
3. **Histórico** (quem mudou o quê, gravado pelo banco) e **comentários** nas
   tarefas e nos projetos.
4. **Decisões** como registro próprio (em vigor ou revogadas), nas reuniões,
   clientes e projetos.
5. **Comunicações** com clientes (pedidos, aprovações, retornos) que viram
   tarefas.
6. **Financeiro básico**: receitas e despesas, fees e assinaturas mensais,
   atrasados, resultado do mês e histórico; resumo no cliente, no projeto e
   na tela Hoje.
7. Busca geral e menu lateral com tudo isso.

### Etapa 5 — gestão ✅

1. **Financeiro gerencial** com a lógica da planilha "Financeiro - Boop":
   categorias gerenciais, taxa do gateway, DRE mês a mês, projeção de 12
   meses, divisão do resultado, receita necessária, contratos e margem por
   cliente, extrato filtrável, fechamento do mês e parâmetros.
2. **Comercial**: funil (lead → ganho/perdido), quadro e lista, origem,
   valor mensal e pontual, chance, motivo de perda; ganhar cria cliente,
   contrato e projeto.
3. **Indicadores**: financeiro, comercial e operacional por mês, trimestre
   ou ano, com comparação, tendência, gráficos e detalhamento até a origem.
4. **Metas (OKRs)** com resultados-chave ligados aos indicadores e progresso
   automático.
5. **Relatórios**: Excel com fórmulas e relatório para apresentar,
   escolhendo período, recorte e seções.
6. Integrações: quadro "Gestão" na tela Hoje, financeiro e negócios na
   página do cliente, busca e ações rápidas para negócios e metas.

### Próximos passos

1. Cada pessoa troca a senha temporária.
2. Confirmar com o contador a alíquota (6% é premissa da planilha) e marcar
   "Confirmada" em Parâmetros.
3. Se quiserem o histórico da planilha no sistema: importar os lançamentos
   de setembro e outubro (contratos, custos e recebimentos) em vez de
   recriá-los à mão.
4. Limpeza: uma migration nova que apaga `plans`, `tasks.plan_id` (já
   copiados para `projects` e `tasks.project_id`) e `weekly_decisions` (vazia
   e sem uso), seguida da regeneração dos tipos. O Supabase pede confirmação
   para apagar tabela e coluna, e a ferramenta usada no desenvolvimento não
   consegue confirmar; por isso continuam no banco, sem uso pelo app.

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

## 13. Fora do escopo (por enquanto)

Chat, portal do cliente, emissão de nota fiscal, conciliação bancária
automática (o fechamento confere o saldo com o extrato à mão), aprovações
formais, IA, notificações, automações, integrações (WhatsApp, e-mail, banco,
gateway de pagamento), permissões por cargo, várias moedas e importação de
planilhas pela interface.
