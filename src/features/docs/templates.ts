import { formatMonthYear } from "@/lib/dates"
import type { DateKey, DocKind, TaskArea } from "@/lib/types"

/**
 * Modelos de documento (blocos do BlockNote em formato parcial: o editor
 * completa ids e propriedades) e sugestões do que documentar primeiro.
 * Textos de orientação ficam em cinza e itálico: é só escrever por cima.
 *
 * Os modelos "do cliente" (persona, identidades, estratégia, stories,
 * relatório) trazem para os Processos os arquivos do modelo de social media
 * do Notion: pedem o cliente, começam na área Clientes e aparecem como
 * atalhos na página do cliente.
 */

type Inline = string | { type: "text"; text: string; styles: Record<string, string | boolean> }[]
export type TemplateBlock = {
  type: string
  props?: Record<string, unknown>
  content?: Inline | Record<string, unknown>
  children?: TemplateBlock[]
}

const h2 = (text: string): TemplateBlock => ({ type: "heading", props: { level: 2 }, content: text })
const h3 = (text: string): TemplateBlock => ({ type: "heading", props: { level: 3 }, content: text })
const p = (text: string): TemplateBlock => ({ type: "paragraph", content: text })
const hint = (text: string): TemplateBlock => ({
  type: "paragraph",
  content: [{ type: "text", text, styles: { italic: true, textColor: "gray" } }],
})
const bullet = (text: string): TemplateBlock => ({ type: "bulletListItem", content: text })
const step = (text: string): TemplateBlock => ({ type: "numberedListItem", content: text })
const check = (text: string): TemplateBlock => ({ type: "checkListItem", props: { checked: false }, content: text })
const table = (rows: string[][]): TemplateBlock => ({
  type: "table",
  content: { type: "tableContent", headerRows: 1, rows: rows.map((cells) => ({ cells })) },
})

export type TemplateId =
  | "blank"
  | "process"
  | "checklist"
  | "policy"
  | "guide"
  | "onboarding"
  | "persona"
  | "verbal_identity"
  | "visual_identity"
  | "monthly_strategy"
  | "stories_plan"
  | "monthly_report"

export interface DocTemplate {
  id: TemplateId
  kind: DocKind
  label: string
  description: string
  blocks: () => TemplateBlock[]
  /** Documento de um cliente: pede o cliente e começa na área Clientes. */
  client?: boolean
  /** Base do título sugerido para o documento do cliente (padrão: o nome do modelo). */
  titleBase?: string
  /** Documento de um mês: o título sugerido leva o mês. */
  monthly?: boolean
  /** "Para que serve" do documento criado. */
  summary?: string
  /** Revisão periódica em meses (null: sem revisão). Sem valor, a do tipo. */
  reviewEveryMonths?: number | null
}

