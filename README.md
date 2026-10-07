# Boop Admin

Cockpit interno da Boop, em <https://admin.deumboop.com.br>. Serve para ver em poucos
segundos o que está atrasado, o que precisa acontecer hoje e na semana, quem é
responsável por cada coisa e quanto do plano atual já foi concluído.

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
  indicadores, progresso do plano "Estruturação da Boop até 31/10" em
  destaque e da semana, seções Atrasadas / Hoje / Esta semana, combinados das
  reuniões em aberto e, na lateral, a próxima reunião (com "Algo para
  discutir?"), as revisões de clientes por fazer, os processos para revisar e
  os próximos compromissos. Abre em "Minhas"; a alternância Minhas / Todas
  fica salva no navegador.
- **Tarefas** (`/tarefas`): filtros por pessoa, status, área, cliente e prazo,
  com a lista agrupada por prazo. Os filtros ficam na URL.
- **Calendário** (`/calendario`): semana e mês, com tarefas, reuniões, eventos
  internos, entregas e a reunião semanal recorrente (segunda, 07:00).
- **Reuniões** (`/reunioes`): weekly e reuniões com clientes. A próxima em
  destaque, histórico por mês e busca. Cada reunião tem assuntos, combinados
  (viram tarefa num clique), pauta automática, resumo e transcrição com
  busca. `/segunda` redireciona para cá.
- **Clientes** (`/clientes`): cadastro completo no portal e saúde de cada
  cliente (Saudável, Atenção, Em risco). Cada cliente tem uma revisão
  mensal (checklist, notas, próximos passos que viram tarefas, histórico) e
  uma página que reúne tarefas, reuniões e processos. As revisões por fazer
  aparecem na tela Hoje e na weekly.
- **Processos** (`/processos`): a documentação interna (processos,
  checklists, políticas e guias) por área e por cliente, com busca no texto,
  modelos e sugestões. Cada documento tem editor de blocos (estilo Notion,
  salva sozinho e avisa se outra pessoa salvou no meio), imagens privadas,
  responsável, revisão periódica, histórico de versões com restauração e
  "Gerar tarefas" a partir do checklist.
- **Busca geral** em qualquer tela: <kbd>Ctrl</kbd>/<kbd>⌘</kbd>+<kbd>K</kbd>
  ou "Buscar…" no topo. Acha tarefas, reuniões (inclusive resumos e
  transcrições), processos (o texto inteiro) e clientes, sem acento, e tem
  ações rápidas para criar tarefa, reunião, documento ou cliente.
- Clicar numa tarefa abre o **Sheet lateral** de detalhes, editável ali mesmo.
- **Nova tarefa** pelo botão ou pela tecla <kbd>N</kbd>. Título, responsável e
  prazo bastam; o resto é opcional. <kbd>Ctrl</kbd>+<kbd>Enter</kbd> salva.
- Concluir uma tarefa atualiza contadores e progresso na hora. A tarefa fica
  riscada no lugar e o toast oferece "Desfazer".

## Banco de dados

- Schema, trigger e RLS: `supabase/migrations/`. Mudanças no banco entram
  sempre como uma migration nova. Depois, regenere os tipos em
  `src/lib/supabase/database.types.ts` (`npx supabase gen types typescript`).
- Dados iniciais reais: `supabase/seed.sql` (perfis, clientes, o plano, as 25
  tarefas e a reunião semanal). Pode rodar de novo sem duplicar.
- Migrations aplicadas: `initial_schema` (base), `meetings` (reuniões),
  `docs`, `docs_content_stamp` e `docs_restore_version` (processos) e
  `clients_reviews` (clientes e revisões mensais).
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
├── features/         auth, workspace, tasks, today, calendar, meetings, docs, clients,
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
