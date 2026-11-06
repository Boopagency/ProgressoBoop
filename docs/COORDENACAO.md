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
- Dados: o sistema foi zerado em 13/10/2026 (ficaram só as contas da equipe,
  os Processos e os parâmetros do financeiro). A cópia de antes está no
  schema `backup_20261013`, fora da API; apagar quando a pessoa mandar. Os
  clientes de teste antigos (Hertmann, Velmont, Bárbara Fonseca) não existem
  mais: os testes criam um cliente `E2E …` e o excluem no fim.

## Roteiro de cada PR de agente

1. Ler o diff: ações com `requireUser` e validação, RLS, nada de chave no
   cliente, arquivos compartilhados mudados no mínimo.
2. CI verde e sem conflito.
3. Teste com login na prévia (Playwright no sandbox Vercel `boop-e2e`; o
   container da sessão não alcança `*.vercel.app`). Gerar um bypass de
   proteção da Vercel só para o teste e **revogar** no fim; parar o sandbox.
4. Dados de teste com nome `E2E …`; apagar tudo no fim, inclusive `activity`
   (pelo SQL do Supabase, `with x as (delete … returning 1) select count(*) from x`).
5. Merge (squash). Se houver migration (aditiva), aplique-a no Supabase
   **logo antes do merge**: o código novo vai para produção em ~2 min e
   quebra se as colunas ainda não existirem. Em seguida, renomeie o arquivo
   para a versão registrada e suba os tipos regenerados (`database.types.ts`)
   num PR curto.
6. Comentar no PR o resultado e, na próxima issue, as notas para o agente.

Lições de out–nov/2026:
- **A ferramenta do Supabase pode pedir a confirmação da pessoa** ao aplicar
  migration (aconteceu com uma que tinha `delete` dentro de função; outras
  com `delete` passaram sem pedir). Se ninguém responder em ~4 min, nada é
  aplicado. Por isso: aplicar antes do merge e, havendo `delete`/`drop`, com
  a pessoa na tela.
- **Se a produção ficar sem a migration:** voltar o deploy anterior na
  Vercel (rollback), aplicar a migration e depois promover o deploy novo. O
  rollback desliga a promoção automática até esse promote; confira que o
  domínio voltou a seguir a `main` (aliases do deploy seguinte).
