# Boop Admin

Cockpit interno da Boop, planejado para `admin.deumboop.com.br`. Serve para
ver em poucos segundos o que está atrasado, o que precisa acontecer hoje e na
semana, quem é responsável por cada coisa e quanto do plano atual já foi
concluído.

> **Etapa 1: protótipo visual.** As telas funcionam com dados em memória e
> login simulado. O Supabase entra na etapa 2, depois da aprovação visual.
> Arquitetura, schema proposto e plano completo:
> [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Rodar localmente

Requer Node.js 20.9 ou mais novo (recomendado: 22).

```bash
npm install
npm run dev
```

Abra <http://localhost:3000> e entre com um destes e-mails e **qualquer senha**:

- `jabez@deumboop.com.br`
- `renatha@deumboop.com.br`
- `leo@deumboop.com.br`

A saudação, o filtro "Minhas" e o menu do usuário mudam conforme a pessoa.

### Scripts

| Comando             | O que faz                                   |
| ------------------- | ------------------------------------------- |
| `npm run dev`       | servidor de desenvolvimento (Turbopack)     |
| `npm run build`     | build de produção                           |
| `npm run start`     | serve o build de produção                   |
| `npm run lint`      | ESLint                                      |
| `npm run typecheck` | gera os tipos de rota e roda o TypeScript   |

## O que já dá para avaliar

- **Hoje** (`/`): saudação, quatro indicadores, progresso da semana e do plano
  "Estruturação da Boop", seções Atrasadas / Hoje / Esta semana e próximos
  compromissos. A alternância Todas / Minhas fica salva no navegador.
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

## Sobre os dados do protótipo

- O plano real (25 tarefas, de 25/09 a 31/10) já está cadastrado com as datas
  e os responsáveis definidos.
- Alguns itens de exemplo (marcados como `DEMO` em
  `src/server/mock/seed.ts`) existem só para mostrar tarefas atrasadas,
  concluídas e decisões. As datas deles são relativas ao dia de hoje. Eles não
  vão para o banco real.
- Tudo fica em memória no servidor: reiniciar o `npm run dev` volta ao estado
  inicial. Em deploy serverless (Vercel), cada instância teria a própria
  cópia, então o protótipo serve para avaliação local.

## Estrutura

```
src/
├── app/              rotas (App Router): (app)/ = área logada, login/
├── components/
│   ├── ui/           shadcn/ui (código gerado)
│   └── layout/       sidebar, cabeçalho, menu do usuário
├── features/         auth, workspace, tasks, today, calendar, weekly
│                     (cada uma com queries, actions, lógica e componentes)
├── lib/              datas (fuso de São Paulo), rótulos, tipos, utilitários
├── server/mock/      "banco" em memória da etapa 1
└── proxy.ts          proteção de rotas (no Next 16, substitui o middleware)
```

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
- `sheet`, `dialog` e `alert-dialog`: overlay mais leve e textos de
  acessibilidade em português.

## Próximos passos

1. Aprovação visual desta etapa.
2. Supabase: migrations, RLS, seed do plano e Auth real.
3. Deploy na Vercel em `admin.deumboop.com.br`.

Detalhes em [docs/ARQUITETURA.md](docs/ARQUITETURA.md#11-plano-de-implementação).
