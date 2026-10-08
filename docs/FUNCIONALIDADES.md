# Boop Admin — o que o portal tem hoje

Retrato do portal em produção em <https://admin.deumboop.com.br> (outubro
de 2026). Serve para entender o que existe, como cada parte funciona e o que dá
para otimizar. Os detalhes técnicos estão em [ARQUITETURA.md](ARQUITETURA.md).

Para pedir um ajuste, cite a seção. Exemplo: "2.3: abrir Tarefas em Minhas".

---

## 1. Visão geral

- **Para que serve:** mostrar em poucos segundos o que está atrasado, o que
  vence hoje e na semana, quem é responsável por cada coisa e como andam os
  projetos; guardar num lugar só o que a Boop combinou, decidiu, falou com
  os clientes e recebeu ou pagou; e gerir a empresa pelos números
  (faturamento, MRR, margem, caixa, funil de vendas e metas), todos
  calculados a partir desses registros.
- **Quem entra:** Jabez, Renatha e Léo, com e-mail e senha. Não existe
  cadastro. Uma conta nova só pode ser criada pelo Supabase (seção 4).
- **Sessão:** fica salva no navegador, então não é preciso entrar toda vez.
  "Sair" desconecta só aquele navegador.
- **Menu lateral:** Hoje, Tarefas (com as visões salvas logo abaixo),
  Projetos, Calendário e Reuniões; em **Relacionamento**, Comercial,
  Conteúdo, Clientes e Comunicações; em **Gestão**, Indicadores, Metas, Financeiro,
  Relatórios, Decisões e Processos. No rodapé
  ficam a pessoa logada e o "Sair". O menu pode ser recolhido pelo ícone no
  topo ou com Ctrl/⌘+B, e a escolha fica salva. No celular ele abre pelo
  botão do topo.
- **Busca geral:** "Buscar…" no topo de qualquer tela, ou Ctrl/⌘+K, acha
  tarefas, projetos, reuniões, decisões, comunicações, processos, clientes,
  negócios e lançamentos e cria qualquer coisa (2.14).
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
- **Em foco:** os projetos fixados (até quatro). O primeiro vem em destaque
  ("Estruturação da Boop até 31/10"): percentual grande, barra, "X de Y
  tarefas", dias restantes e atrasadas. Os outros aparecem menores, com link
  para o projeto. Esses números contam a equipe toda; no filtro Minhas
  aparece também "suas: X de Y". Para pôr ou tirar um projeto daqui, use o
  alfinete na tela Projetos (2.16).
- **Semana**, menor, abaixo dos projetos: tarefas com prazo nesta semana,
  concluídas sobre o total.
- Listas **Atrasadas**, **Hoje** e **Esta semana**, só com tarefas abertas.
- **Combinados em aberto:** os combinados das reuniões que ainda não viraram
  tarefa (os que viraram já aparecem nas listas), com a reunião de origem e o
  prazo. O checkbox marca como cumprido.
- Na lateral, o painel do dia:
  - **Próxima reunião:** quando, tipo, quantos assuntos já estão na pauta e o
    campo "Algo para discutir?", que adiciona um assunto sem sair da tela.
    "Abrir pauta" leva à reunião;
  - **Revisões de clientes** do mês por fazer (2.13);
  - **Conteúdo:** posts atrasados, os que saem hoje e os que esperam o
    cliente aprovar (até 6; clicar abre o post, 2.26);
  - **Financeiro em atraso:** quanto há a receber e a pagar vencido, com
    link para o Financeiro (2.20);
  - **Processos para revisar:** os marcados para revisar ou com a revisão
    vencida (até 5, com "Ver todos");
  - **Gestão:** o mês a fechar, contratos terminando, queda prevista do MRR,
    caixa negativo na projeção e negócios com fechamento previsto para os
    próximos 3 dias (ou já passado), cada um com link;
  - **Próximos compromissos:** eventos dos próximos 7 dias (até 5), com link
    para o Calendário. Tarefas não entram nessa lista.
- Quadro sem nada para mostrar não aparece.

**O que dá para fazer:** concluir uma tarefa pelo checkbox, abrir os detalhes
com um clique, criar uma tarefa pelo botão "Nova tarefa" ou pela tecla N,
cumprir um combinado e pôr um assunto na pauta da próxima reunião.

**Regra importante:** os indicadores, as listas, a semana, os combinados e os
processos seguem o filtro Minhas/Todas. No Minhas aparecem os combinados da
pessoa e os da "Equipe", e os processos dela e os sem responsável. Os
projetos em foco (além do "suas: X de Y"), as revisões de clientes, o
financeiro e a gestão não seguem o filtro. O quadro Conteúdo segue: no
Minhas, os posts da pessoa e os sem responsável.

### 2.3 Tarefas (`/tarefas`)

- **Pessoa:** Todas (padrão), Minhas, Jabez, Renatha ou Léo.
- **Filtros:**
  - Status: Abertas (padrão), A fazer, Fazendo, Concluídas ou Todos os status.
  - Projeto (ou "Sem projeto").
  - Cliente.
  - Área.
  - Prazo: Atrasadas, Hoje, Esta semana, Depois ou Sem prazo.
  - O botão "Limpar filtros" aparece quando algum filtro está ativo.
- **Três modos** (botões ao lado dos filtros):
  - **Lista** (padrão): agrupada em Atrasadas, Hoje, Esta semana, Depois, Sem
    prazo e Concluídas;
  - **Tabela:** uma linha por tarefa com status, prazo, prioridade, projeto,
    cliente e área; clicar no nome da coluna ordena (de novo, inverte);
  - **Quadro:** colunas A fazer, Fazendo e Feito. Arrastar um cartão muda o
    status (soltar em Feito conclui, com "Desfazer"). Feito mostra as
    concluídas nos últimos 14 dias. No quadro, o filtro de status não
    aparece.
- **Visões salvas:** "Salvar visão" guarda os filtros e o modo atuais com um
  nome (ex.: "Velmont", "Minhas atrasadas", "Quadro da semana"). As visões
  ficam no topo da tela e no menu lateral, abaixo de Tarefas, e valem para a
  equipe toda. Pelo "⋯" de cada visão dá para renomear e excluir; depois de
  mudar os filtros a partir de uma visão, "Salvar visão" também oferece
  atualizá-la.
- Filtros e modo ficam no endereço da página, então o link pode ser salvo ou
  compartilhado.
- Cada linha da lista mostra:
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
  - área, cliente e projeto (escolher um projeto de cliente leva o cliente
    junto, se a tarefa ainda não tem);
  - descrição (salva ao sair do campo).
- No topo, o projeto da tarefa leva à página dele. No rodapé, quando a
  tarefa nasceu de uma reunião, de uma revisão de cliente, de um processo ou
  de um pedido do cliente, aparece o link para a origem.
