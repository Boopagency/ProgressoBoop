-- Boop Admin: o conector do Claude passa a apagar as próprias mensagens.
--
-- Issue #51 ("Conector do Claude completo"), PR 2: "apagar a própria
-- mensagem" pelo MCP, com confirmação em dois passos. Sai, só em `messages`,
-- a política restritiva "conector do Claude não apaga" da migration
-- `oauth_client_limits`; continua valendo "cada um apaga as próprias
-- mensagens", a mesma política da tela.
--
-- Clientes, posts, ideias, comunicações, processos, avisos e arquivos do
-- Storage continuam sem exclusão pelo conector.

drop policy "conector do Claude não apaga" on public.messages;
