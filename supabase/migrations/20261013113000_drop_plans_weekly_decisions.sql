-- Limpeza: tabelas e coluna que o app não usa mais (autorizada pela equipe
-- em 13/10/2026).
--   * `plans` (1 linha) virou projeto: "Estruturação da Boop até 31/10", com
--     o mesmo id, e as 25 tarefas dele já têm `project_id`.
--   * `tasks.plan_id` foi copiada para `tasks.project_id`.
--   * `weekly_decisions` está vazia e sem uso desde as Reuniões.
-- O código na `main` não lê nem grava nenhuma delas.

alter table public.tasks drop column plan_id;

drop table public.plans;

drop table public.weekly_decisions;