- **O gerador de tipos marca todo argumento de função como obrigatório e não
  nulo.** Onde a função aceita `null`, a chamada usa cast explícito com um
  comentário (#93).
- **Agentes não fazem merge**: diga isso no prompt, mesmo que alguém peça na
  conversa deles. Todos (agentes e a pessoa) usam a mesma conta do GitHub,
  `Boopagency`, então `merged_by` não diz quem foi; veja na sessão.
- **Agentes em paralelo gastam o limite de uso da conta** (5 h e semanal). Com
  4 ao mesmo tempo, um parou no limite; retome com `send_message` depois que
  renovar.
- **Agentes de front sem login:** a vitrine (`/vitrine/…`, só fora de
  produção, com dados de exemplo) e os prints com Playwright substituem o
  teste com login. Peça os prints em escuro e claro, computador e celular, e
  olhe-os antes do merge.

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

## Concluído em 13/10/2026

- Issue #39 — Portal do cliente 2.0: banco (#42, tipos em #44), menu lateral e
  painel resumido (#46), Comunicação, Notificações, aprovação de etapas e o
  lado da equipe ("Precisa da aprovação do cliente" na tarefa, a resposta do
  cliente e "Interno" ao escrever no canal do cliente) (#48).
- Issue #40 — consistência visual e transição suave: esqueleto das telas
  (#43), todas as telas do admin (#45) e o portal (#47).
- Antes disso: Link do Drive com a mensagem do app (#37); limpeza de `plans`,
  `tasks.plan_id` e `weekly_decisions` (#38, aplicada pela pessoa no SQL
  Editor); sistema zerado e contas de teste apagadas.

## Concluído de 13/10 a 06/11/2026

- Issues #50 e #51 (modo escuro, mensagens à direita, conector do Claude
  completo) e, depois, de #53 a #88: Minha conta, PWA e push no celular,
  documentos e entregas para o cliente, conversas diretas, menções, voz,
  indicações, leads do link da bio e visual premium.
- **Instagram dos clientes (issue #89):** conectar a conta (#90, tipos #91),
  publicar no horário (#92, tipos #93) e métricas (#95, renomeação #96).
  - Jobs do banco para o app: `pg_cron` → `private.run_instagram_job` →
    `/api/instagram/jobs`, com o segredo em `instagram_jobs_secret` (Vault)
    = `INSTAGRAM_JOBS_SECRET` (Vercel, Production).
  - Agendados: renovar tokens (6h17), publicar (a cada 5 min) e coletar
    métricas (de hora em hora, aos 23 min).
  - Só funciona de verdade depois do app da Meta (ver Pendências).
- **Financeiro do cliente no portal** (#94, renomeação #97): aba Financeiro,
  banner e avisos de atraso.
  - Avisos para a equipe no dia 1 e no dia 7; para o cliente no dia 3, se o
    interruptor `clients.payment_reminders` estiver ligado.
  - Job `finance-overdue-notices` às 8h07.
- **Repaginada visual:**
  - fase 1, #98: vidro fosco, brilho azul e tipografia (regra no `AGENTS.md`
    e na ARQUITETURA §10.1);
  - lotes 2B (#99), 2C (#100), 2A (#102) e portal (#101);
  - ajuste final, #106: editor dos Processos no visual novo, peças
    unificadas (`StatGrid`, `HeroPanel`, `EmptyPanel`) e varredura de cores;
  - referências em `docs/design/referencias/` e prints em
    `docs/design/prints/`.

## Em andamento (06/11/2026)

- Nada. Fora da coordenação: Comercial em quadro (#104, #105).

## Revisão de segurança (13/10/2026)

As 18 funções `SECURITY DEFINER` do `public` que o advisor aponta foram
conferidas: `link_client_member` e `open_direct_channel` exigem equipe; as
`portal_*` exigem membro daquele cliente (`private.my_client_ids()`) e cliente
ativo, e escondem mensagens internas. Todas as tabelas têm RLS de equipe; o
cliente só lê os próprios avisos e as imagens dos próprios posts. O aviso do
advisor é esperado e fica. Os links das mensagens só aceitam http(s).

## Próximos passos

1. Ligar a proteção de senhas vazadas no Supabase e trocar as senhas da
   equipe — antes de dar acesso às clientes (Danielle e Bárbara, previsto
   para 20/10).
2. Apagar as 6 imagens que sobraram no bucket `content` do Storage (pelo
   painel: por SQL o arquivo não sai de verdade).
3. Confirmação do imposto.
4. Apagar a cópia `backup_20261013` quando a pessoa mandar.

Dados de 13/10: clientes, projetos, tarefas até 31/10, financeiro conferido
com o extrato do Asaas e a weekly de 30/09 (com a análise) foram lançados pela
coordenação. A weekly passa a ser às terças (a de 14/10 é na quarta).

Testes na prévia: a ferramenta do Supabase não confirma `delete` nem `drop`
(trava esperando confirmação). Criar os dados `E2E` pelo SQL funciona; a
limpeza vai num arquivo `.sql` para a pessoa rodar no SQL Editor, apagando só
o que o teste criou (a equipe já usa os canais de verdade).

## Acesso da sessão de coordenação

A coordenação precisa dos conectores do **Supabase** (SQL, migrations,
tipos, Storage) e da **Vercel** (prévia, bypass, sandbox `boop-e2e`) para os
passos 3 a 5 do roteiro. Antes de revisar um PR, confira se a sessão os tem;
sem eles, dá para ler o diff, conferir o CI e comentar, mas não testar na
prévia, aplicar migration nem validar em produção — nesse caso, não fazer o
merge de PR que muda o app (PR só de docs pode entrar com o CI verde) e
pedir à pessoa uma sessão com os conectores.

## Pendências com a pessoa

- **Instagram:**
  - criar o app na Meta (Instagram → API com login do Instagram) e pôr
    `INSTAGRAM_APP_ID` e `INSTAGRAM_APP_SECRET` na Vercel (passo a passo na
    issue #89);
  - convidar os clientes como testadores;
  - depois, a verificação da empresa e a análise do app, que pedem a
    política de privacidade do site cobrindo a integração.
- **Decidir a arte em 3:4:** hoje a publicação recusa a imagem (a API aceita
  de 4:5 a 1,91:1); a alternativa é cortar sozinho para 4:5.
- **Cadastrar as mensalidades** dos clientes como recorrência no Financeiro
  (em 30/10 só a Hertmann tinha). Sem isso, a aba Financeiro do portal fica
  vazia e não sai aviso de atraso.
- **Abrir o portal com uma conta de cliente**, no celular, depois da
  repaginada: nenhum agente testa com sessão de cliente.
- Confirmar a taxa de imposto de 6%.
- Importar a planilha financeira antiga (opcional).
- Lançar o custo de Claude/IA (R$ 500).
- Ligar a proteção de senhas vazadas no Supabase (único aviso do advisor).
- Trocar as senhas provisórias da equipe.
- Autorizar o conector Hostinger nas configurações do claude.ai, se for usar.