export const TEMPLATES: DocTemplate[] = [
  {
    id: "process",
    kind: "process",
    label: "Processo passo a passo",
    description: "Objetivo, quando usar, quem faz, passos e o que conferir no fim.",
    blocks: () => [
      h2("Objetivo"),
      hint("Em uma frase: o que este processo garante e por que ele existe."),
      h2("Quando usar"),
      bullet("Ex.: sempre que um cliente novo assina o contrato."),
      h2("Quem faz"),
      bullet("Responsável:"),
      bullet("Apoio:"),
      h2("Passo a passo"),
      step(""),
      step(""),
      step(""),
      h2("Antes de dar como pronto"),
      check(""),
      check(""),
      h2("Ferramentas e links"),
      bullet(""),
      h2("Dúvidas comuns"),
      hint("Perguntas que sempre aparecem e as respostas combinadas."),
    ],
  },
  {
    id: "checklist",
    kind: "checklist",
    label: "Checklist",
    description: "Lista de itens para conferir. Vira tarefas com um clique.",
    blocks: () => [
      hint(
        "Para executar: “Gerar tarefas” transforma os itens em tarefas, com responsável e prazo (o documento continua como modelo)."
      ),
      check(""),
      check(""),
      check(""),
      check(""),
    ],
  },
  {
    id: "policy",
    kind: "policy",
    label: "Política",
    description: "Uma regra combinada: o que vale, exceções e quem decide.",
    blocks: () => [
      h2("Objetivo"),
      hint("Por que esta regra existe."),
      h2("A regra"),
      p(""),
      h2("Exceções"),
      bullet(""),
      h2("Quem aprova exceções"),
      p(""),
      h2("Vigência"),
      hint("Em vigor desde quando e quando revisar."),
    ],
  },
  {
    id: "guide",
    kind: "guide",
    label: "Guia",
    description: "Referência para consultar: visão geral, como fazer e links.",
    blocks: () => [
      h2("Visão geral"),
      p(""),
      h2("Como fazer"),
      p(""),
      h2("Boas práticas"),
      bullet(""),
      h2("Links úteis"),
      bullet(""),
    ],
  },
  {
    id: "onboarding",
    kind: "checklist",
    label: "Onboarding de cliente",
    description: "Do contrato assinado à primeira entrega, item por item.",
    blocks: () => onboardingBlocks(),
  },
  {
    id: "blank",
    kind: "process",
    label: "Em branco",
    description: "Começar do zero.",
    blocks: () => [],
  },
  {
    id: "persona",
    kind: "guide",
    client: true,
    label: "Estudo de persona",
    description: "Quem é o público: dores, sonhos, crenças e o diário de perguntas.",
    summary: "Quem é o público do cliente e como a comunicação se conecta com ele.",
    blocks: () => personaBlocks(),
  },
  {
    id: "verbal_identity",
    kind: "guide",
    client: true,
    label: "Identidade verbal",
    description: "Personalidade, tom de voz, vocabulário e exemplos.",
    summary: "Como a marca do cliente fala: personalidade, tom de voz e vocabulário.",
    blocks: () => verbalIdentityBlocks(),
  },
  {
    id: "visual_identity",
    kind: "guide",
    client: true,
    label: "Identidade visual e moodboard",
    description: "Logo, cores, tipografia, fotografia, feed e referências.",
    summary: "Logo, cores, tipografia e as referências visuais da marca do cliente.",
    blocks: () => visualIdentityBlocks(),
  },
  {
    id: "monthly_strategy",
    kind: "guide",
    client: true,
    monthly: true,
    label: "Estratégia de conteúdo do mês",
    titleBase: "Estratégia de conteúdo",
    description: "Objetivo, datas, pilares, formatos, ideias e metas do mês.",
    summary: "O plano de conteúdo do mês: objetivo, temas, formatos e metas.",
    reviewEveryMonths: null,
    blocks: () => monthlyStrategyBlocks(),
  },
  {
    id: "stories_plan",
    kind: "guide",
    client: true,
    label: "Planejamento de stories",
    description: "Ritual diário, o que mostrar, cronograma e diferenciais.",
    summary: "A rotina de stories do cliente: ritual diário, temas da semana e diferenciais.",
    reviewEveryMonths: 3,
    blocks: () => storiesPlanBlocks(),
  },
  {
    id: "monthly_report",
    kind: "guide",
    client: true,
    monthly: true,
    label: "Relatório do mês",
    titleBase: "Relatório",
    description: "Resultados, destaques, próximos passos e o link do relatório.",
    summary: "Resultados do mês, destaques e próximos passos combinados.",
    reviewEveryMonths: null,
    blocks: () => monthlyReportBlocks(),
  },
]

export function templateById(id: unknown): DocTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id)
}

/** Modelos gerais (processo, checklist, política, guia…) e os do cliente. */
export const GENERAL_TEMPLATES = TEMPLATES.filter((template) => !template.client)
export const CLIENT_TEMPLATES = TEMPLATES.filter((template) => template.client)

/**
 * Título sugerido para um documento do cliente: "Estudo de persona —
 * Hertmann"; nos mensais, com o mês ("Relatório de outubro de 2026 —
 * Hertmann").
 */
