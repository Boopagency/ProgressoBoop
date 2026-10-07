# Boop Admin

Cockpit interno da Boop, em <https://admin.deumboop.com.br>. Serve para ver em poucos
segundos o que está atrasado, o que precisa acontecer hoje e na semana, quem é
responsável por cada coisa e como andam os projetos, e para guardar num lugar
só o que a Boop combina, decide, fala com os clientes e recebe ou paga.

Next.js 16 + TypeScript + Supabase (Auth, PostgreSQL com RLS) + Tailwind v4 +
shadcn/ui, publicado na Vercel. Arquitetura, schema, políticas de segurança e
infraestrutura: [docs/ARQUITETURA.md](docs/ARQUITETURA.md). O que cada tela
faz, regras, limitações e ideias de otimização:
[docs/FUNCIONALIDADES.md](docs/FUNCIONALIDADES.md).

## Rodar localmente

Requer Node.js 20.9 ou mais novo (recomendado: 22).

```bash
npm install
cp .env.example .env.local   # preencha com a URL e a chave publicável do Supabase
npm run dev
```

Abra <http://localhost:3000> e entre com a sua conta da equipe. Não existe
cadastro: as contas são criadas no Supabase (veja "Contas" abaixo).

### Scripts

| Comando             | O que faz                                   |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | servidor de desenvolvimento (Turbopack)     |
| `npm run build`     | build de produção                           |
| `npm run start`     | serve o build de produção                   |
| `npm run lint`      | ESLint                                      |
| `npm run typecheck` | gera os tipos de rota e roda o TypeScript   |

### Variáveis de ambiente

| Variável                               | Tipo   | Valor                                              |
| -------------------------------------- | ------ | -------------------------------------------------- |
| `NEXT_PUBLIC_SUPABASE_URL`             | CONFIG | Project URL do Supabase                            |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | CONFIG | chave publicável (`sb_publishable_…`) do Supabase |

As duas são públicas por natureza; a proteção dos dados é o RLS do banco. O
app **não usa** chave secreta nem `service_role`.

## Telas

