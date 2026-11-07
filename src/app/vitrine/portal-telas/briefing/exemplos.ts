import { buildSteps, colorsOf, EMPTY_ANSWER, parseOptions, type FlowAnswer, type FlowBlock, type FlowData, type QuestionKind } from "@/features/briefing/flow-logic"
import { addBusinessDays } from "@/lib/dates"
import type { DateKey } from "@/lib/types"

/*
 * Briefing de exemplo para a vitrine: uma parte do formulário v1 (os mesmos
 * textos da migration) e respostas de mentira. Nada vem do banco.
 */

const question = (key: string, kind: QuestionKind, text: string, hint: string, options: unknown = {}, required = true) => ({
  id: `q-${key}`,
  key,
  text,
  hint,
  kind,
  options: parseOptions(options),
  required,
})

const BLOCKS: FlowBlock[] = [
  {
    id: "b0",
    title: "Pra começar",
    description: "Confere se a gente anotou tudo certinho.",
    estimated_minutes: 1,
    questions: [
      question("identification", "identification", "Esses dados estão certos?", "A gente já preencheu com o que você contou. Ajusta o que precisar.", {
        fields: [
          { key: "brand_name", label: "Nome da marca" },
          { key: "contact_name", label: "Quem responde pela marca" },
          { key: "region", label: "Cidade ou região que vocês atendem" },
          { key: "instagram", label: "@ do Instagram" },
          { key: "site", label: "Site (se tiver)" },
        ],
      }),
    ],
  },
  {
    id: "b1",
    title: "Negócio e prioridades",
    description: "O que você vende e o que precisa vender mais agora.",
    estimated_minutes: 6,
    questions: [
      question("brand_age", "choice", "Há quanto tempo a marca existe?", "Conta desde quando você começou a vender, mesmo que informal.", {
        choices: [
          { value: "starting", label: "Começando agora" },
          { value: "up_to_1y", label: "Até 1 ano" },
          { value: "1_3y", label: "De 1 a 3 anos" },
          { value: "3_10y", label: "De 3 a 10 anos" },
          { value: "over_10y", label: "Mais de 10 anos" },
        ],
      }),
      question(
        "offer",
        "audio",
        "O que você vende? Fala dos principais produtos ou serviços.",
        "Ex.: “Bolos de festa sob encomenda, doces finos pra casamento e uma linha de pote pra pronta entrega.”"
      ),
      question("average_ticket", "number", "Quanto o cliente gasta, em média, por compra?", "Um valor aproximado já ajuda. Ex.: R$ 180.", { unit: "BRL", placeholder: "180,00" }, false),
      question("discovery", "multiple", "Como as pessoas descobrem a sua marca?", "Marca até duas, as que mais trazem gente.", {
        max: 2,
        other: true,
        choices: [
          { value: "client_referral", label: "Indicação de clientes" },
          { value: "google", label: "Google ou Maps" },
          { value: "organic_social", label: "Redes sociais, sem anúncio" },
          { value: "paid_ads", label: "Anúncios pagos" },
          { value: "walk_in", label: "Passam em frente" },
          { value: "partner_referral", label: "Indicação de parceiros" },
          { value: "unknown", label: "Não sei" },
        ],
        extras: [{ key: "share", kind: "short_text", label: "Se souber, quanto vem de cada um?", placeholder: "Ex.: 70% indicação, 30% Instagram" }],
      }),
      question("sales_channel", "choice", "Onde a compra ou o agendamento costuma acontecer?", "O lugar onde o “fechado!” acontece.", {
        other: true,
        choices: [
          { value: "whatsapp", label: "WhatsApp" },
          { value: "direct", label: "Direct do Instagram" },
          { value: "site", label: "Site ou loja virtual" },
          { value: "in_person", label: "Presencial" },
          { value: "phone", label: "Telefone" },
        ],
      }),
    ],
  },
  {
    id: "b2",
    title: "Quem compra",
    description: "Quem é o seu cliente e como ele decide.",
    estimated_minutes: 5,
    questions: [
      question(
        "dream_client",
        "audio",
        "Qual cliente você adoraria atender de novo? O que ele comprou, o que valorizou, por que repetiria?",
        "Pensa numa pessoa de verdade. Ex.: “A Júlia, que fez o bolo do casamento e voltou pro chá de bebê.”",
        { voice: "essential" }
      ),
    ],
  },
  {
    id: "b4",
    title: "Como a marca fala",
    description: "O jeito de falar que tem a sua cara.",
    estimated_minutes: 4,
    questions: [
      question("brand_tone", "cards", "Quais dessas aberturas você publicaria? Se marcar duas, qual é a principal?", "Lê como se fosse o primeiro post da sua marca. Assim sim ou assim não?", {
        max: 2,
        primary: true,
        cards: [
          { value: "challenging", label: "Desafiadora", description: "Provoca e tira da zona de conforto.", example: "Se o seu bolo é igual ao da padaria, por que alguém pagaria mais por ele?" },
          { value: "calm", label: "Calma", description: "Explica sem pressa, passa tranquilidade.", example: "Escolher o bolo da festa pode ser simples. A gente te mostra como, passo a passo." },
          { value: "warm", label: "Acolhedora", description: "Abraça, cuida, entende a pessoa.", example: "Sabe aquele dia em que tudo precisa dar certo? A gente cuida do doce pra você cuidar do resto." },
          { value: "close", label: "Próxima", description: "Fala como amiga, de igual pra igual.", example: "Conta aqui: você também já comeu o recheio antes de montar o bolo?" },
          { value: "playful", label: "Bem-humorada", description: "Leve, com piada e graça.", example: "Dieta começa segunda. Hoje é sábado e tem brigadeiro saindo do forno." },
          { value: "direct", label: "Direta", description: "Vai ao ponto, sem rodeio.", example: "Bolo de festa por encomenda. Pedido com 5 dias de antecedência. Chama no WhatsApp." },
          { value: "technical", label: "Técnica", description: "Mostra o porquê, com detalhe e dado.", example: "Por que o chocolate 54% deixa o ganache mais estável no calor? A temperatura explica." },
          { value: "formal", label: "Formal", description: "Elegante e cuidadosa com as palavras.", example: "Apresentamos a nova coleção de doces finos para casamentos, com degustação agendada." },
        ],
        extras: [{ key: "own_opening", kind: "short_text", label: "Ou escreve uma abertura do seu jeito", placeholder: "Ex.: Hoje tem fornada nova…" }],
      }),
    ],
  },
  {
    id: "b6",
    title: "Referências e materiais",
    description: "Tudo opcional. O que tiver à mão já ajuda.",
    estimated_minutes: 3,
    questions: [
      question("competitors", "links", "Com quem seus clientes costumam comparar a sua marca?", "Um ou dois @ já bastam.", { max: 2, placeholder: "@concorrente" }, false),
      question(
        "identity",
        "upload",
        "Logo, fontes, paleta ou manual. Se a identidade está em aberto, quais cores você quer usar ou evitar?",
        "Arrasta os arquivos ou tira uma foto. Pra cores, toca na paleta.",
        { accept: ["image/*", "application/pdf"], extras: [{ key: "palette", kind: "palette", label: "Cores pra usar ou evitar" }] },
        false
      ),
    ],
  },
]