export function clientDocTitle(template: DocTemplate, clientName: string, today: DateKey): string {
  const base = template.titleBase ?? template.label
  const month = template.monthly ? ` de ${formatMonthYear(today).toLocaleLowerCase("pt-BR")}` : ""
  return `${base}${month} — ${clientName.trim()}`.slice(0, 200)
}

/* ------------------------------------------------------------------ */
/* Modelos do cliente                                                  */
/* ------------------------------------------------------------------ */

function personaBlocks(): TemplateBlock[] {
  return [
    hint("Uma persona por documento. Escreva como se fosse uma pessoa de verdade e confirme com o diário de perguntas."),
    h2("Nome fictício"),
    hint("Como a equipe chama essa pessoa (ex.: Ana, a empreendedora sem tempo)."),
    p(""),
    h2("Quem é"),
    hint("Idade, profissão, onde vive, rotina, família, renda."),
    p(""),
    h2("Características"),
    bullet(""),
    bullet(""),
    bullet(""),
    h2("Dores"),
    hint("O que incomoda, o que tira o sono e o que já tentou para resolver."),
    bullet(""),
    bullet(""),
    h2("Sonhos"),
    hint("Onde quer chegar e como seria a vida com o problema resolvido."),
    bullet(""),
    bullet(""),
    h2("Crenças"),
    hint("O que acredita sobre o problema, sobre a solução e sobre marcas como esta."),
    bullet(""),
    bullet(""),
    h2("Conexão com a comunicação"),
    hint("Como a marca fala com ela: temas, tom, formatos e o que evitar."),
    bullet(""),
    bullet(""),
    h2("Diário de perguntas"),
    hint("Roteiro para conversar com clientes reais e validar a persona. Anote as respostas abaixo de cada pergunta."),
    step("Como é um dia normal seu, do acordar ao dormir?"),
    step("Qual é o maior desafio hoje em relação a [tema do cliente]?"),
    step("O que você já tentou para resolver? O que funcionou e o que não funcionou?"),
    step("Como seria a sua vida se esse problema estivesse resolvido?"),
    step("Onde você busca informação sobre isso (perfis, sites, pessoas)?"),
    step("O que faz você confiar, ou desconfiar, de uma marca?"),
    step("O que faria você comprar hoje? E o que faria você desistir?"),
    step("Que tipo de conteúdo você salva ou manda para alguém?"),
  ]
}

function verbalIdentityBlocks(): TemplateBlock[] {
  return [
    h2("Essência"),
    hint("Em uma frase: quem a marca é e por que existe."),
    p(""),
    h2("Personalidade"),
    hint("De três a cinco adjetivos (ex.: acolhedora, direta, bem-humorada)."),
    bullet(""),
    bullet(""),
    bullet(""),
    h2("Tom de voz"),
    table([
      ["Situação", "Tom", "Exemplo"],
      ["Post do feed", "", ""],
      ["Stories", "", ""],
      ["Comentários e direct", "", ""],
      ["Reclamação", "", ""],
    ]),
    h2("Somos"),
    bullet(""),
    h2("Não somos"),
    bullet(""),
    h2("Vocabulário"),
    h3("Palavras e expressões que usamos"),
    bullet(""),
    h3("Palavras que evitamos"),
    bullet(""),
    h2("Como escrevemos"),
    bullet("Pessoa (você, a gente, nós):"),
    bullet("Emojis:"),
    bullet("Hashtags:"),
    bullet("Chamada para ação padrão:"),
    h2("Exemplos"),
    h3("Assim"),
    p(""),
    h3("Assim não"),
    p(""),
  ]
}