- **Atividade:** o histórico da tarefa ("Léo mudou o prazo de 04/10 para
  06/10", "Renatha concluiu") e os comentários. Ctrl/⌘ + Enter envia; cada
  pessoa edita ou apaga os próprios comentários.
- No rodapé aparecem quem criou e quando, e a data de conclusão, se houver.
- "⋯ → Excluir tarefa" apaga a tarefa, com confirmação.

### 2.5 Nova tarefa (janela)

- Abre pelo botão "Nova tarefa" ou pela tecla **N** em qualquer tela (fora de
  um campo de texto).
- Só o título é obrigatório. O responsável padrão é quem está logado, e
  prazo, área, cliente, projeto, prioridade e descrição são opcionais.
- Criada de dentro de um projeto, de um cliente ou com um filtro de projeto,
  a tarefa já vem ligada a ele. Para ela contar no progresso de um projeto,
  escolha o projeto (aqui ou depois, no painel de detalhes).
- **Ctrl/⌘+Enter** salva.

### 2.6 Calendário (`/calendario`)

- **Visões Semana e Mês.** As setas navegam e o botão "Hoje" volta ao período
  atual. A visão e a data ficam no endereço, então o link pode ser salvo.
- **O que aparece:** tarefas no dia do prazo, eventos de três tipos: Reunião
  (ciano), Evento interno (azul acinzentado) e Entrega (laranja), e os posts
  da Central de Conteúdo no dia de publicação (com a inicial do cliente; só
  para ver: clicar abre o post, 2.26). Há uma legenda no topo.
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
  - na weekly: progresso dos projetos em foco e, por pessoa, atrasadas, até
    domingo e concluídas desde a última weekly (dá para concluir tarefas
    durante a reunião);
  - com cliente: as tarefas daquele cliente.
- **Decisões:** o que passou a valer nesta reunião (ex.: "fee mínimo de R$
  2.500"). Registradas aqui, já ficam ligadas à reunião e ao cliente e
  aparecem na tela Decisões (2.19).
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

### 2.9 Clientes (`/clientes`)

- **Revisões do mês** no topo: quantas já foram feitas, quantas faltam e
  quantas estão atrasadas.
- **Um cartão por cliente ativo:** saúde (Saudável, Atenção, Em risco ou Sem
  avaliação), responsável, frentes de trabalho, situação da revisão do mês
  (Feita, Em andamento, "Até 10/10" ou Atrasada), tarefas abertas e
  atrasadas e o próximo compromisso no Calendário. Clicar abre o cliente.
- **Inativos** ficam recolhidos no fim.
- **Novo cliente:** nome (só ele é obrigatório), responsável da Boop,
  frentes (sugestões como Social media e Tráfego pago, ou escritas à mão),
  cliente desde (mês e ano), contato (nome, e-mail, telefone/WhatsApp),
  revisão mensal (ligada ou não, e o dia do mês em que vence) e
  observações.

### 2.10 Página do cliente (`/clientes/…`)

- **Revisão do mês:**
  - **Como está o cliente?** Saudável, Atenção ou Em risco (clicar de novo
    desmarca). A saúde da revisão mais recente vira o selo do cliente.
  - **Checklist** de sete itens: entregas, resultados, relatório, retorno do
    cliente, financeiro, próximo mês e acessos.
  - **Notas da revisão**, que salvam sozinhas.
  - **Próximos passos:** cada um vira uma tarefa do cliente, com
    responsável e prazo, e aparece também em Tarefas.
  - **Concluir revisão** (registra quem e quando) e **Reabrir**.
  - Setas no topo levam aos meses anteriores (dá para registrar um mês que
    passou).
- **Projetos** do cliente (abertos; os concluídos e cancelados recolhidos),
  com progresso e prazo, e **Novo**, já com o cliente.
- **Conteúdo:** quantos posts em cada etapa, os próximos (atrasados
  primeiro), **Post** já com o cliente e "Abrir no Conteúdo", que leva à
  visão central filtrada pelo cliente (2.26).
- **Tarefas** do cliente por prazo, com as concluídas nos últimos 30 dias
  recolhidas; **Tarefa** no topo cria uma já com o cliente.
- **Comunicações** recentes com o cliente e **Registrar** (2.18).
- **Reuniões** com o cliente (próximas e recentes) e **Nova reunião**, que já
  vem com o cliente escolhido.
- Na lateral: **Sobre o cliente** (contato com link de e-mail e de
  WhatsApp), **Financeiro** (mensalidade, margem do contrato, fim do
  contrato, o que está em atraso e o recebido no ano, com **Lançar** e o
  link para os lançamentos do cliente nos últimos 12 meses), **Negócios**
  (upsell, renovação ou projeto novo no funil, com **Negócio**), **Saúde
  mês a mês** (seis meses; clicar abre aquela revisão), **Decisões** sobre o
  cliente e **Processos do cliente** (com "Novo").
- **Editar** muda o cadastro. No menu: desativar/reativar e excluir (apaga o
  cadastro, as revisões e as comunicações; tarefas, projetos, eventos,
  decisões, lançamentos e processos continuam, sem o cliente).
- A Boop (projetos internos) está cadastrada sem revisão mensal.

### 2.11 Processos (`/processos`)

A documentação interna da Boop, no lugar do Notion: processos (passo a
passo), checklists, políticas (regras combinadas) e guias.

- **Comece por aqui:** os documentos fixados, em destaque no topo.
- **Lista por área** (Comercial, Financeiro, Operação, Marca, Tecnologia,
  Clientes e Sem área), com tipo, status (Rascunho, Em vigor ou Revisar),
  cliente, responsável e quando o texto foi editado.
- **Filtros** na lateral (no celular, numa fileira no topo): Todos, Para
  revisar, Rascunhos, cada área e cada cliente que tenha documentos.
- **Busca** no título, no "para que serve" e no texto, sem acento, com o
  trecho encontrado em destaque.
- **Novo documento:** título e um modelo (Processo passo a passo, Checklist,
  Política, Guia, Onboarding de cliente ou Em branco), área e cliente. Começa
  como rascunho.
- **Sugestões para documentar:** dez documentos com estrutura pronta
  (Como funciona a Boop, Rotina da weekly, Onboarding de cliente, Aprovação
  de conteúdo, Relatório mensal, Proposta comercial, Faturamento e cobrança,
  Tom de voz, Acessos e ferramentas, Prazos e retrabalho). Com a biblioteca
  vazia, elas são a tela inicial; depois ficam no fim da lista, só as que
  ainda não existem.

### 2.12 Página do processo (`/processos/…`)

- **Título** e **para que serve** (uma frase que aparece na lista), editáveis
  ali mesmo.
- **Editor de blocos**, no estilo do Notion: digite "/" para inserir títulos,
  listas, checklist, tabela, citação, código, separador ou imagem.
  Selecionar um texto mostra a barra de formatação (negrito, cor, link,
  alinhamento). Os blocos podem ser arrastados pela alça à esquerda.
- **Salva sozinho** pouco depois de parar de digitar ("Salvando…" → "Salvo"
  no topo); Ctrl/⌘ + S salva na hora. Fechar a aba com algo não salvo pede
  confirmação.
- **Duas pessoas editando ao mesmo tempo:** se alguém salvou enquanto você
  editava, nada é sobrescrito em silêncio. Aparece um aviso dizendo quem
  salvou e quando, com duas opções: salvar as suas alterações por cima (a
  versão da outra pessoa fica no histórico) ou descartar as suas e carregar a
  da outra pessoa.
- **Imagens:** colar, arrastar ou "/imagem". Ficam guardadas de forma
  privada: o endereço só abre para quem está logado. Fotos grandes são
  reduzidas antes de enviar (limite de 5 MB).
- **Detalhes:** tipo, status, área, cliente (ou nenhum, quando vale para
  todos), responsável e revisão periódica (todo mês, a cada 3 ou 6 meses,
  uma vez por ano ou sem revisão). **Revisado hoje** registra a revisão e o
  documento volta a "Em vigor". Quando a revisão vence, um aviso aparece no
  topo do documento e ele entra em "Para revisar". No celular os detalhes
  começam fechados, numa linha de resumo.
- **Neste documento:** índice das seções (telas grandes); clicar leva até a
  seção.
- **Gerar tarefas:** os itens do checklist viram tarefas, com o mesmo
  responsável, prazo e cliente para todas (dá para ajustar cada uma depois).
  Vêm marcados os itens ainda não feitos no documento. As tarefas aparecem em
  **Tarefas geradas**, com o progresso, e cada tarefa mostra o processo de
  origem. O documento continua como modelo: dá para gerar de novo para o
  próximo cliente.
- **Histórico:** o portal guarda uma versão a cada meia hora de edição e
  sempre que outra pessoa edita. Dá para ver cada versão e **restaurar**; o
  texto atual vai para o histórico, então restaurar pode ser desfeito.
- **Menu (⋯):** fixar em "Comece por aqui", histórico de versões, duplicar
  (a cópia começa como rascunho), copiar link e excluir (apaga também o
  histórico e as imagens; as tarefas geradas continuam).

### 2.13 Revisões na tela Hoje e na weekly

- **Hoje:** "Revisões de clientes" lista as revisões do mês por fazer
  (atrasadas primeiro), com o responsável. Some quando está tudo em dia.
- **Weekly:** enquanto a reunião está aberta, o quadro "Clientes" mostra,
  para cada cliente com revisão mensal, a saúde, a revisão do mês e as
  tarefas abertas e atrasadas. É sempre o estado do momento (não fica
  guardado ao encerrar).
- Numa reunião com cliente, o selo com o nome do cliente leva para a página
  dele.

### 2.14 Busca geral (Ctrl/⌘ + K)

- Abre em qualquer tela pelo **Ctrl/⌘ + K** ou pelo botão **Buscar…** no topo
  (no celular, a lupa). Dentro do editor de processos, Ctrl/⌘ + K cria um
  link; ali, use o botão do topo.
- **Sem digitar nada:** ações rápidas (Nova tarefa, Novo projeto, Nova
  reunião, Novo documento, Novo cliente, Registrar comunicação, Registrar
  decisão, Novo lançamento, Novo negócio, Novo post, Novo objetivo), as visões salvas de
  Tarefas e atalhos para cada tela. A ação leva à tela certa e já abre a janela de criar.
- **Digitando** (a partir de 2 letras, sem acento: "reuniao" acha "reunião"):
  - **Tarefas:** pelo título e pela descrição; as abertas vêm primeiro.
    Abrir leva a Tarefas com o painel da tarefa aberto;
  - **Projetos:** pelo nome e pelo cliente;
  - **Reuniões:** pelo título, pelo cliente, pelos assuntos e combinados e
    pelo resumo e pela transcrição. Das próximas aparece só a próxima de cada
    série; as que já aconteceram aparecem da mais nova para a mais antiga;
  - **Decisões:** pelo título e pelo contexto;
  - **Comunicações:** pelo resumo, pelos detalhes e pelo cliente;
  - **Processos:** pelo título, pelo "para que serve" e, a partir de 3 letras,
    pelo texto inteiro, com o trecho encontrado;
  - **Clientes:** pelo nome (inativos aparecem marcados);
  - **Negócios:** pelo título, pela empresa, pelo contato e pelo cliente;
    abrir leva ao Comercial com o negócio aberto;
  - **Financeiro:** pela descrição dos lançamentos e recorrências.
- Mostra até 6 resultados de cada tipo. ↑ ↓ escolhem, Enter abre, Esc fecha.

### 2.15 Comportamentos gerais

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

### 2.16 Projetos (`/projetos`)

Um projeto junta as tarefas de uma entrega (site da Velmont, identidade
visual da Hertmann) ou de um ciclo interno ("Estruturação da Boop até
31/10", que era o "plano").

- **Cartões por status:** Em andamento, Planejados e Pausados; Concluídos e
  cancelados ficam recolhidos no fim. Cada cartão mostra o cliente (ou
  "Interno"), o status, o prazo ("Faltam 24 dias", "Prazo passou há 2
  dias"), o progresso das tarefas, as atrasadas, o responsável e a próxima
  entrega.
- **Filtros:** Todos, Clientes, Internos e Meus (em que a pessoa é a
  responsável).
- **Alfinete:** põe ou tira o projeto do **foco** (tela Hoje e weekly).
- **Novo projeto:** nome, cliente (ou "Interno"), responsável, começo, prazo
  de entrega, status, "em foco", descrição e **tarefas iniciais**:
  - **Começar sem tarefas;**
  - um **modelo da Boop**: Site institucional (15 tarefas), Identidade visual
    (10), Social media — implantação (10), Tráfego pago — implantação (9) ou
    Plano interno (ciclo). Os prazos são contados a partir do começo do
    projeto;
  - **Repetir um projeto:** copia as tarefas de outro projeto, na mesma
    distância do começo;
  - **Checklist de um processo:** cada item vira uma tarefa.
  As tarefas nascem com o responsável do projeto (ou quem criou) e o cliente.

### 2.17 Página do projeto (`/projetos/…`)

- **Cabeçalho:** status, "Em foco", modelo usado, cliente, responsável e
  período. **Tarefa** cria uma tarefa já no projeto; **Editar** muda os
  dados.
- **Menu (⋯):** fixar/tirar do foco, pausar, retomar, concluir, cancelar,
  **Novo projeto a partir deste** (repete as tarefas) e excluir (as tarefas
  ficam sem projeto, ou são excluídas junto, se marcado).
- **Progresso:** percentual, tarefas concluídas, atrasadas, próxima entrega
  e prazo.
- **Tarefas** do projeto em **Lista** (por prazo, com as concluídas
  recolhidas) ou **Quadro**.
- **Atividade:** tudo o que mudou no projeto e nas tarefas, decisões,
  comunicações e lançamentos dele ("Léo mudou o status para Fazendo ·
  'Fechar cronograma'"), com comentários. Tarefas criadas em sequência (um
  modelo, por exemplo) aparecem juntas ("criou 15 tarefas").
- **Lateral:** Sobre o projeto (descrição), **Decisões**, **Comunicações**
  (projeto de cliente) e **Financeiro**: receita e custos (recebido/pago de
  quanto previsto), resultado previsto e os lançamentos do projeto.
- Mudar o cliente do projeto leva o cliente novo para as tarefas que estavam
  com o antigo ou sem cliente.

### 2.18 Comunicações (`/comunicacoes`)

O que foi falado com cada cliente: pedidos, aprovações, retornos e
atualizações. Serve para não perder um pedido feito no WhatsApp e para saber,
depois, quem aprovou o quê.

- **Lista** do mais recente para o mais antigo, em grupos (Hoje, Ontem, Esta
  semana, Semana passada e por mês). Cada item mostra o canal (WhatsApp,
  e-mail, ligação, reunião), o tipo (Pedido, Aprovação, Feedback,
  Atualização, Outro), a data, o cliente, o projeto, quem registrou e se
  "virou tarefa".
- O cabeçalho avisa quantos **pedidos ainda não viraram tarefa**.
- **Busca** (resumo e detalhes), **filtro por cliente** e **por tipo**.
- **Registrar:** tipo, resumo (o que foi dito, em uma linha), detalhes,
  cliente (obrigatório), projeto, canal e data (padrão: hoje).
- **Virar tarefa:** cria a tarefa com o resumo, o cliente e o projeto,
  ligada à comunicação.
- Também aparecem na página do cliente e na do projeto, com "Registrar" já
  ligado a eles.

### 2.19 Decisões (`/decisoes`)

O que a Boop definiu e por quê: preço mínimo, prazo de aprovação, regra com
cliente, escolha de tecnologia num projeto. Diferente de um combinado (que é
uma ação com dono e prazo), a decisão é uma regra que passa a valer.

- **Lista por mês**, com título, contexto (o porquê), data, área, reunião de
  origem, cliente, projeto e quem registrou.
- **Filtros:** Em vigor (padrão), Revogadas ou Todas; área; cliente ou
  projeto; busca no título e no contexto.
- **Nova decisão:** título, contexto, data (padrão: hoje), área, cliente e
  projeto. Abrir uma decisão permite editar, **revogar** (deixa de valer, mas
  fica no histórico), voltar a valer e excluir.
- Também aparecem na reunião (2.8), no cliente e no projeto.

### 2.20 Financeiro (`/financeiro`)

A planilha "Financeiro - Boop" dentro do portal: as mesmas categorias,
contas e premissas, sem ninguém preencher totais à mão. Sete abas, todas com
o botão **Novo lançamento**.

- **Mês** (setas e "Este mês"):
  - indicadores: **Receita bruta** (recebido e a receber), **Custos e
    despesas**, **Resultado** (com a margem) e **Saldo em conta** hoje;
  - **Em atraso** (no mês atual): o que venceu e não foi recebido ou pago,
    de qualquer mês;
  - **Receitas** e **Despesas** do mês. O checkbox marca recebido/pago com a
    data de hoje (desmarcar desfaz); ao receber, o aviso oferece **Informar
    taxa** do gateway. Cada linha mostra vencimento, cliente, projeto,
    categoria e subcategoria; ⟳ indica que se repete todo mês;
  - **Resultado do mês:** o DRE do mês (receita, imposto, taxas, custos
    diretos, margem de contribuição, custos fixos, outras despesas,
    resultado) e o que fica fora dele (aportes, DAS pago, pró-labore,
    reinvestimentos). Cada linha abre os lançamentos;
  - **Divisão do resultado:** quanto vai para o caixa, para reinvestimento e
    para o pró-labore de cada sócio, e o caixa acumulado em relação ao
    mínimo;
  - **Atenção:** mês a fechar, contratos terminando, queda do MRR, caixa
    negativo previsto, lançamentos a conferir e a alíquota a confirmar.
- **DRE:** os últimos meses ou um ano inteiro; receita bruta, resultado,
  margem de contribuição e resultado médio do período; gráficos de receita
  (recebido × previsto) e de resultado; a tabela mês a mês com a situação de
  cada mês (Fechado, Realizado, Parcial, Previsto) e os percentuais. Clicar
  num valor abre os lançamentos. **Excel** baixa a mesma tabela com
  fórmulas.
- **Projeção:** os próximos 12 meses pelos contratos (até o fim de cada
  um), custos fixos e lançamentos agendados: MRR (6 meses para trás e 12
  para a frente), **caixa acumulado** com a linha do mínimo, **receita
  necessária** para o alvo de pró-labore (quanto falta sobre o MRR) e a
  tabela mês a mês com resultado, divisão e caixa.
- **Contratos e custos:** MRR, clientes com contrato (ticket médio),
  concentração no maior cliente, custos fixos por mês; **margem por
  cliente** (como a aba CLIENTES da planilha) com o fim do contrato; e as
  recorrências por categoria (contratos, custos fixos, custos diretos…),
  com parcelas e valor restantes; as encerradas ficam recolhidas.
- **Lançamentos:** o extrato completo, com filtros (mês ou intervalo,
  categoria, cliente, situação: pago, em aberto, atrasado, pulado; receita
  ou despesa; "a conferir"), busca e totais (bruto, taxas, líquido). Todos
  os "ver de onde vem" do sistema caem aqui, já filtrados.
- **Fechamento:** o mês a fechar com três passos (vencimentos resolvidos,
  lançamentos conferidos, saldo do extrato informado). Fechar trava os
  pagamentos daquele mês; o último mês fechado pode ser reaberto.
- **Parâmetros:** alíquota (e "confirmada com o contador"), caixa mínimo em
  meses de custo fixo, sócios, divisão do resultado, alvo de pró-labore,
  primeiro mês do controle, saldo inicial e aviso de fim de contrato; ao
  lado, o que o sistema calcula (taxa média do gateway, custos fixos, caixa
  mínimo).
- **Novo lançamento:** receita ou despesa, descrição, **categoria** (receita
  de cliente, outras receitas, aporte de sócio, custo direto de cliente,
  custo fixo, outras despesas, imposto, pró-labore, reinvestimento — com a
  explicação de onde entra), valor bruto, vencimento, cliente (obrigatório
  em receita de cliente), projeto, subcategoria (ou frente), já
  recebido/pago (com a **taxa do gateway**), observação e **Repetir todo
  mês** (contrato ou custo fixo, com fim ou número de parcelas).
- **Abrir um mês de recorrência:** as mudanças valem só para aquele mês
  (valor, vencimento, recebido); **Pular este mês** e **Editar a
  recorrência**, que vale para os meses ainda não registrados.
- No **cliente** aparecem mensalidade, margem e fim do contrato; no
  **projeto**, receita, custos e resultado; na tela **Hoje**, o financeiro
  em atraso e o quadro Gestão.

### 2.21 Histórico e comentários

- O banco registra sozinho quem criou, mudou ou excluiu tarefas, projetos,
  decisões, comunicações, lançamentos e negócios, e o quê mudou ("mudou o
  prazo de 04/10 para 06/10", "atribuiu a Léo", "deu baixa em 06/10",
  "moveu para Negociação", "ganhou o negócio").
- Mudanças seguidas da mesma pessoa no mesmo item viram uma linha só; voltar
  ao valor original apaga o registro.
- O histórico aparece no painel da tarefa e na página do projeto (com as
  mudanças das tarefas, decisões, comunicações e lançamentos do projeto).
- O negócio tem o próprio histórico, com comentários.
- **Comentários** nas tarefas, nos projetos e nos negócios: Ctrl/⌘ + Enter envia; cada
  pessoa edita e apaga só os seus. O resto do histórico não pode ser
  alterado.
- O histórico começa em 07/10/2026: o que mudou antes disso não aparece.

### 2.22 Comercial (`/comercial`)

O funil de vendas, do lead ao cliente.

- Indicadores: **em aberto** (negócios, valor mensal e total), **valor
  ponderado** (pela chance de fechar), **ganhos no mês** e **taxa de
  ganho** dos últimos 90 dias (com o ciclo de venda).
- **Quadro:** Lead, Contato, Proposta, Negociação e a coluna dos fechados
  nos últimos 30 dias (Ganho e Perdido). Arrastar muda a etapa; soltar em
  Perdido pede o motivo; soltar em Ganho abre o **Ganhar**. **Lista:**
  todos, com filtro de situação. Busca e filtro por responsável.
- **Negócio:** título, empresa (lead novo) ou cliente da casa, contato
  (nome, e-mail, telefone), origem (indicação, Instagram, site, Google,
  LinkedIn, WhatsApp, prospecção ativa, evento, cliente da casa, outra), frente,
  **valor mensal** e **pontual**, prazo do contrato, etapa, chance de fechar
  (padrão da etapa), responsável, chegada, previsão de fechamento,
  observação, histórico e comentários.
- **Ganhar:** confirma o cliente (existente ou novo, com o contato do
  negócio), o começo, o dia do vencimento e a duração do contrato, a data
  da entrada pontual e o nome do projeto. Num clique o portal cria o
  cliente, o contrato no financeiro, a entrada e o projeto, e o negócio
  passa a apontar para eles.
- **Perder** pede o motivo (preço, escolheu outra agência, sem orçamento
  agora, parou de responder, adiou o projeto, fora do nosso perfil, ou um
  texto livre); **Reabrir** devolve ao funil.

### 2.23 Indicadores (`/indicadores`)

Todos os números da Boop num lugar, calculados dos dados do portal.

- **Período:** mês, trimestre ou ano, com setas; **comparar com** o período
  anterior ou o mesmo período do ano passado. Fica no endereço, então dá
  para salvar ou mandar o link.
- **Áreas:** Visão geral, Financeiro (faturamento, MRR, clientes, ticket,
  MRR novo e perdido, custos, resultado, margens, a receber em atraso,
  inadimplência, saldo, caixa em meses, falta para a receita necessária),
  Comercial (leads, propostas, ganhos, taxa de ganho, conversão, MRR e valor
  vendidos, ticket de venda, ciclo, funil ponderado) e Operacional (tarefas
  concluídas, entregas no prazo, atrasadas, projetos ativos, atrasados e
  concluídos, revisões feitas, clientes em risco).
- Cada indicador mostra o valor, a variação (verde quando melhora, vermelho
  quando piora) e a linha dos últimos 12 meses. **Clicar** abre o detalhe:
  a fórmula, o gráfico de 12 meses, as linhas que formam o número e
  **Abrir os dados de origem**.
- Gráficos de cada área (faturamento e resultado por mês, MRR, receita por
  cliente, atrasados por idade, funil, origem dos leads, leads e ganhos,
  fechamentos previstos, tarefas por mês e por pessoa, projetos atrasados)
  e **Pede atenção**.
- Atalhos para o relatório e o Excel do mesmo período.

### 2.24 Metas (`/metas`)

- **Objetivos** com período (este mês, este trimestre, próximo trimestre,
  este ano ou datas livres), área, responsável e descrição. Filtro: Em
  andamento, Próximas, Encerradas, Todas.
- **Resultados-chave:** escolha um indicador do sistema (o progresso se
  atualiza sozinho; alguns aceitam recorte por cliente) ou um valor manual
  (ex.: NPS, atualizado à mão). Meta, base opcional e **sugestões**: manter
  o ritmo dos últimos 3 meses, +20%, e para o MRR a receita necessária.
- Cada resultado mostra o atual e a meta, a barra com a marca do
  **esperado para hoje**, a situação (No ritmo, Atenção, Atrasada,
  Atingida, Não atingida) e, nos financeiros, a previsão para o fim.
- Sem nenhum objetivo, a tela oferece **Começar pela meta de MRR da
  planilha** (R$ 5.000 de MRR).

### 2.25 Relatórios (`/relatorios`)

- Escolha o **período** (mês, trimestre ou ano), a **comparação**, o
  **recorte** (toda a Boop ou um cliente) e o que entra: indicadores, DRE,
  projeção e divisão do resultado, contratos e margem por cliente,
  lançamentos, comercial, operação e metas.
- **Ver relatório:** uma página limpa para apresentar ou salvar em PDF
  (**Imprimir ou salvar em PDF** já ajusta para A4 deitado).
- **Baixar Excel:** uma aba por seção, com as fórmulas da planilha
  (margens, resultado, totais), as premissas editáveis (mudar a alíquota
  recalcula o DRE) e uma aba "Sobre" com o que cada número significa.

### 2.26 Conteúdo (`/conteudo`)

A Central de Conteúdo: a social media vê os posts de **todos os clientes
juntos**, sem entrar cliente por cliente.

- **Indicadores:** posts nesta semana (e quantos já foram publicados),
  **atrasados** (vermelho quando há algum), **aguardando cliente** e com
  **falta material**. Clicar leva à visão que mostra cada um.
- **Calendário** (mês ou semana, com setas e "Hoje"): cada post mostra a
  inicial do cliente numa cor que é sempre a mesma para aquele cliente, o
  ícone do formato, a etapa e um ponto vermelho (atrasado) ou laranja (falta
  material). No mês, até 3 posts por dia e "+N"; no celular, pontos por dia
  que abrem a lista. Na semana, o "+" do dia cria um post naquela data.
  Posts sem data ficam em "Sem data de publicação", abaixo.
- **Quadro:** Em produção, Revisão interna, Aguardando cliente, Aprovado,
  Programado e Publicado (este com os últimos 30 dias). Arrastar muda a
  etapa (no celular, mude a etapa dentro do post). Cada cartão mostra o
  cliente, o responsável, o formato, a data, os sinais e as frentes (C, D,
  V) com a cor da situação.
- **7 dias:** os atrasados, hoje, amanhã e os dias seguintes, com o que falta
  em cada frente ("Copy: A fazer · Design: Em revisão").
- **Filtros** (ficam no endereço, então o link pode ser salvo ou mandado):
  clientes (vários), responsável (Todos, Meus ou uma pessoa), redes,
  formatos e etapas. "Limpar filtros" volta tudo.
- **Novo post:** pelo botão, pela busca geral (Ctrl/⌘ + K → "Novo post") ou
  pelo "+" de um dia. Com um só cliente filtrado, ele já vem escolhido.
- **Post (janela):**
  - título, cliente, projeto (os do cliente), formato, etapa, dia e horário
    de publicação, responsável, redes (pelo menos uma) e intenções;
  - **frentes:** a situação de copy, design e vídeo (Não precisa, A fazer,
    Em produção, Falta material, Em revisão, Em alteração, Finalizado). Num
    post novo, vídeo já vem "A fazer" em reels, vídeo e stories e "Não
    precisa" nos outros formatos;
  - **textos conforme o formato:** conteúdo/ideia e orientação de design
    (ou de vídeo) em todos; slides no carrossel (até 20); roteiro em reels,
    vídeo e stories; legenda em reels, carrossel, vídeo, estático, foto e
    texto; e o link do Drive (com o botão para abrir). Trocar o formato não
    apaga o texto que ficou escondido;
  - **Tarefas das frentes:** as tarefas já ligadas ao post (clicar abre o
    painel da tarefa) e **Gerar tarefas**, que cria uma tarefa por frente
    que ainda falta ("Copy — título do post"), ligada ao post e ao cliente,
    com responsável (o do post, por padrão) e prazo antes da publicação:
    copy 5 dias antes, design e vídeo 3 dias antes, nunca antes de hoje.
    Vêm marcadas as frentes que ainda não têm tarefa. As tarefas aparecem em
    Tarefas, no Hoje e no Calendário como qualquer outra, e o painel delas
    tem "ver post";
  - **histórico e comentários** e **excluir** (com confirmação; as tarefas
    geradas continuam, sem o vínculo).
- **Regra importante:** atrasado é o post cujo dia de publicação já passou
  e que ainda não está programado nem publicado. Falta material é qualquer
  frente com essa situação.

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
| Progresso do projeto | das tarefas ligadas ao projeto, quantas estão concluídas (equipe toda) |
| Próxima entrega | o prazo mais próximo, de hoje em diante, entre as tarefas abertas do projeto (as vencidas contam como atrasadas) |
| Em foco | projetos fixados e abertos (planejado, em andamento ou pausado); em andamento primeiro, depois o prazo mais próximo |
| Prazo do projeto | "Faltam N dias" (laranja a 7 dias ou menos), "Termina hoje", "Prazo passou há N dias" (vermelho) |
| Pedido em aberto | comunicação do tipo Pedido que ainda não virou tarefa |
| Mês de um lançamento | o mês do vencimento |
| Em atraso (financeiro) | venceu antes de hoje, sem data de recebimento/pagamento e não pulado; recorrências contam até 12 meses para trás |
| Previsto do mês | tudo o que vence no mês, menos os meses pulados |
| Receita bruta (faturamento) | receitas de cliente + outras receitas, pela data em que entraram; no mês atual e nos futuros, também o que vence. Aporte de sócio não conta |
| Resultado (DRE) | receita bruta − imposto (alíquota × receita) − taxas do gateway − custos diretos (= margem de contribuição) − custos fixos − outras despesas. DAS pago, pró-labore, aportes e reinvestimentos ficam fora |
| Situação do mês no DRE | Fechado (conferido com o extrato), Realizado (mês passado), Parcial (mês atual: realizado + o que ainda vence), Previsto (futuro: contratos, custos fixos e o que já está lançado) |
| Taxas no DRE | as lançadas; no previsto, a taxa média do gateway dos últimos 12 meses |
| MRR | soma das receitas de cliente que se repetem e valem no mês (mensalidade = MRR do cliente) |
| Margem por cliente | MRR − imposto − taxa média − custos diretos recorrentes do cliente |
| Saldo em conta | saldo inicial + tudo o que entrou − tudo o que saiu (com as taxas), desde o primeiro mês do controle |
| Caixa mínimo | meses de custo fixo (Parâmetros) × custos fixos do mês |
| Divisão do resultado | negativo: nada é dividido e sai do caixa; caixa abaixo do mínimo: tudo para o caixa; depois: caixa %, reinvestimento % e o resto em pró-labore, igual entre os sócios |
| Receita necessária | (sócios × alvo de pró-labore ÷ % do pró-labore + custos fixos) ÷ (1 − imposto − taxa − custo direto %) |
| A receber em atraso | receitas vencidas e não recebidas; por idade: até 30, 31–60, 61–90 e mais de 90 dias |
| Inadimplência | do que venceu no período, quanto segue sem pagamento hoje |
| Fechamento | só meses que já acabaram, em ordem; trava valor, taxa, data de pagamento, categoria e exclusão dos pagos naquele mês |
| Valor do negócio | pontual + mensal × meses do contrato (sem prazo: 12) |
| Chance padrão por etapa | Lead 10%, Contato 20%, Proposta 40%, Negociação 60% |
| Valor ponderado | valor do negócio × chance de fechar |
| Taxa de ganho | ganhos ÷ (ganhos + perdidos) fechados no período |
| Conversão de leads | dos leads que chegaram no período, quantos já foram ganhos |
| Ciclo de venda | média de dias entre a chegada do lead e o ganho |
| Funil | negócios que chegaram no período, contados pela etapa mais longe que alcançaram (um perdido na proposta conta como proposta) |
| Período dos indicadores | mês, trimestre ou ano; o período em andamento soma o realizado e o que vence até o fim dele |
| Variação | em relação ao período anterior ou ao mesmo período do ano passado; verde quando melhora, vermelho quando piora (em custos e atrasos, cair é melhorar) |
| Progresso de um resultado-chave | (atual − base) ÷ (meta − base); base padrão: zero para somas no período, o valor do começo do período para saldos e proporções |
| Situação da meta | comparada ao esperado (fração do período que passou): No ritmo até 10 pontos abaixo, Atenção até 30, Atrasada além disso; Atingida ao chegar a 100% |
| Fee mensal do cliente | soma das receitas que se repetem e estão ativas no mês |
| Recorrência no dia 31 | vence no último dia dos meses mais curtos |
| Histórico | mudanças da mesma pessoa no mesmo item se juntam: até 2 minutos depois de criar entram na criação; edições com menos de 10 minutos entre si viram uma linha |
| Minhas | tarefas em que a pessoa logada é uma das responsáveis |
| "Todos" | tarefa com as três pessoas como responsáveis |
| Pauta da weekly: atrasadas | abertas, com prazo antes de hoje |
| Pauta da weekly: até domingo | abertas, com prazo de hoje até o domingo da semana da reunião |
| Pauta da weekly: concluídas | concluídas desde a reunião anterior (ou nos 7 dias antes) |
| Pauta com cliente | tarefas daquele cliente; "próximas" cobre pelo menos duas semanas |
| Combinado em aberto | se virou tarefa, a tarefa não está concluída; senão, não foi marcado como cumprido |
| Processo para revisar | status "Revisar", ou "Em vigor" com a revisão vencida (última revisão + período) |
| Revisão do cliente (situação) | uma por mês por cliente ativo com revisão mensal; vence no dia escolhido no cadastro (padrão 10). Feita = concluída; Em andamento = começada; "Até dd/mm" = não começada e no prazo; Atrasada = não concluída depois do vencimento |
| Saúde do cliente | a da revisão mais recente que tem saúde marcada; sem nenhuma, "Sem avaliação" |
| Versão de um processo | guardada a cada 30 minutos de edição da mesma pessoa, sempre que outra pessoa edita e sempre que uma versão é restaurada |
| Ordem das listas | prazo mais próximo primeiro; no empate, prioridade alta primeiro e depois a mais antiga |

## 4. Dados e o que dá para editar

| Cadastro | O que tem hoje | Pela interface | Só pelo Supabase |
| --- | --- | --- | --- |
| Pessoas | Jabez, Renatha e Léo | — | criar conta, nome, papel, foto |
| Senhas | temporárias | — | trocar |
| Clientes | Hertmann, Velmont, Hapuck Scents, Boop | criar, editar (responsável, frentes, contato, revisão), desativar, excluir | — |
| Revisões de clientes | uma por cliente e mês | tudo | — |
| Projetos | Estruturação da Boop até 31/10 (o antigo plano, em foco) e os que a equipe criar | tudo (criar com modelo, editar, foco, status, excluir) | — |
| Modelos de projeto | site, identidade visual, social media, tráfego pago, plano interno | usar | criar ou mudar um modelo (código: `src/features/projects/templates.ts`) |
| Tarefas | as 25 do antigo plano e as criadas depois | criar, editar, concluir, excluir | — |
| Visões salvas | as que a equipe criar | criar, atualizar, renomear, excluir | — |
| Decisões | as que a equipe registrar | tudo (inclusive revogar) | — |
| Comunicações | as que a equipe registrar | tudo (inclusive virar tarefa) | — |
| Financeiro | lançamentos e recorrências que a equipe registrar | tudo | — |
| Parâmetros do financeiro | os da planilha (alíquota 6% a confirmar, caixa mínimo de 3 meses, 20% caixa, 10% reinvestimento, 3 sócios, alvo de R$ 5.000) | editar em Financeiro → Parâmetros | — |
| Fechamentos | os meses que a equipe fechar | fechar e reabrir o último | — |
| Negócios | os que a equipe registrar | tudo (inclusive ganhar e perder) | — |
| Posts (Central de Conteúdo) | os que a equipe planejar | tudo (inclusive gerar as tarefas das frentes) | — |
| Metas | os objetivos e resultados-chave que a equipe criar | tudo | — |
| Indicadores | calculados dos dados (nada é digitado) | — | criar um indicador novo (código: `src/features/metrics/catalog.ts`) |
| Histórico | gravado pelo banco desde 07/10/2026 | comentar, editar e apagar os próprios comentários | — |
| Eventos | a reunião semanal | criar, editar, excluir | — |
| Reuniões | registros, assuntos, combinados, resumo e transcrição | tudo | — |
| Processos | documentos, versões e imagens | tudo (versões: ver e restaurar) | — |

Áreas (Comercial, Financeiro, Operação, Marca, Tecnologia, Clientes), status
(A fazer, Fazendo, Feito) e prioridades (Alta, Normal, Baixa) são fixos. Para
mudá-los é preciso alterar o código e o banco.

## 5. Atalhos

| Atalho | O que faz |
| --- | --- |
| Ctrl/⌘ + K | busca geral, em qualquer tela (no editor de processos, cria link) |
| ↑ ↓ e Enter (na busca) | escolhe e abre o resultado |
| N | nova tarefa, em qualquer tela |
| Ctrl/⌘ + Enter | salva a nova tarefa, o novo projeto ou envia o comentário |
| Ctrl/⌘ + B | recolhe ou abre o menu lateral |
| Enter no título (detalhes) | salva o título |
| / (no editor de processos) | menu de blocos: título, lista, checklist, tabela, imagem… |
| Ctrl/⌘ + S (no editor de processos) | salva na hora |

Links de Tarefas com filtros e modo, do Conteúdo com filtros e visão, do
Calendário em uma semana ou mês específicos, do Financeiro (mês, DRE, lançamentos filtrados) e dos
Indicadores num período podem ser salvos nos favoritos (ou, em Tarefas,
como visão salva).

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
- Pessoas só podem ser cadastradas pelo banco (clientes e projetos já têm
  cadastro no portal).
- Tarefas abre em "Todas", enquanto Hoje abre em "Minhas" (uma visão salva
  "Minhas" resolve com um clique).
- Modelos de projeto só mudam pelo código (2.16).
- Quadro: no celular, arrastar pode não funcionar em todos os aparelhos; o
  status também muda pelo painel da tarefa.
- Comentários não têm menção (@pessoa) nem aviso para quem foi citado.
  Decisões ainda não têm comentários na interface (o banco já aceita).
- Financeiro: não emite nota fiscal nem concilia sozinho com o banco (o
  fechamento compara o saldo do extrato informado à mão). O DRE é no regime
  de caixa, como a planilha (não por competência). Valores sempre em reais.
- O financeiro começa no primeiro mês do controle (Parâmetros); os meses da
  planilha só aparecem no portal se forem lançados ou importados.
- Indicadores novos só pelo código (o catálogo é fixo); metas manuais são
  atualizadas à mão.
- O Excel não leva gráficos (os números e as fórmulas, sim); os gráficos
  estão no relatório para apresentar.
- Visões salvas só existem na tela Tarefas.
- Não há atualização em tempo real (2.15).
- A recorrência é só semanal e sempre da série inteira: não dá para pular uma
  segunda de feriado.
- Na visão Mês, clicar no dia não cria evento.
- Eventos não têm participantes, link de reunião nem local.
- A busca geral não procura em eventos do Calendário que não são reuniões nem
  no cadastro dos clientes além do nome (contato e observações ficam de fora).
- Processos: duas pessoas não editam juntas em tempo real (como no Google
  Docs); quem salva por último decide, com o aviso de conflito. Comentários e
  menções nos documentos ainda não existem.
- A tarefa tem só a data do prazo, sem horário.
- Não há lembretes nem avisos (e-mail ou WhatsApp).
- O histórico de alterações começa em 07/10/2026 e não cobre eventos do
  Calendário, reuniões, processos (que têm versões próprias) nem clientes.
- Não há tema escuro.
- **Volume:** cada tela carrega todas as tarefas de uma vez, e o Supabase
  devolve no máximo 1.000 linhas por consulta. Antes de chegar a 1.000
  tarefas, será preciso arquivar ou paginar.
- **Conteúdo:** as telas trazem os posts não publicados, os sem data e os
  publicados nos últimos 6 meses; o calendário não mostra publicados mais
  antigos (o post ainda abre pelo link). Os filtros do Conteúdo ficam no
  endereço, mas ainda não viram "visão salva" do menu (as visões salvas são
  da tela Tarefas). A foto do cliente e as imagens do post chegam com o
  preview do feed.
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
| 2 | ~~"Nova tarefa" já ligada ao plano atual~~ | feito: o plano virou projeto; a tarefa criada no projeto (ou com o filtro de projeto) já vem ligada |
| 3 ★ | Tela "Trocar senha" no menu do usuário | tirar as senhas temporárias sem depender do banco |
| 4 | Criar evento clicando no dia, na visão Mês | menos cliques |
| 5 | ~~Busca por título em Tarefas~~ | feito: a busca geral (Ctrl/⌘ + K) acha tarefas pelo título e pela descrição |
| 6 | ~~Editar decisões~~ | feito: as decisões viraram combinados das Reuniões, editáveis |
| 7 | Definir o término da reunião semanal | já dá para fazer hoje: Calendário → a reunião → Editar |
| 8 | Ativar a proteção contra senhas vazadas no Supabase | aviso do verificador de segurança (confirmar se o plano gratuito permite) |

### Médias (M)

| # | Ideia | Por quê |
| --- | --- | --- |
| 9 | ~~Cadastro de planos dentro do portal~~ | feito: Projetos (o próximo ciclo é um projeto interno com o modelo "Plano interno") |
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
| 17 | ~~Histórico de alterações por tarefa~~ | feito: Atividade na tarefa e no projeto (2.21) |
| 18 | Relatório de fechamento do projeto | revisão de 26/10: o que foi feito e os atrasos por pessoa e área |
| 21 ★ | Menções nos comentários (@Léo) com aviso | o comentário chega a quem precisa agir |
| 22 | ~~Financeiro por cliente ao longo do ano (receita e margem)~~ | feito: margem por cliente (Contratos e custos), recorte por cliente nos relatórios e indicadores |
| 23 | ~~Exportar o financeiro do mês para a contabilidade~~ | feito: Excel por período, com lançamentos, DRE e premissas |
| 24 | Importar a planilha "Financeiro - Boop" (setembro e outubro) | histórico completo no DRE e nos indicadores desde o começo |
| 25 | Integração com o Asaas (recebimentos e taxas automáticos) | sem baixa manual; a taxa entra sozinha |
| 26 | Aviso semanal por e-mail com os indicadores e as metas | a gestão chega sem abrir o portal |
| 19 | Arquivamento ou paginação de tarefas antigas | manter o portal rápido e abaixo do limite de 1.000 linhas |
| 20 | Tema escuro | conforto de uso à noite |

## 9. Onde mexer (mapa do código)

| Assunto | Arquivos |
| --- | --- |
| Tela Hoje (indicadores, quadros de reunião, combinados e processos) | `src/features/today/` (`dashboard-cards.tsx`), `src/app/(app)/hoje/page.tsx` |
| Busca geral (Ctrl/⌘ + K) | `src/features/search/` (`actions.ts` busca, `command-palette.tsx` janela), `src/hooks/use-url-trigger.ts` (`?novo=`) |
| Tarefas (lista, tabela, quadro, filtros, linha) | `src/features/tasks/tasks-view.tsx`, `task-table.tsx`, `task-board.tsx`, `filters.ts`, `task-row.tsx` |
| Visões salvas | `src/features/views/` |
| Projetos (lista, página, modelos, progresso) | `src/features/projects/` (`templates.ts` modelos, `logic.ts` regras), `src/app/(app)/projetos/` |
| Histórico e comentários | `src/features/activity/` (`logic.ts` frases), triggers em `supabase/migrations/20261007144504_activity.sql` |
| Decisões | `src/features/decisions/`, `src/app/(app)/decisoes/` |
| Comunicações | `src/features/communications/`, `src/app/(app)/comunicacoes/` |
| Financeiro (meses, recorrências, atrasados, categorias) | `src/features/finance/` (`logic.ts` regras, `money.ts` valores), `src/app/(app)/financeiro/` |
| Gestão financeira (DRE, MRR, projeção, divisão, receita necessária, fechamento) | `src/features/finance/management.ts`; abas em `src/features/finance/*-view.tsx` |
| Comercial (funil, negócios, ganhar) | `src/features/deals/` (`logic.ts` regras), função `win_deal` em `supabase/migrations/20261007212513_win_deal.sql` |
| Central de Conteúdo (calendário, quadro, 7 dias, post, tarefas das frentes) | `src/features/content/` (`logic.ts` regras, `filters.ts` URL, `post-dialog.tsx` post), `src/app/(app)/conteudo/` |
| Indicadores (catálogo, períodos, painéis) | `src/features/metrics/` (`catalog.ts` cada KPI e sua fórmula) |
| Metas (OKRs) | `src/features/goals/` (`logic.ts` progresso e sugestões) |
| Relatório e Excel | `src/features/reports/`, `src/lib/xlsx.ts`, `src/app/api/relatorios/excel/route.ts`, `src/app/relatorio/` |
| Gráficos | `src/components/charts/`, `src/components/kpi-tile.tsx` |
| Detalhes e nova tarefa | `src/features/tasks/task-sheet.tsx`, `new-task-dialog.tsx` |
| Regras (grupos, progresso, pauta) | `src/features/tasks/logic.ts`, `src/features/meetings/logic.ts` |
| Calendário | `src/features/calendar/` |
| Reuniões | `src/features/meetings/`, `src/app/(app)/reunioes/` |
| Processos (lista, editor, modelos, versões) | `src/features/docs/`, `src/app/(app)/processos/`, `src/app/api/arquivos/` |
| Clientes e revisões (checklist padrão, frentes sugeridas) | `src/features/clients/` (`logic.ts`), `src/app/(app)/clientes/` |
| Modelos e sugestões de documentos | `src/features/docs/templates.ts` |
| Login e sessão | `src/features/auth/`, `src/proxy.ts` |
| Menu lateral e cabeçalhos | `src/components/layout/` |
| Cores e fontes | `src/app/globals.css`, `src/app/layout.tsx` |
| Nomes de status, áreas e tipos | `src/lib/labels.ts` |
| Datas e fuso | `src/lib/dates.ts` |
| Banco (tabelas e segurança) | `supabase/migrations/`, `supabase/seed.sql` |
