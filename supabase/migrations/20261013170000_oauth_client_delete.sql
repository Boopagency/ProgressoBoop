-- Boop Admin: o conector do Claude passa a excluir tarefas, projetos, eventos,
-- decisões e itens de reunião.
--
-- Issue #51 ("Conector do Claude completo"), PR 1: pelo MCP dá para fazer o
-- que se faz na tela nessas áreas. As ferramentas de excluir pedem
-- confirmação em dois passos (sem `confirmar: true` só descrevem o que seria
-- apagado). Aqui sai, só nessas tabelas, a política restritiva "conector do
-- Claude não apaga" da migration `oauth_client_limits`; o resto do RLS (o da
-- equipe, igual ao das telas) continua valendo. `task_assignees` entra porque
-- trocar os responsáveis de uma tarefa remove as linhas antigas.
--
-- As outras tabelas e o financeiro continuam bloqueados para o conector; os
-- próximos PRs da issue liberam, cada um, só o que as ferramentas deles usam.
-- Só remove políticas restritivas: o código que está na `main` continua
-- funcionando igual.

drop policy "conector do Claude não apaga" on public.tasks;
drop policy "conector do Claude não apaga" on public.task_assignees;
drop policy "conector do Claude não apaga" on public.projects;
drop policy "conector do Claude não apaga" on public.events;
drop policy "conector do Claude não apaga" on public.decisions;
drop policy "conector do Claude não apaga" on public.meeting_items;