const IDENTIFICATION = { brand_name: "Café Aurora", contact_name: "Marina Lopes", region: "Curitiba e região", instagram: "@cafeaurora", site: "" }

const answered = (patch: Partial<FlowAnswer>): FlowAnswer => ({ ...EMPTY_ANSWER, ...patch })

/** Respostas de quem já passou da primeira etapa. */
const PROGRESS: Record<string, FlowAnswer> = {
  "q-identification": answered({ value: { ...IDENTIFICATION } }),
  "q-brand_age": answered({ value: { choice: "3_10y" } }),
  "q-offer": answered({ audios: [{ id: "demo-audio-1", duration_ms: 74000, created_at: "2026-11-07T15:00:00Z" }] }),
  "q-average_ticket": answered({ skipped: true }),
  "q-discovery": answered({ value: { choices: ["client_referral"] } }),
  "q-sales_channel": answered({ value: { choice: "whatsapp" } }),
}

export type BriefingScreen = "inicio" | "audio" | "escolha" | "tom" | "cores" | "etapa" | "envio" | "obrigado"

export const BRIEFING_SCREENS: { value: BriefingScreen; title: string; text: string }[] = [
  { value: "inicio", title: "Briefing: boas-vindas", text: "As etapas com o tempo de cada uma e o prazo." },
  { value: "audio", title: "Briefing: pergunta aberta", text: "Áudio em destaque, já gravado, e o “prefiro escrever”." },
  { value: "escolha", title: "Briefing: escolha", text: "Até duas opções, com o complemento opcional." },
  { value: "tom", title: "Briefing: tom de voz", text: "Os 8 cards com abertura de post, assim sim ou assim não." },
  { value: "cores", title: "Briefing: materiais e cores", text: "Upload (arrastar ou foto) e a paleta clicável." },
  { value: "etapa", title: "Briefing: etapa concluída", text: "O fechamento da etapa com o card Sua marca." },
  { value: "envio", title: "Briefing: revisar e enviar", text: "As puladas marcadas para a reunião e o envio." },
  { value: "obrigado", title: "Briefing: obrigado", text: "Depois de enviar, o portal abre." },
]

