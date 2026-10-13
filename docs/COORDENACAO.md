# Coordenação dos agentes

Memória da sessão que coordena o trabalho com várias contas do Claude. Quem
assumir a coordenação lê este arquivo, o `AGENTS.md` e o `docs/ARQUITETURA.md`.
Nada de senha, token ou chave aqui.

## Papel da coordenação

A pessoa (Jabez) passa o escopo; a coordenação planeja, abre as issues, escreve
o prompt de cada agente, revisa os PRs, testa com login na prévia, faz o merge,
aplica as migrations e valida em produção. Pode agir sem pedir confirmação,
respeitando as restrições abaixo.

## Restrições que continuam valendo

- O site institucional (deumboop.com.br, www) é outro projeto: não mexer no
  repositório, no projeto Vercel nem nos registros de DNS dele.
- Sem service role nem chave secreta no app. Não publicar com erro.
- Sem cadastro público: só usuários criados pela equipe.
- Prévias e produção usam o mesmo Supabase (dados reais).

## Infraestrutura

- Repositório `Boopagency/ProgressoBoop`; `main` protegida (PR + check
  "Lint, typecheck e build" + branch atualizada).
- Vercel: projeto `boop-admin` (`prj_3ftrKFIq2aCQPEEZvAx8LwKo2zqV`, time
  boop10), produção https://admin.deumboop.com.br, prévia por branch
  `boop-admin-git-<branch>-boop10.vercel.app`.
- Supabase: projeto `zqugfixszhfoochvaaol`.
- Clientes reais usados nos testes: Hertmann
  `af1fe7cf-6508-4b4e-8b7a-23b76008ac62`, Velmont
  `37f2d6ad-e11f-44c3-9958-21a6a35d9cb0`. O único com vários projetos é a
  Bárbara Fonseca (`9715ca1a-d051-49f1-a61e-552e2e76e67f`, 3 projetos).

## Roteiro de cada PR de agente

1. Ler o diff: ações com `requireUser` e validação, RLS, nada de chave no
   cliente, arquivos compartilhados mudados no mínimo.
2. CI verde e sem conflito.
3. Teste com login na prévia (Playwright no sandbox Vercel `boop-e2e`; o
   container da sessão não alcança `*.vercel.app`). Gerar um bypass de
   proteção da Vercel só para o teste e **revogar** no fim; parar o sandbox.
4. Dados de teste com nome `E2E …`; apagar tudo no fim, inclusive `activity`
   (pelo SQL do Supabase, `with x as (delete … returning 1) select count(*) from x`).
5. Merge (squash). Se houver migration: aplicar no Supabase depois do merge,
   renomear o arquivo para a versão registrada e subir os tipos regenerados
   (`database.types.ts`) num PR curto.
6. Comentar no PR o resultado e, na próxima issue, as notas para o agente.

Detalhes que já enganaram o teste: o histórico junta as mudanças feitas pela
mesma pessoa até 2 min depois de criar o item (`private.log_activity`); o aviso
"Post excluído" repete o título do post; sem sessão, as rotas `/api/arquivos` e
`/api/conteudo` levam ao `/login` (307), não a 401; o item do menu do cliente é
"Excluir…"; o `id` do `PanelCard` fica no `h2`, não na `section`.

Para testes que mexem no perfil ou nas imagens de um cliente, crie um cliente
`E2E …` pelo SQL e exclua-o pela tela no fim: o app apaga os posts e os
arquivos do Storage dele (não apague arquivos por SQL em `storage.objects`).
Os scripts dos testes ficam no sandbox `boop-e2e` (`/vercel/p8`, `/vercel/p12`;
login, senha e bypass vão por variável de ambiente, nunca no arquivo).

## O que já está na `main` (até o #36, 09/10/2026)

