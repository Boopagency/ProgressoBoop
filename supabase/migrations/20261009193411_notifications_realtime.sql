-- Boop Admin: avisos na hora para o sino (Realtime).
--
-- O sino deixa de depender só da consulta a cada 15 segundos: o navegador
-- escuta as linhas novas (e as lidas) de `notifications` pelo Realtime do
-- Supabase e, ao receber o sinal, busca a lista pelo servidor, como antes.
-- O Realtime aplica o RLS de quem escuta: cada pessoa da equipe recebe só os
-- próprios avisos, e a conta do cliente não recebe nenhum. Só acrescenta a
-- tabela à publicação; nada muda nas políticas nem nos dados.

alter publication supabase_realtime add table public.notifications;