export function isBriefingScreen(value: unknown): value is BriefingScreen {
  return BRIEFING_SCREENS.some((screen) => screen.value === value)
}

/** Os dados e a tela inicial de cada tela da vitrine. */
export function briefingExample(screen: BriefingScreen, today: DateKey): { data: FlowData; startAt: number } {
  const steps = buildSteps(BLOCKS)
  const at = (key: string) => steps.findIndex((step) => step.type === "question" && step.question.key === key)
  const base: FlowData = {
    briefingId: "demo",
    clientId: "demo",
    status: "in_progress",
    dueOn: addBusinessDays(today, 4),
    currentQuestionId: null,
    completedBlockIds: [],
    identification: IDENTIFICATION,
    blocks: BLOCKS,
    answers: {},
  }
  const progress = { ...base, answers: PROGRESS, completedBlockIds: ["b0"] }
  const toneDone = {
    ...progress,
    completedBlockIds: ["b0", "b1", "b2"],
    answers: {
      ...PROGRESS,
      "q-dream_client": answered({ text: "A Helena, que pediu o café da manhã de aniversário da mãe e voltou no Natal." }),
      "q-brand_tone": answered({ value: { choices: ["warm", "close"], rejected: ["formal"], primary: "warm" } }),
    },
  }
  switch (screen) {
    case "inicio":
      return { data: { ...base, status: "not_started" }, startAt: 0 }
    case "audio":
      return { data: progress, startAt: at("offer") }
    case "escolha":
      return { data: progress, startAt: at("discovery") }
    case "tom":
      return { data: toneDone, startAt: at("brand_tone") }
    case "cores": {
      const identity = answered({
        files: [{ path: "demo/logo", name: "logo-cafe-aurora.png", mime_type: "image/png", size_bytes: 248000 }],
        value: { extras: { palette: { colors: colorsOf({ use: ["#a16207", "#f5f5f4", "#1f2937"], avoid: ["#ec4899"] }) } } },
      })
      return { data: { ...toneDone, completedBlockIds: ["b0", "b1", "b2", "b4"], answers: { ...toneDone.answers, "q-identity": identity } }, startAt: at("identity") }
    }
    case "etapa":
      return { data: { ...progress, completedBlockIds: ["b0", "b1"] }, startAt: steps.findIndex((step) => step.type === "block_done" && step.blockIndex === 1) }
    case "envio":
    case "obrigado": {
      const done = {
        ...toneDone,
        completedBlockIds: ["b0", "b1", "b2", "b4", "b6"],
        answers: {
          ...toneDone.answers,
          "q-competitors": answered({ value: { links: ["@padariaboa", "@docedalu"] } }),
          "q-identity": answered({ value: { extras: { palette: { colors: colorsOf({ use: ["#a16207", "#f5f5f4", "#1f2937"], avoid: [] }) } } } }),
        },
      }
      return { data: screen === "obrigado" ? { ...done, status: "submitted" } : done, startAt: steps.length - 1 }
    }
  }
}