function visualIdentityBlocks(): TemplateBlock[] {
  return [
    h2("Logo"),
    bullet("Versões (principal, reduzida, monocromática):"),
    bullet("Área de respiro e tamanho mínimo:"),
    bullet("Arquivos:"),
    h2("Cores"),
    table([
      ["Cor", "Código (HEX)", "Onde usar"],
      ["Principal", "", ""],
      ["Secundária", "", ""],
      ["Apoio", "", ""],
    ]),
    h2("Tipografia"),
    bullet("Títulos:"),
    bullet("Textos:"),
    bullet("Destaques:"),
    h2("Elementos gráficos"),
    hint("Ícones, formas, texturas, grafismos e molduras."),
    p(""),
    h2("Fotografia"),
    hint("Luz, enquadramento, cenários, pessoas e o que evitar."),
    p(""),
    h2("Moodboard"),
    hint("Cole aqui as imagens de referência (colar, arrastar ou “/imagem”) e anote o que cada uma inspira."),
    p(""),
    h2("Feed"),
    hint("Como o grid deve ficar: ritmo de cores, alternância de formatos, capas de reels e carrosséis."),
    p(""),
    h2("Links"),
    bullet("Pasta da marca no Drive:"),
    bullet("Templates (Canva, Figma):"),
  ]
}

function monthlyStrategyBlocks(): TemplateBlock[] {
  return [
    hint("Um documento por mês. Preencha antes de montar o cronograma no Conteúdo."),
    h2("Objetivo do mês"),
    hint("O que o conteúdo precisa gerar neste mês (ex.: vendas do lançamento, seguidores, autoridade)."),
    p(""),
    h2("Datas e campanhas"),
    table([
      ["Data", "O quê", "Ação de conteúdo"],
      ["", "", ""],
      ["", "", ""],
    ]),
    h2("Pilares e temas"),
    table([
      ["Intenção", "Pilar", "Temas do mês"],
      ["Conversão", "", ""],
      ["Crescimento", "", ""],
      ["Autoridade", "", ""],
      ["Conexão", "", ""],
    ]),
    h2("Formatos e frequência"),
    hint("Quantos por semana e em que dias."),
    bullet("Reels:"),
    bullet("Carrosséis:"),
    bullet("Estáticos:"),
    bullet("Stories:"),
    h2("Ideias escolhidas"),
    hint("Puxe do banco de ideias do cliente (Conteúdo → Ideias) e liste aqui as que entram no mês."),
    bullet(""),
    h2("Metas e como medir"),
    bullet("Alcance:"),
    bullet("Engajamento:"),
    bullet("Seguidores:"),
    bullet("Cliques ou vendas:"),
    h2("Aprovação"),
    check("Estratégia apresentada ao cliente"),
    check("Cronograma do mês montado no Conteúdo"),
  ]
}

function storiesPlanBlocks(): TemplateBlock[] {
  return [
    h2("Ritual diário"),
    hint("A sequência que se repete todo dia (ex.: bom dia → bastidor → dica → caixinha → oferta)."),
    table([
      ["Momento", "O que postar", "Formato"],
      ["Manhã", "", ""],
      ["Tarde", "", ""],
      ["Noite", "", ""],
    ]),
    h2("O que mostrar"),
    bullet("Bastidores:"),
    bullet("Produto ou serviço em uso:"),
    bullet("Clientes e depoimentos:"),
    bullet("Rotina e pessoas da marca:"),
    h2("O que não mostrar"),
    bullet(""),
    h2("Cronograma da semana"),
    table([
      ["Dia", "Tema", "Interação (enquete, caixinha, quiz)"],
      ["Segunda", "", ""],
      ["Terça", "", ""],
      ["Quarta", "", ""],
      ["Quinta", "", ""],
      ["Sexta", "", ""],
      ["Sábado", "", ""],
      ["Domingo", "", ""],
    ]),
    h2("Diferenciais"),
    hint("O que a marca tem que ninguém tem e precisa aparecer nos stories toda semana."),
    bullet(""),
    bullet(""),
    h2("Destaques do perfil"),
    hint("Quais destaques existem e o que entra em cada um."),
    bullet(""),
  ]
}

