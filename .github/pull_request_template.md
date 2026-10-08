## O que muda

<!-- Uma ou duas frases: o que a pessoa vai ver ou o que ficou diferente. -->

## Área

<!-- Ex.: financeiro, comercial, tarefas, infraestrutura. -->

## Checklist

- [ ] Branch atualizada com a `main` antes de abrir o PR
- [ ] `npm run lint`, `npm run typecheck` e `npm run build` passando
- [ ] Migration nova? **Não** / **Sim**: `supabase/migrations/<arquivo>.sql`, ainda **não aplicada** no Supabase (aplicada só depois do merge)
- [ ] `src/lib/supabase/database.types.ts` regenerado (só se houve migration)
- [ ] Dados de teste criados no banco (marcados "E2E…") foram apagados, inclusive o histórico (`activity`)
- [ ] Docs atualizadas na seção da área (`docs/ARQUITETURA.md`, `docs/FUNCIONALIDADES.md`)
- [ ] Nenhuma senha, token ou chave no código, nos commits ou nesta descrição

## Como testar

<!-- Telas e passos para conferir na prévia da Vercel. -->
