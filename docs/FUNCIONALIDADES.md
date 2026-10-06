# Boop Admin — o que o portal tem hoje

Retrato da V1 em produção em <https://admin.deumboop.com.br> (setembro de
2026). Serve para entender o que existe, como cada parte funciona e o que dá
para otimizar. Os detalhes técnicos estão em [ARQUITETURA.md](ARQUITETURA.md).

Para pedir um ajuste, cite a seção. Exemplo: "2.3: abrir Tarefas em Minhas".

---

## 1. Visão geral

- **Para que serve:** mostrar em poucos segundos o que está atrasado, o que
  vence hoje e na semana, quem é responsável por cada coisa e quanto do plano
  atual já foi concluído.
- **Quem entra:** Jabez, Renatha e Léo, com e-mail e senha. Não existe
  cadastro. Uma conta nova só pode ser criada pelo Supabase (seção 4).
- **Sessão:** fica salva no navegador, então não é preciso entrar toda vez.
  "Sair" desconecta só aquele navegador.
- **Menu lateral:** Hoje, Tarefas, Calendário e Reuniões. No rodapé ficam a
  pessoa logada e o "Sair". O menu pode ser recolhido pelo ícone no topo ou
  com Ctrl/⌘+B, e a escolha fica salva. No celular ele abre pelo botão do topo.
- **Visual:** base neutra (branco, off-white, cinzas). A cor da Boop aparece
  só em detalhes: barras de progresso, item ativo do menu, dia de hoje, foco e
  pontos indicadores. O logo é o oficial (o "olhar") e os títulos usam Poppins.
  Vermelho indica atrasado, verde indica concluído e laranja indica em
  andamento ou atenção.
- **Celular:** todas as telas funcionam. As listas e o calendário se
  reorganizam para a tela menor.

## 2. Telas

### 2.1 Login (`/login`)

- Campos de e-mail e senha.
- Mensagens de erro:
  - "E-mail ou senha incorretos."
  - "Muitas tentativas. Aguarde um pouco e tente de novo."
  - "Esta conta não tem acesso ao Boop Admin." (conta sem perfil de equipe)
- Não há "Criar conta" nem "Esqueci minha senha".
- Depois de entrar, a pessoa vai para Hoje. Quem já está logado e abre
  `/login` também vai para Hoje.

### 2.2 Hoje (`/hoje`, tela inicial)

**O que mostra**

- Saudação conforme o horário ("Bom dia", "Boa tarde" ou "Boa noite",
  seguida do nome) e a data por extenso.
- A alternância **Minhas / Todas**. O padrão é Minhas, e a escolha fica salva
  no navegador por um ano.
- Quatro indicadores: Atrasadas, Para hoje, Esta semana e Concluídas na
  semana. Clicar em um deles leva à lista correspondente. Atrasadas fica
  vermelho quando o número é maior que zero.