function monthlyReportBlocks(): TemplateBlock[] {
  return [
    hint("Um documento por mês. Os números vêm das redes e dos anúncios; o relatório completo fica no link."),
    h2("Resultados"),
    table([
      ["Indicador", "Mês anterior", "Este mês", "Variação"],
      ["Alcance", "", "", ""],
      ["Engajamento", "", "", ""],
      ["Seguidores", "", "", ""],
      ["Posts publicados", "", "", ""],
      ["Cliques ou vendas", "", "", ""],
    ]),
    h2("Destaques"),
    hint("Os três conteúdos que mais funcionaram e por quê."),
    step(""),
    step(""),
    step(""),
    h2("O que não funcionou"),
    bullet(""),
    h2("Próximos passos"),
    hint("“Gerar tarefas” transforma estes itens em tarefas do cliente."),
    check(""),
    check(""),
    check(""),
    h2("Relatório completo"),
    bullet("Link:"),
  ]
}

function onboardingBlocks(): TemplateBlock[] {
  return [
    hint("Use para cada cliente novo. “Gerar tarefas” cria as tarefas já com o cliente."),
    h2("Antes do kickoff"),
    check("Contrato assinado e primeira fatura emitida"),
    check("Pasta do cliente criada no Drive"),
    check("Acessos recebidos: redes sociais, gerenciador de anúncios, site"),
    check("Briefing preenchido pelo cliente"),
    check("Responsável da Boop definido"),
    h2("Kickoff"),
    check("Reunião de kickoff marcada no Calendário (com o cliente)"),
    check("Objetivos e metas dos primeiros 90 dias combinados"),
    check("Canal de comunicação e prazos de aprovação combinados"),
    h2("Primeiras entregas"),
    check("Cronograma do primeiro mês aprovado"),
    check("Data do primeiro relatório combinada"),
    h2("Observações"),
    hint("O que é específico deste cliente."),
  ]
}

/* ------------------------------------------------------------------ */
/* Sugestões para começar                                              */
/* ------------------------------------------------------------------ */

export interface DocSuggestion {
  title: string
  summary: string
  area: TaskArea
  kind: DocKind
  pinned?: boolean
  blocks: () => TemplateBlock[]
}

