import type { DocKind, TaskArea } from "@/lib/types"

/**
 * Modelos de documento (blocos do BlockNote em formato parcial: o editor
 * completa ids e propriedades) e sugestões do que documentar primeiro.
 * Textos de orientação ficam em cinza e itálico: é só escrever por cima.
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

export type TemplateId = "blank" | "process" | "checklist" | "policy" | "guide" | "onboarding"

export interface DocTemplate {
  id: TemplateId
  kind: DocKind
  label: string
  description: string
  blocks: () => TemplateBlock[]
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
]

export function templateById(id: unknown): DocTemplate | undefined {
  return TEMPLATES.find((template) => template.id === id)
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