- **Progresso do plano atual**, em destaque ("Estruturação da Boop até
  31/10"): percentual grande, barra, "X de 25 tarefas" e dias restantes. Esse
  número conta a equipe toda. No filtro Minhas aparece também "suas: X de Y".
- **Semana**, menor, abaixo do plano: tarefas com prazo nesta semana,
  concluídas sobre o total.
- Listas **Atrasadas**, **Hoje** e **Esta semana**, só com tarefas abertas.
- **Próximos compromissos:** eventos dos próximos 7 dias (até 5), com link
  para o Calendário. Tarefas não entram nessa lista.

**O que dá para fazer:** concluir uma tarefa pelo checkbox, abrir os detalhes
com um clique e criar uma tarefa pelo botão "Nova tarefa" ou pela tecla N.

**Regra importante:** os indicadores, as listas e a semana seguem o filtro
Minhas/Todas. O progresso do plano não segue.

### 2.3 Tarefas (`/tarefas`)

- **Pessoa:** Todas (padrão), Minhas, Jabez, Renatha ou Léo.
- **Filtros:**
  - Status: Abertas (padrão), A fazer, Fazendo, Concluídas ou Todos os status.
  - Área.
  - Cliente.
  - Prazo: Atrasadas, Hoje, Esta semana, Depois ou Sem prazo.
  - O botão "Limpar filtros" aparece quando algum filtro está ativo.
- Os filtros ficam no endereço da página, então o link pode ser salvo ou
  compartilhado.
- A lista é agrupada em Atrasadas, Hoje, Esta semana, Depois, Sem prazo e
  Concluídas.
- Cada linha mostra:
  - checkbox e título;
  - seta laranja quando a prioridade é alta, e a etiqueta "Fazendo" quando for
    o caso;
  - área, cliente e responsáveis;
  - prazo ("Venceu 24/09", "Hoje", "Amanhã" ou "Sáb, 26/09").
- O cabeçalho resume "X abertas · Y atrasadas".
- Com uma pessoa filtrada, "Nova tarefa" já vem com essa pessoa como
  responsável.
- Quando a lista fica vazia, aparecem atalhos para limpar os filtros ou criar
  uma tarefa.

### 2.4 Detalhes da tarefa (painel lateral)

O painel abre ao clicar em qualquer tarefa, em qualquer tela. Tudo é editado
ali mesmo e salvo na hora.

- **Campos:**
  - título (Enter salva);
  - status: A fazer, Fazendo ou Feito;
  - responsáveis: uma, duas ou as três pessoas ("Todos");
  - prazo: atalhos Hoje e Amanhã, ou o calendário; dá para remover;
  - prioridade: Alta, Normal ou Baixa;
  - área, cliente e plano;
  - descrição (salva ao sair do campo).
- No rodapé aparecem quem criou e quando, e a data de conclusão, se houver.
- "⋯ → Excluir tarefa" apaga a tarefa, com confirmação.

### 2.5 Nova tarefa (janela)

- Abre pelo botão "Nova tarefa" ou pela tecla **N** em qualquer tela (fora de
  um campo de texto).
- Só o título é obrigatório. O responsável padrão é quem está logado, e
  prazo, área, cliente, prioridade e descrição são opcionais.
- **Ctrl/⌘+Enter** salva.
- Atenção: a tarefa nova **não entra no plano automaticamente**. Para ela
  contar no progresso do plano, escolha o plano no painel de detalhes.

### 2.6 Calendário (`/calendario`)

- **Visões Semana e Mês.** As setas navegam e o botão "Hoje" volta ao período
  atual. A visão e a data ficam no endereço, então o link pode ser salvo.
- **O que aparece:** tarefas no dia do prazo e eventos de três tipos: Reunião
  (ciano), Evento interno (azul acinzentado) e Entrega (laranja). Há uma
  legenda no topo.
- **Semana:**
  - uma coluna por dia, com o fim de semana sombreado e o dia de hoje
    destacado;
  - o "+" de cada dia cria um evento naquela data;
  - dá para concluir tarefas ali mesmo;
  - no celular a semana vira uma lista por dia.
- **Mês:** mostra até 3 itens por dia, e "+N" abre a lista completa do dia.
  Clicar no dia não cria evento; só o botão "Novo evento" cria.
- **Evento (campos):** título, tipo, data, início e término ou "Dia inteiro",
  "Repetir toda semana", cliente e descrição.
- **Abrir um evento:** mostra os detalhes, com "Editar" e "Excluir". Um evento
  recorrente é editado e excluído como série inteira.
- **Já cadastrada:** a Reunião semanal da Boop, toda segunda às 07:00, sem
  horário de término, a partir de 28/09.

### 2.7 Reuniões (`/reunioes`)

Substitui a antiga tela Segunda (`/segunda` leva para cá). Cada reunião é um
evento do tipo "Reunião" no Calendário (a weekly é o evento semanal de
segunda, 07:00).

- **Próxima reunião em destaque:** quando, tipo (Weekly, cliente ou
  interna), assuntos já na pauta e combinados anteriores em aberto. Tem um
  campo "Algo para discutir?" que adiciona um assunto sem abrir a reunião.
- **Depois dessa:** as próximas (a weekly aparece uma vez só).
- **Histórico por mês:** cada reunião com horário, combinados (e quantos
  seguem em aberto), se tem transcrição e a situação: Encerrada, Em aberto
  (passou e ninguém encerrou), Cancelada ou Sem registro (passou e ninguém
  abriu; dá para registrar depois).
- **Filtro** Todas, Weekly, Clientes ou Internas e **busca** em títulos,
  assuntos, combinados, resumos e transcrições (sem acento: "orcamento" acha
  "orçamento").
- **Nova reunião:** nome, data, horário, repetição e cliente. Cria o evento no
  Calendário e já abre a página da reunião.

### 2.8 Página da reunião (`/reunioes/…`)

- **Assuntos:** o que cada um quer discutir. Qualquer pessoa adiciona antes da
  reunião; durante, marca como discutido.
- **Combinados:** o que ficou decidido, com responsável (uma pessoa ou
  "Equipe") e prazo. **Virar tarefa** cria a tarefa num clique, com o mesmo
  texto, responsável, prazo e cliente; depois disso o combinado mostra o
  status da tarefa, e a tarefa mostra a reunião de origem.
- **Pauta automática:**
  - combinados anteriores da série: todos da última reunião e os mais antigos
    que seguem em aberto (dá para marcar como cumpridos ali);
  - na weekly: progresso do plano e, por pessoa, atrasadas, até domingo e
    concluídas desde a última weekly (dá para concluir tarefas durante a
    reunião);
  - com cliente: as tarefas daquele cliente.
- **Resumo:** texto livre que salva sozinho.
- **Transcrição:** cole o texto de qualquer ferramenta de transcrição. Fica
  recolhida, com nomes de quem fala em destaque, busca que destaca e navega
  pelos trechos, e botões Copiar e Editar.
- **Encerrar reunião** (a partir do dia dela): guarda a pauta como estava,
  para o histórico. Também dá para reabrir, marcar como cancelada, editar
  data/horário/nome e excluir o registro.
- Setas no topo levam à reunião anterior e à próxima da mesma série.
- No celular: antes de encerrar aparecem assuntos, combinados e pauta;
  depois, combinados e resumo primeiro.

### 2.9 Comportamentos gerais

- **Concluir uma tarefa:**
  - contadores e barras atualizam na hora;
  - a tarefa fica riscada no lugar até a página ser recarregada;
  - um aviso oferece "Desfazer" por 4 segundos.
- **Carregando:** aparece um esqueleto da tela.
- **Erro:** "Não foi possível carregar esta tela", com o botão "Tentar de
  novo".
- **Endereço inexistente:** "Página não encontrada".
- **Mudanças de outra pessoa:** aparecem ao navegar ou recarregar. Não há
  atualização em tempo real.
- **Buscadores:** o portal não é indexado.

## 3. Regras: como os números são calculados

O fuso é o de São Paulo e a semana vai de segunda a domingo.

| Termo | Regra |
| --- | --- |
| Atrasada | aberta, com prazo antes de hoje |
| Hoje | aberta, com prazo hoje |
| Esta semana | aberta, com prazo depois de hoje e até domingo |
| Depois | prazo depois deste domingo |
| Sem prazo | tarefa sem data |
| Concluída na semana | concluída entre a segunda e o domingo da semana atual |
| Progresso da semana | das tarefas com prazo nesta semana, quantas estão concluídas |
| Progresso do plano | das tarefas ligadas ao plano, quantas estão concluídas (equipe toda) |
| Plano atual | o plano cujo período inclui hoje; se houver dois, o que termina antes |
| Minhas | tarefas em que a pessoa logada é uma das responsáveis |
| "Todos" | tarefa com as três pessoas como responsáveis |
| Pauta da weekly: atrasadas | abertas, com prazo antes de hoje |
| Pauta da weekly: até domingo | abertas, com prazo de hoje até o domingo da semana da reunião |
| Pauta da weekly: concluídas | concluídas desde a reunião anterior (ou nos 7 dias antes) |
| Pauta com cliente | tarefas daquele cliente; "próximas" cobre pelo menos duas semanas |
| Combinado em aberto | se virou tarefa, a tarefa não está concluída; senão, não foi marcado como cumprido |
| Ordem das listas | prazo mais próximo primeiro; no empate, prioridade alta primeiro e depois a mais antiga |

## 4. Dados e o que dá para editar

| Cadastro | O que tem hoje | Pela interface | Só pelo Supabase |
| --- | --- | --- | --- |
| Pessoas | Jabez, Renatha e Léo | — | criar conta, nome, papel, foto |
| Senhas | temporárias | — | trocar |
| Clientes | Hertmann, Velmont, Hapuck Scents, Boop | escolher em tarefas e eventos | criar, renomear, desativar |
| Planos | Estruturação da Boop até 31/10 (25/09 a 31/10) | ligar ou desligar uma tarefa do plano | criar o próximo plano, mudar as datas |
| Tarefas | as 25 do plano | criar, editar, concluir, excluir | — |
| Eventos | a reunião semanal | criar, editar, excluir | — |
| Reuniões | registros, assuntos, combinados, resumo e transcrição | tudo | — |

Áreas (Comercial, Financeiro, Operação, Marca, Tecnologia, Clientes), status
(A fazer, Fazendo, Feito) e prioridades (Alta, Normal, Baixa) são fixos. Para
mudá-los é preciso alterar o código e o banco.

## 5. Atalhos

| Atalho | O que faz |
| --- | --- |
| N | nova tarefa, em qualquer tela |
| Ctrl/⌘ + Enter | salva a nova tarefa |
| Ctrl/⌘ + B | recolhe ou abre o menu lateral |
| Enter no título (detalhes) | salva o título |

Links de Tarefas com filtros e do Calendário em uma semana ou mês específicos
podem ser salvos nos favoritos.

## 6. Infraestrutura e segurança (resumo)

- **App:** Vercel, projeto `boop-admin`, com servidor em São Paulo. Cada push
  na `main` publica automaticamente.
- **Banco e login:** Supabase, projeto `boop-admin`, em São Paulo, no plano
  gratuito.
- **Segurança:**
  - só quem tem perfil de equipe vê ou altera dados (regras no próprio banco);
  - o cadastro público está desligado;
  - o app não usa chave secreta.

## 7. Limitações conhecidas

- Não há tela para trocar a senha nem "Esqueci minha senha", e o envio de
  e-mails do Supabase não está configurado.
- Clientes, planos e pessoas só podem ser cadastrados pelo banco.
- A tarefa nova não entra no plano automaticamente (2.5).
- Tarefas abre em "Todas", enquanto Hoje abre em "Minhas".
- Não há atualização em tempo real (2.8).
- A recorrência é só semanal e sempre da série inteira: não dá para pular uma
  segunda de feriado.
- Na visão Mês, clicar no dia não cria evento.
- Eventos não têm participantes, link de reunião nem local.
- A busca existe só nas Reuniões (a busca geral entra na Fase 4).
- A tarefa tem só a data do prazo, sem horário.
- Não há lembretes nem avisos (e-mail ou WhatsApp).
- Não há histórico de alterações (quem mudou o quê).
- Não há tema escuro.
- **Volume:** cada tela carrega todas as tarefas de uma vez, e o Supabase
  devolve no máximo 1.000 linhas por consulta. Antes de chegar a 1.000
  tarefas, será preciso arquivar ou paginar.
- **Plano gratuito do Supabase:**
  - o projeto é pausado depois de 7 dias com pouco uso. Para evitar isso,
    um cron da Vercel visita o banco duas vezes por dia (`/api/keepalive`);
  - não há restauração para um ponto no tempo.
- Os testes automáticos usados na entrega não estão no repositório.

## 8. Ideias de otimização

O esforço é P (pequeno, um ajuste pontual), M (médio, um fluxo ou uma tela
nova) ou G (grande, mexe no banco e em várias telas). As ideias marcadas com ★
são uma sugestão para começar.

### Rápidas (P)

| # | Ideia | Por quê |
| --- | --- | --- |
| 1 ★ | Tarefas abrir em "Minhas" (ou lembrar a última escolha) | ficar igual à Hoje; cada um vê primeiro o que é seu |
| 2 ★ | "Nova tarefa" já ligada ao plano atual (opção marcada por padrão) | hoje a tarefa nova não conta no progresso do plano |
| 3 ★ | Tela "Trocar senha" no menu do usuário | tirar as senhas temporárias sem depender do banco |
| 4 | Criar evento clicando no dia, na visão Mês | menos cliques |
| 5 | Busca por título em Tarefas | achar tarefas rápido quando a lista crescer |
| 6 | ~~Editar decisões~~ | feito: as decisões viraram combinados das Reuniões, editáveis |
| 7 | Definir o término da reunião semanal | já dá para fazer hoje: Calendário → a reunião → Editar |
| 8 | Ativar a proteção contra senhas vazadas no Supabase | aviso do verificador de segurança (confirmar se o plano gratuito permite) |

### Médias (M)

| # | Ideia | Por quê |
| --- | --- | --- |
| 9 ★ | Cadastro de clientes e de planos dentro do portal | criar o próximo plano (novembro) sem depender do banco |
| 10 | Atualização em tempo real | ver o que os sócios mudam sem recarregar |
| 11 | Pular uma ocorrência da recorrência; outras frequências | feriados, reuniões mensais |
| 12 | Participantes e link de reunião (Meet) nos eventos | o evento vira convite útil |
| 13 | Instalar como app no celular (ícone na tela inicial) | abrir como um aplicativo |
| 14 | "Esqueci minha senha" | precisa configurar o envio de e-mail no Supabase |
| 15 | Testes automáticos no repositório, rodando a cada push | evita quebrar o que já funciona |

### Maiores (G)

| # | Ideia | Por quê |
| --- | --- | --- |
| 16 | Lembretes de prazo (e-mail ou WhatsApp) | ninguém depende de abrir o portal para lembrar |
| 17 | Histórico de alterações por tarefa | saber quem mudou o quê e quando |
| 18 | Relatório de fechamento do plano | revisão de 26/10: o que foi feito e os atrasos por pessoa e área |
| 19 | Arquivamento ou paginação de tarefas antigas | manter o portal rápido e abaixo do limite de 1.000 linhas |
| 20 | Tema escuro | conforto de uso à noite |

## 9. Onde mexer (mapa do código)

| Assunto | Arquivos |
| --- | --- |
| Tela Hoje | `src/features/today/`, `src/app/(app)/hoje/page.tsx` |
| Tarefas (lista, filtros, linha) | `src/features/tasks/tasks-view.tsx`, `filters.ts`, `task-row.tsx` |
| Detalhes e nova tarefa | `src/features/tasks/task-sheet.tsx`, `new-task-dialog.tsx` |
| Regras (grupos, progresso, pauta) | `src/features/tasks/logic.ts`, `src/features/meetings/logic.ts` |
| Calendário | `src/features/calendar/` |
| Reuniões | `src/features/meetings/`, `src/app/(app)/reunioes/` |
| Login e sessão | `src/features/auth/`, `src/proxy.ts` |
| Menu lateral e cabeçalhos | `src/components/layout/` |
| Cores e fontes | `src/app/globals.css`, `src/app/layout.tsx` |
| Nomes de status, áreas e tipos | `src/lib/labels.ts` |
| Datas e fuso | `src/lib/dates.ts` |
| Banco (tabelas e segurança) | `supabase/migrations/`, `supabase/seed.sql` |