export const SUGGESTIONS: DocSuggestion[] = [
  {
    title: "Como funciona a Boop",
    summary: "Serviços, quem faz o quê, rituais e ferramentas. Comece por aqui.",
    area: "operations",
    kind: "guide",
    pinned: true,
    blocks: () => [
      h2("O que a Boop faz"),
      hint("Serviços que vendemos, para quem e o que não fazemos."),
      h2("Quem faz o quê"),
      table([
        ["Pessoa", "Responsável por", "Apoia em"],
        ["Jabez", "", ""],
        ["Renatha", "", ""],
        ["Léo", "", ""],
      ]),
      h2("Rituais"),
      bullet("Weekly: toda segunda, 07:00 (veja “Rotina da weekly”)"),
      bullet("Revisão mensal de cada cliente ativo"),
      h2("Ferramentas"),
      bullet("Boop Admin: tarefas, reuniões, processos e clientes"),
      bullet(""),
    ],
  },
  {
    title: "Rotina da weekly",
    summary: "Como preparamos, conduzimos e registramos a reunião de segunda.",
    area: "operations",
    kind: "process",
    blocks: () => [
      h2("Objetivo"),
      p("Alinhar a semana em até uma hora: o que foi feito, o que está atrasado e o que fica combinado."),
      h2("Antes (até domingo)"),
      check("Cada um atualiza as próprias tarefas no Boop Admin"),
      check("Assuntos novos entram na pauta: Reuniões → próxima weekly → “Algo para discutir?”"),
      h2("Durante (segunda, 07:00)"),
      step("Combinados anteriores: o que foi cumprido e o que segue em aberto"),
      step("Tarefas por pessoa: atrasadas, até domingo e o que foi concluído"),
      step("Assuntos da pauta"),
      step("Registrar os combinados com responsável e prazo (e virar tarefa quando fizer sentido)"),
      h2("Depois"),
      check("Colar a transcrição na página da reunião"),
      check("Escrever um resumo curto"),
      check("Encerrar a reunião (a pauta fica guardada no histórico)"),
    ],
  },
  {
    title: "Onboarding de cliente",
    summary: "Do contrato assinado à primeira entrega.",
    area: "clients",
    kind: "checklist",
    blocks: () => onboardingBlocks(),
  },
  {
    title: "Aprovação de conteúdo com o cliente",
    summary: "Prazos, canal e quantas rodadas de ajuste.",
    area: "clients",
    kind: "process",
    blocks: () => [
      h2("Objetivo"),
      hint("Como mandamos conteúdo para aprovação e o que fazer quando o cliente atrasa."),
      h2("Prazos"),
      bullet("Envio para aprovação:"),
      bullet("Prazo de resposta do cliente:"),
      bullet("Rodadas de ajuste incluídas:"),
      h2("Passo a passo"),
      step(""),
      step(""),
      h2("Se o cliente não responder"),
      p(""),
    ],
  },
  {
    title: "Relatório mensal do cliente",
    summary: "O que entra, de onde vêm os números e quando enviar.",
    area: "clients",
    kind: "checklist",
    blocks: () => [
      hint("Enviar até o 5º dia útil do mês."),
      h2("Coleta"),
      check("Números das redes (alcance, engajamento, seguidores)"),
      check("Resultados de anúncios (investimento, custo por resultado)"),
      check("Comparação com o mês anterior"),
      h2("Análise"),
      check("Três destaques do mês"),
      check("O que não funcionou e o que muda"),
      check("Próximos passos combinados"),
      h2("Envio"),
      check("Revisado por outra pessoa da equipe"),
      check("Enviado e registrado na página do cliente"),
    ],
  },
  {
    title: "Proposta comercial",
    summary: "Do primeiro contato ao envio da proposta.",
    area: "commercial",
    kind: "process",
    blocks: () => [
      h2("Objetivo"),
      hint("Como qualificamos um contato e montamos a proposta."),
      h2("Passo a passo"),
      step("Conversa de diagnóstico"),
      step("Escopo e preço (tabela de pacotes)"),
      step("Proposta enviada em até X dias"),
      step("Follow-up"),
      h2("Modelo e links"),
      bullet(""),
    ],
  },
  {
    title: "Faturamento e cobrança",
    summary: "Emissão de nota, vencimentos e o que fazer com atrasos.",
    area: "finance",
    kind: "process",
    blocks: () => [
      h2("Calendário"),
      table([
        ["Quando", "O quê", "Quem"],
        ["", "Emitir notas", ""],
        ["", "Conferir pagamentos", ""],
        ["", "Cobrar atrasos", ""],
      ]),
      h2("Atrasos"),
      step("Lembrete amigável no dia seguinte ao vencimento"),
      step(""),
    ],
  },
  {
    title: "Tom de voz da Boop",
    summary: "Como a Boop escreve e fala com clientes e nas redes.",
    area: "brand",
    kind: "guide",
    blocks: () => [
      h2("Somos"),
      bullet(""),
      h2("Não somos"),
      bullet(""),
      h2("Exemplos"),
      h3("Assim"),
      p(""),
      h3("Assim não"),
      p(""),
    ],
  },
  {
    title: "Acessos e ferramentas",
    summary: "Onde ficam os acessos de cada ferramenta (sem senhas aqui).",
    area: "technology",
    kind: "guide",
    blocks: () => [
      hint("Não guarde senhas aqui: aponte para o gerenciador de senhas."),
      table([
        ["Ferramenta", "Para que serve", "Onde está o acesso", "Responsável"],
        ["", "", "", ""],
        ["", "", "", ""],
      ]),
    ],
  },
  {
    title: "Prazos e retrabalho",
    summary: "Quanto tempo leva cada entrega e o que conta como ajuste.",
    area: "operations",
    kind: "policy",
    blocks: () => [
      h2("Prazos padrão"),
      table([
        ["Entrega", "Prazo", "Rodadas de ajuste"],
        ["Post", "", ""],
        ["Vídeo", "", ""],
        ["Site", "", ""],
      ]),
      h2("O que conta como ajuste"),
      bullet(""),
      h2("O que é pedido novo"),
      bullet(""),
    ],
  },
]