**Central de Conteúdo** (issues #2 a #5):

- [x] 1/4 — banco do conteúdo (#6, migration `20261008122847_content.sql`, tipos em #7)
- [x] 2/4 — tela `/conteudo` com todos os clientes, quadro, 7 dias, post, tarefas das frentes, Hoje, Calendário e cliente (#8)
- [x] 3/4 — feed do Instagram por cliente e imagens (capa, slides, foto do cliente) no bucket `content` (#12, sem migration)
- [x] 4/4 — banco de ideias por cliente, modelos de documento do cliente em Processos e busca de posts e ideias (#14, sem migration)

**Portal do cliente** (a "fase 2"):

- [x] Base de acesso do cliente: `client_members` e `private.my_client_ids()` (#16, tipos em #17)
- [x] Área `/portal`, login do cliente e cartão "Acesso do cliente" (#19)
- [x] Conteúdo e aprovação do cliente no banco (#22, tipos em #23) e as telas: início, calendário, feed e post com aprovação e chat (#24)
- [x] Projetos no portal: etapas que o cliente vê e conversa do projeto (#25, tipos em #27); aba Projetos, página do projeto e a opção "o cliente vê" nas tarefas (#29)

**Equipe e integrações:**

- [x] Comunicações em canais: banco (#18, tipos em #20) e telas (#21); conversa do projeto com o cliente e etiqueta do projeto no canal (#32)
- [x] Notificações: banco (#26, tipos em #33), sino no topo com lista, som e aviso do navegador (#28), avisos na hora pelo Realtime (#35, #36)
- [x] Conector do Claude: servidor MCP com o OAuth do Supabase (#30); o conector não apaga nada e não vê o financeiro (#31, versão em #34)

Correção fora do plano: rolagem lateral do Hoje no celular (#9).

Todas as migrations do repositório estão aplicadas no Supabase (a última é
`20261009193411_notifications_realtime`).

## Próximos passos

1. Corrigir o "Link do Drive" do post (`post-dialog.tsx`): é `type="url"` e
   mostra a mensagem do navegador em vez da do app (sobra da 4/4).
2. Migration de limpeza de `plans`, `tasks.plan_id` e `weekly_decisions`
   (autorizada pela pessoa em 13/10), seguida dos tipos regenerados. A
   proteção de senhas, a troca de senhas e o imposto ficam para depois dela.
3. **Verificar a segurança das funções do portal — pendente; a pessoa pediu
   para não fazer ainda.** O advisor do Supabase aponta 12 funções
   `SECURITY DEFINER` que qualquer usuário logado pode chamar
   (`link_client_member`, `open_direct_channel`, `portal_client_profile`,
   `portal_my_clients`, `portal_post_messages`, `portal_posts`,
   `portal_project_messages`, `portal_project_steps`, `portal_projects`,
   `portal_review_post`, `portal_send_message`, `portal_send_project_message`).
   É esperado no desenho, mas cada uma precisa conferir quem chama (equipe ou
   membro daquele cliente); o que estiver aberto demais se corrige com
   migration nova.
4. Limpar as contas de teste que ficaram no Auth:
   `e2e.claude.{a,b,c}.09101349@example.com` (de um teste de 09/10, sem
   cliente) e `portal.teste@deumboop.com.br` (portal da Bárbara Fonseca, criada
   em 13/10 para a pessoa conferir o portal com vários projetos; apagar quando
   ela terminar, junto com a linha em `client_members`).
5. Próximo escopo: a pessoa define.

## Acesso da sessão de coordenação

A coordenação precisa dos conectores do **Supabase** (SQL, migrations,
tipos, Storage) e da **Vercel** (prévia, bypass, sandbox `boop-e2e`) para os
passos 3 a 5 do roteiro. Antes de revisar um PR, confira se a sessão os tem;
sem eles, dá para ler o diff, conferir o CI e comentar, mas não testar na
prévia, aplicar migration nem validar em produção — nesse caso, não fazer o
merge de PR que muda o app (PR só de docs pode entrar com o CI verde) e
pedir à pessoa uma sessão com os conectores.

## Pendências com a pessoa

- Confirmar a taxa de imposto de 6%.
- Importar a planilha financeira antiga (opcional).
- Lançar o custo de Claude/IA (R$ 500).
- Ligar a proteção de senhas vazadas no Supabase (único aviso do advisor).
- Trocar as senhas provisórias da equipe.
- Autorizar o conector Hostinger nas configurações do claude.ai, se for usar.
