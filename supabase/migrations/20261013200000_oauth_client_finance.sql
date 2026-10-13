-- Boop Admin: o conector do Claude passa a usar o financeiro, o comercial e as
-- metas como a tela.
--
-- Issue #51 ("Conector do Claude completo"), PR 3. Saem as políticas
-- restritivas da migration `oauth_client_limits` que ainda barravam o que as
-- ferramentas novas fazem; o resto do RLS (o da equipe, igual ao das telas)
-- continua valendo:
--
-- - "conector do Claude sem financeiro": o financeiro passa a valer pelo
--   conector para quem já o vê na tela (lançamentos, recorrências,
--   parâmetros — só leitura pelas ferramentas — e fechamentos);
-- - "conector do Claude não apaga" em `deals`, `finance_entries`,
--   `finance_recurrences`, `finance_closings` (reabrir o mês apaga o
--   fechamento), `objectives` e `key_results`. As ferramentas de excluir
--   e reabrir pedem confirmação em dois passos (`confirmar: true`).
--
-- Só remove políticas restritivas: o código que está na `main` continua
-- funcionando igual.

drop policy "conector do Claude sem financeiro" on public.finance_entries;
drop policy "conector do Claude sem financeiro" on public.finance_recurrences;
drop policy "conector do Claude sem financeiro" on public.finance_settings;
drop policy "conector do Claude sem financeiro" on public.finance_closings;

drop policy "conector do Claude não apaga" on public.deals;
drop policy "conector do Claude não apaga" on public.finance_entries;
drop policy "conector do Claude não apaga" on public.finance_recurrences;
drop policy "conector do Claude não apaga" on public.finance_closings;
drop policy "conector do Claude não apaga" on public.objectives;
drop policy "conector do Claude não apaga" on public.key_results;
