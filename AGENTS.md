<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Boop Admin — convenções do projeto

- Contexto, schema proposto e plano: `docs/ARQUITETURA.md`. Como rodar: `README.md`.
- Interface em português (pt-BR); código, tabelas e valores de enum em inglês
  (rótulos em `src/lib/labels.ts`).
- Datas sempre por `src/lib/dates.ts`: fuso America/Sao_Paulo, semana de segunda
  a domingo, datas sem horário como `DateKey` (`yyyy-MM-dd`).
- Regras de negócio puras em `src/features/*/logic.ts`. Server Actions validam a
  entrada, verificam a sessão (`requireUser`) e revalidam as telas.
- Etapa atual: dados em memória (`src/server/mock`). Na troca para o Supabase,
  mude só `queries.ts`, `actions.ts` e `features/auth`.
- Antes de concluir uma mudança: `npm run lint`, `npm run typecheck` e `npm run build`.
