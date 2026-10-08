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
  `37f2d6ad-e11f-44c3-9958-21a6a35d9cb0`.

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

## Central de Conteúdo (em andamento)

Plano em 4 PRs (issues #2 a #5), um agente por vez, depois a fase 2.

- [x] 1/4 — banco do conteúdo (#6, migration `20261008122847_content.sql`, tipos em #7)
- [x] 2/4 — tela `/conteudo` com todos os clientes, quadro, 7 dias, post, tarefas das frentes, Hoje, Calendário e cliente (#8)
- [x] 3/4 — feed do Instagram por cliente e imagens (capa, slides, foto do cliente) no bucket `content` (#12, sem migration)
- [ ] 4/4 — ideias, modelos em Processos e busca (issue #5; notas da coordenação nos comentários da issue, inclusive o que a 3/4 mudou). Ao trazer a `main`, o conflito esperado é a visão nova em `filters.ts`/`content-view.tsx`: manter `feed` e acrescentar `ideias`.
- [ ] Fase 2 — portal do cliente: login criado pela equipe, RLS por cliente, `/portal` para ver o feed e aprovar posts.

Correção fora do plano: rolagem lateral do Hoje no celular (#9).

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
- Confirmar a migration de limpeza de `plans`, `tasks.plan_id` e `weekly_decisions`.
- Autorizar o conector Hostinger nas configurações do claude.ai, se for usar.