- **Hoje** (`/hoje`, tela inicial): o painel do dia. Saudação, quatro
  indicadores, progresso dos projetos em foco ("Estruturação da Boop até
  31/10" em destaque) e da semana, seções Atrasadas / Hoje / Esta semana,
  combinados das reuniões em aberto e, na lateral, a próxima reunião (com
  "Algo para discutir?"), as revisões de clientes por fazer, o financeiro em
  atraso, os processos para revisar e os próximos compromissos. Abre em
  "Minhas"; a alternância Minhas / Todas fica salva no navegador.
- **Tarefas** (`/tarefas`): filtros por pessoa, status, projeto, cliente,
  área e prazo, em **Lista** (por prazo), **Tabela** (ordenável) ou
  **Quadro** (arrastar muda o status). Filtros e modo ficam na URL e podem
  virar **visões salvas** da equipe (também no menu lateral).
- **Projetos** (`/projetos`): projetos de clientes e internos, com status,
  responsável, prazo, foco e progresso pelas tarefas. Criar um projeto pode
  usar um **modelo** (site, identidade visual, social media, tráfego pago,
  plano interno), repetir outro projeto ou o checklist de um processo. A
  página do projeto reúne tarefas (lista ou quadro), histórico com
  comentários, decisões, comunicações e financeiro.
- **Calendário** (`/calendario`): semana e mês, com tarefas, reuniões, eventos
  internos, entregas e a reunião semanal recorrente (segunda, 07:00).
- **Reuniões** (`/reunioes`): weekly e reuniões com clientes. A próxima em
  destaque, histórico por mês e busca. Cada reunião tem assuntos, combinados
  (viram tarefa num clique), pauta automática, resumo e transcrição com
  busca. `/segunda` redireciona para cá.
- **Clientes** (`/clientes`): cadastro completo no portal e saúde de cada
  cliente (Saudável, Atenção, Em risco). Cada cliente tem uma revisão
  mensal (checklist, notas, próximos passos que viram tarefas, histórico) e
  uma página que reúne projetos, tarefas, comunicações, reuniões, financeiro,
  decisões e processos. As revisões por fazer aparecem na tela Hoje e na
  weekly.
- **Comunicações** (`/comunicacoes`): o que foi falado com cada cliente
  (pedidos, aprovações, feedbacks), por canal e data. Um pedido vira tarefa
  num clique.
- **Decisões** (`/decisoes`): o que a Boop definiu e por quê, em vigor ou
  revogadas, ligadas à reunião, ao cliente ou ao projeto.
- **Processos** (`/processos`): a documentação interna (processos,
  checklists, políticas e guias) por área e por cliente, com busca no texto,
  modelos e sugestões. Cada documento tem editor de blocos (estilo Notion,
  salva sozinho e avisa se outra pessoa salvou no meio), imagens privadas,
  responsável, revisão periódica, histórico de versões com restauração e
  "Gerar tarefas" a partir do checklist.
- **Financeiro** (`/financeiro`): receitas e despesas do mês, fees e
  assinaturas que se repetem, o que está em atraso, resultado do mês e
  últimos seis meses. Marcar como recebido/pago é um clique.
- **Busca geral** em qualquer tela: <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>
  ou "Buscar…" no topo. Acha tarefas, projetos, reuniões (inclusive resumos e
  transcrições), decisões, comunicações, processos (o texto inteiro),
  clientes e lançamentos, sem acento, e tem ações rápidas para criar
  qualquer coisa.
- Clicar numa tarefa abre o **Sheet lateral** de detalhes, editável ali
  mesmo, com o **histórico** (quem mudou o quê) e os comentários.
- **Nova tarefa** pelo botão ou pela tecla <kbd>N</kbd>. Título, responsável e
  prazo bastam; o resto é opcional. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> salva.
- Concluir uma tarefa atualiza contadores e progresso na hora. A tarefa fica
  riscada no lugar e o toast oferece "Desfazer".

## Banco de dados

- Schema, trigger e RLS: `supabase/migrations/`. Mudanças no banco entram
  sempre como uma migration nova. Depois, regenere os tipos em
  `src/lib/supabase/database.types.ts` (`npx supabase gen types typescript`).
- Dados iniciais reais: `supabase/seed.sql` (perfis, clientes, o projeto
  interno "Estruturação da Boop até 31/10", as 25 tarefas e a reunião
  semanal). Pode rodar de novo sem duplicar.
- Migrations aplicadas: `initial_schema` (base), `meetings` (reuniões),
  `docs`, `docs_content_stamp` e `docs_restore_version` (processos),
  `clients_reviews` (clientes e revisões mensais), `projects` (projetos e
  visões salvas; o plano virou projeto), `decisions_communications_finance`,
  `activity` (histórico e comentários) e `finance_occurrence_activity`.
- Pendente: uma migration de limpeza que apaga `plans`, `tasks.plan_id` e
  `weekly_decisions`, que não são mais usados pelo app (veja
  [ARQUITETURA.md](docs/ARQUITETURA.md#próximos-passos)).
- Imagens dos processos: bucket privado `docs` do Storage (criado pela
  migration `docs`), servidas pelo app em `/api/arquivos/…` só para quem está
  logado.

### Contas

- Só a equipe entra: Jabez, Renatha e Léo (`@deumboop.com.br`).
- Não há cadastro público. Para adicionar alguém: Supabase → Authentication →
  Users → Add user (marque "Auto Confirm User") e depois crie o perfil:

  ```sql
  insert into public.profiles (id, full_name, role)
  select id, 'Nome', 'Papel' from auth.users where email = 'nome@deumboop.com.br';
  ```

  Sem perfil, a conta não vê nenhum dado.

## Estrutura

```
src/
├── app/              rotas (App Router): (app)/ = área logada, login/
├── components/
│   ├── ui/           shadcn/ui (código gerado)
│   └── layout/       sidebar, cabeçalho, menu do usuário, marca
├── features/         auth, workspace, tasks, views, projects, today, calendar, meetings,
│                     docs, clients, communications, decisions, finance, activity,
│                     search (cada uma com queries, actions, lógica e componentes)
├── hooks/            use-mobile, use-url-trigger
├── lib/              datas (fuso de São Paulo), rótulos, tipos, utilitários
│   └── supabase/     clientes do Supabase e tipos do banco
└── proxy.ts          sessão e proteção de rotas (no Next 16, substitui o middleware)
supabase/             migrations e seed
public/brand/         logo oficial da Boop (SVG)
```

## Deploy

Projeto `boop-admin` na Vercel, ligado a este repositório. Cada push na `main`
publica em <https://admin.deumboop.com.br> (e em <https://boop-admin.vercel.app>);
as outras branches geram só prévias. As funções rodam
em São Paulo (`gru1`, em `vercel.json`), perto do banco (`sa-east-1`).

Duas vezes por dia (08:00 e 20:00 em Brasília) um cron da Vercel abre
`/api/keepalive`, que faz consultas leves ao banco. É o que impede o Supabase
gratuito de pausar o projeto por falta de uso.

## shadcn/ui

Os componentes ficam em `src/components/ui`. Para adicionar outros:

```bash
npx shadcn@latest add <componente>
```

Ajustes locais em relação ao código original do shadcn:

- `sonner`: sem `next-themes` (a v1 só tem tema claro).
- `use-mobile`: `useSyncExternalStore` no lugar de `setState` dentro de efeito.
- `sidebar`: esqueleto com largura fixa em vez de `Math.random`.
- `card`: espaçamento de 20px e sem sombra.
- `progress`: trilho neutro e barra na cor da marca.
- `sheet`, `dialog` e `alert-dialog`: overlay mais leve e textos de
  acessibilidade em português.
