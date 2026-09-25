<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

## Boop Admin — convenções do projeto

- Contexto, schema, RLS e infraestrutura: `docs/ARQUITETURA.md`. Como rodar: `README.md`.
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
