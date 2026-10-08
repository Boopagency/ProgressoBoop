<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Boop Admin — convenções do projeto

- Contexto, schema, RLS e infraestrutura: `docs/ARQUITETURA.md`. Como rodar: `README.md`.
- Coordenação dos agentes (roteiro de revisão, andamento, pendências): `docs/COORDENACAO.md`.
- Interface em português (pt-BR); código, tabelas e valores de enum em inglês
  (rótulos em `src/lib/labels.ts`).
- Datas sempre por `src/lib/dates.ts`: fuso America/Sao_Paulo, semana de segunda
  a domingo, datas sem horário como `DateKey` (`yyyy-MM-dd`).
- Regras de negócio puras em `src/features/*/logic.ts`. Server Actions validam a
  entrada, verificam a sessão (`requireUser`) e revalidam as telas.
- Banco: Supabase. Mudanças de schema só por migration nova em
  `supabase/migrations` (nunca editar uma já aplicada); depois, regenerar
  `src/lib/supabase/database.types.ts`. Acesso ao banco só no servidor
  (`queries.ts`, `actions.ts`, `features/auth`), com a sessão da pessoa e RLS.
  Nunca usar service role nem chave secreta no app.
- Cor da marca só em detalhes (progresso, item ativo, foco, hoje, indicadores):
  `brand` (#00C2FF) como preenchimento, `brand-ink` (#0079A8) quando for texto.
- Antes de concluir uma mudança: `npm run lint`, `npm run typecheck` e `npm run build`.

## Trabalho com vários agentes

Várias contas do Claude trabalham neste repositório ao mesmo tempo. Para não
pisar no trabalho do outro:

- **Uma branch por tarefa**, curta, saindo da `main` atualizada. Nada vai
  direto para a `main`: tudo entra por PR, com o CI (lint, typecheck e build)
  verde. Antes de abrir ou atualizar o PR, traga a `main` para a branch e rode
  as três verificações de novo.
- **PR pequeno e de uma área só** (ex.: financeiro, comercial, tarefas). Preencha
  o template do PR. Um agente pode revisar o PR de outro (`/code-review`).
- **Arquivos compartilhados** — mude o mínimo e espere conflito:
  `src/lib/types.ts`, `src/lib/labels.ts`, `src/components/layout/nav-items.ts`,
  `src/app/globals.css`, `docs/ARQUITETURA.md`, `docs/FUNCIONALIDADES.md`
  (nos docs, edite só a seção da sua área).
- **Banco (o mais importante): prévias e produção usam o mesmo Supabase.**
  - Escreva a migration nova em `supabase/migrations/`, mas **não aplique** no
    Supabase pela branch. Ela é aplicada só depois do merge do PR, por quem
    fez o merge, uma de cada vez e na ordem do nome do arquivo.
  - Mudanças no banco devem continuar funcionando com o código que já está na
    `main` (adicionar coluna/tabela, nunca renomear ou apagar no mesmo PR).
  - `src/lib/supabase/database.types.ts` é gerado: em conflito, não resolva à
    mão; regenere depois de aplicar a migration.
  - Ao aplicar, o Supabase registra a migration com a hora da aplicação. Quem
    aplicou renomeia o arquivo para essa versão e sobe, no mesmo PR curto, os
    tipos regenerados (assim o repositório e o banco contam a mesma história).
  - Testes que gravam dados reais usam nomes marcados (ex.: `E2E <agente>
    <carimbo>`) e apagam tudo no fim, inclusive as linhas de `activity` dos
    itens criados.
- **Segredos**: nenhuma senha, token ou chave no código, em commits, PRs ou
  issues. Acessos temporários (ex.: bypass de proteção da Vercel) são
  revogados ao terminar.
- **Coordenação**: antes de começar, confira os PRs e branches abertos para não
  pegar a mesma área de outro agente.
