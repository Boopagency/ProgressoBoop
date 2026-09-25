# Boop Admin

Cockpit interno da Boop, em <https://admin.deumboop.com.br>. Serve para ver em poucos
segundos o que está atrasado, o que precisa acontecer hoje e na semana, quem é
responsável por cada coisa e quanto do plano atual já foi concluído.

Next.js 16 + TypeScript + Supabase (Auth, PostgreSQL com RLS) + Tailwind v4 +
shadcn/ui, publicado na Vercel. Arquitetura, schema, políticas de segurança e
infraestrutura: [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

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

- **Hoje** (`/hoje`, tela inicial): saudação, quatro indicadores, progresso do
  plano "Estruturação da Boop até 31/10" em destaque e da semana, seções
  Atrasadas / Hoje / Esta semana e próximos compromissos. Abre em "Minhas";
  a alternância Minhas / Todas fica salva no navegador.
- **Tarefas** (`/tarefas`): filtros por pessoa, status, área, cliente e prazo,
  com a lista agrupada por prazo. Os filtros ficam na URL.
- **Calendário** (`/calendario`): semana e mês, com tarefas, reuniões, eventos
  internos, entregas e a reunião semanal recorrente (segunda, 07:00).
- **Segunda** (`/segunda`): pauta da reunião semanal, uma coluna por pessoa e
  as decisões da semana.
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
├── features/         auth, workspace, tasks, today, calendar, weekly
│                     (cada uma com queries, actions, lógica e componentes)
├── lib/              datas (fuso de São Paulo), rótulos, tipos, utilitários
│   └── supabase/     clientes do Supabase e tipos do banco
└── proxy.ts          sessão e proteção de rotas (no Next 16, substitui o middleware)
supabase/             migrations e seed
public/brand/         logo oficial da Boop (SVG)
```

## Deploy

Projeto `boop-admin` na Vercel, ligado a este repositório. Cada push na branch
de produção (hoje `claude/nifty-cray-02c7u5`; a troca para `main` é feita em
Settings → Git na Vercel) publica em
<https://boop-admin.vercel.app> e em `admin.deumboop.com.br`. As funções rodam
em São Paulo (`gru1`, em `vercel.json`), perto do banco (`sa-east-1`).

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
