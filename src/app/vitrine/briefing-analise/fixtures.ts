import type { AnalysisContent, TeamBriefingAnalysis } from "@/features/briefing/analysis-logic"
import type { TeamBriefingAnswer, TeamBriefingDetail } from "@/features/briefing/team-logic"
import { addDaysToKey } from "@/lib/dates"
import type { BriefingStatus, ClientDetail, DateKey } from "@/lib/types"

import { VB_CLIENTS } from "../admin-b/fixtures"
import { VB_BRIEFING_BLOCKS, VB_BRIEFING_QUESTIONS } from "../briefing-equipe/fixtures"

/*
 * Briefing de exemplo da Doceria Flor de Açúcar (só a vitrine), com a análise
 * da IA: o mesmo formulário da aba da equipe, respostas com uma contradição
 * de preço, uma pulada e uma que só repete o exemplo da pergunta.
 */

export const DOCERIA_ID = "00000000-0000-4000-8000-0000000000d1"
const BRIEFING = "00000000-0000-4000-8000-00000000df01"
const OLD = "2026-10-20T12:00:00.000Z"

export const DOCERIA_CLIENT: ClientDetail = {
  ...VB_CLIENTS.find((client) => client.name === "Café Aurora")!,
  id: DOCERIA_ID,
  name: "Doceria Flor de Açúcar",
  instagram_handle: "flordeacucar.doces",
  instagram_bio: "Bolos de festa e doces finos sob encomenda 🌸 Curitiba",
  contact_name: "Ana Souza",
  contact_email: "ana@flordeacucar.com.br",
}

const EXAMPLE_IDEAL = "Pensa numa pessoa de verdade. Ex.: “A Júlia, que fez o bolo do casamento e voltou pro chá de bebê.”"

/** As perguntas da aba, com a dica do formulário v1 na do cliente ideal. */
const QUESTIONS = VB_BRIEFING_QUESTIONS.map((question) =>
  question.id === "q6" ? { ...question, hint: EXAMPLE_IDEAL } : question
)

function answer(questionId: string, extra: Partial<TeamBriefingAnswer>): TeamBriefingAnswer {
  const question = QUESTIONS.find((item) => item.id === questionId)!
  return {
    id: `d-${questionId}`,
    question_id: questionId,
    snapshot: { text: question.text, hint: question.hint, kind: question.kind, options: question.options, required: question.required, block_title: null },
    text: null,
    value: null,
    files: [],
    skipped: false,
    updated_at: OLD,
    filled_by_team: false,
    team_filled_at: null,
    by_client: true,
    audios: [],
    summary: null,
    ...extra,
  }
}

function spoken(id: string, seconds: number, transcript: string) {
  return {
    id,
    path: `${DOCERIA_ID}/${BRIEFING}/0000000${id}-0000-4000-8000-000000000000`,
    duration_ms: seconds * 1000,
    created_at: OLD,
    transcription: { status: "ready" as const, transcript, error: null },
  }
}

const ANSWERS: TeamBriefingAnswer[] = [
  answer("q0", {
    value: { brand_name: "Flor de Açúcar", contact_name: "Ana Souza", region: "Curitiba e região metropolitana", instagram: "@flordeacucar.doces", site: "" },
  }),
  answer("q1", { value: { choice: "1_3y" } }),
  answer("q2", {
    audios: [
      spoken(
        "d1",
        96,
        "A gente faz bolo de festa sob encomenda, principalmente aniversário e casamento, e doce fino. E agora saiu a linha de pote, pra pronta entrega. Nosso preço é acima da média, mas é tudo artesanal, sem conservante, o recheio é feito na hora."
      ),
    ],
    summary: {
      status: "ready",
      summary:
        "Bolos de festa sob encomenda (aniversário e casamento), doces finos e uma linha de pote nova para pronta entrega. Preço acima da média, justificado por ser “tudo artesanal, sem conservante, o recheio é feito na hora”.",
      error: null,
    },
  }),
  answer("q3", { value: { number: 260 } }),
  answer("q4", { value: { choices: ["client_referral", "organic_social"], extras: { share: "Quase tudo indicação, uns 70%" } } }),
  answer("q5", {
    audios: [
      spoken(
        "d2",
        58,
        "Eu quero sair da dependência da indicação. Dezembro lota, mas janeiro e fevereiro são muito fracos. E quero que a linha de pote venda sozinha, sem eu ter que ficar mandando mensagem."
      ),
    ],
    summary: {
      status: "ready",
      summary: "Quer depender menos da indicação, encher janeiro e fevereiro (meses fracos) e fazer a linha de pote vender “sozinha”.",
      error: null,
    },
  }),
  answer("q6", {
    text: "A Júlia, que fez o bolo do casamento e voltou pro chá de bebê.",
    summary: { status: "ready", summary: "Cliente ideal: quem faz o bolo do casamento e volta para o chá de bebê.", error: null },
  }),
  answer("q7", { skipped: true }),
  answer("q8", { value: { choice: "price", extras: { phrase: "“Nossa, mas por esse preço eu compro dois na padaria.”" } } }),
  answer("q9", { value: { choices: ["close", "formal"], primary: "close" } }),
  answer("q10", { value: { fields: { use: "docinho, capricho, feito com amor", avoid: "gourmet, promoção" } } }),
  answer("q11", { value: { links: ["@padariaboa", "@docedalu"] }, filled_by_team: true, team_filled_at: OLD }),
  answer("q13", { value: { dates: [{ date: "2026-12-20", label: "Último dia de encomendas de Natal" }] } }),
]

export const DOCERIA_ANALYSIS: AnalysisContent = {
  key_points: [
    "Confeitaria artesanal de Curitiba, de 1 a 3 anos, que vive de bolos de festa sob encomenda (aniversário e casamento) e acabou de lançar uma linha de pote para pronta entrega.",
    "Uns 70% dos pedidos vêm de indicação; o objetivo é depender menos dela e encher janeiro e fevereiro, que são fracos.",
    "O preço é declarado acima da média e justificado por ser “tudo artesanal, sem conservante, o recheio é feito na hora”.",
    "A objeção que mais pesa é o preço: “por esse preço eu compro dois na padaria”.",
    "Tom principal próximo, com uma pitada formal; usa “docinho”, “capricho” e “feito com amor” e evita “gourmet” e “promoção”.",
  ],
  positioning: {
    what: "Confeitaria artesanal de bolos de festa e doces finos sob encomenda, com uma linha de pote para o dia a dia.",
    for_whom: "Famílias e noivas de Curitiba que querem um bolo caprichado para a data importante e voltam nas próximas festas.",
    against: "O bolo de padaria e de mercado: mais barato, pronto e sem o cuidado do feito na hora.",
    summary: "O bolo artesanal das datas que importam, contra o bolo de padaria, e o preço ainda não conta essa história.",
  },
  contradictions: [
    {
      title: "Preço acima da média, mas a objeção é preço",
      detail:
        "Diz que cobra acima da média por ser artesanal, mas marca preço como o que mais pesa e ouve “por esse preço eu compro dois na padaria”: o valor do artesanal não chega a quem compra.",
      questions: ["O que você vende?", "Quando alguém adia a decisão, o que mais pesa?"],
    },
    {
      title: "Tom próximo, mas também formal",
      detail: "Escolheu Próxima como principal e marcou Formal junto, sem dizer onde cada um entra (talvez o formal seja só para casamento).",
      questions: ["Quais dessas aberturas você publicaria?"],
    },
  ],
  gaps: [
    {
      question: "Qual cliente você adoraria atender de novo?",
      kind: "example",
      note: "Repete o exemplo da pergunta (“a Júlia, que fez o bolo do casamento…”); falta um cliente de verdade.",
    },
    { question: "Que pedidos você recusa ou que tipo de cliente não quer atrair?", kind: "skipped", note: "Falta saber quem a marca não quer atrair." },
    { question: "Logo, fontes, paleta ou manual", kind: "missing", note: "Nada enviado: sem logo nem cores para a identidade." },
    { question: "O que já tem data nos próximos três meses?", kind: "vague", note: "Só o Natal; faltam casamentos fechados e alguma ação para janeiro." },
  ],
  meeting_questions: [
    { question: "Quando você diz que o preço é acima da média, quanto acima? E o que você responde hoje quando alguém acha caro?", why: "Resolve a contradição entre o preço e a objeção." },
    { question: "Quem foi o último cliente que você adoraria atender de novo? O que pediu e por que voltou?", why: "A resposta do briefing repetiu o exemplo." },
    { question: "Que pedidos você prefere recusar?", why: "Pulada; define quem a comunicação não deve atrair." },
    { question: "O que acontece em janeiro e fevereiro? Já tentou alguma oferta nesses meses?", why: "É a dor que trouxe a marca à Boop." },
    { question: "A linha de pote é para quem? O mesmo público do bolo de festa?", why: "Produto novo, sem público definido." },
    { question: "Onde entra o tom formal: só nos casamentos ou em tudo?", why: "Contradição de tom." },
  ],
  content_pillars: [
    {
      name: "Por trás do bolo",
      description: "Bastidores da produção: o recheio feito na hora, os ingredientes, o capricho em cada detalhe.",
      why: "Mostra por que o preço é acima da média e responde à objeção sem falar de preço.",
    },
    {
      name: "Festas de verdade",
      description: "Histórias de clientes e das datas: aniversários, casamentos e quem volta para o chá de bebê.",
      why: "70% vem de indicação: transforma o boca a boca em conteúdo e prova social.",
    },
    {
      name: "Doce de todo dia",
      description: "A linha de pote como mimo da semana, com os dias de fornada e onde retirar.",
      why: "Dá motivo para comprar fora das festas e ajuda a encher janeiro e fevereiro.",
    },
    {
      name: "Como escolher o seu bolo",
      description: "Tamanhos, sabores e prazos de encomenda, explicados sem pressa.",
      why: "Tira a dúvida antes do pedido e educa sobre o valor do sob encomenda.",
    },
  ],
}

export type DoceriaState = "pronta" | "gerando" | "parcial" | "desatualizada" | "falhou"

export function doceriaBriefing(today: DateKey, state: DoceriaState): TeamBriefingDetail {
  const status: BriefingStatus = state === "parcial" ? "in_progress" : "submitted"
  const open = status === "in_progress"
  const answers = open ? ANSWERS.filter((item) => !["q9", "q10", "q11", "q13"].includes(item.question_id)) : ANSWERS
  const finished = `${addDaysToKey(today, -1)}T21:46:00.000Z`
  const analysis: TeamBriefingAnalysis | null =
    state === "parcial"
      ? null
      : {
          status: state === "gerando" ? "processing" : state === "falhou" ? "failed" : "ready",
          attempts: state === "falhou" ? 3 : 1,
          content: state === "gerando" || state === "falhou" ? null : DOCERIA_ANALYSIS,
          error: state === "falhou" ? "O modelo recusou analisar este briefing." : null,
          origin: "submitted",
          requested_at: `${addDaysToKey(today, -1)}T21:40:00.000Z`,
          finished_at: state === "gerando" ? null : finished,
          stale: state === "desatualizada",
        }
  return {
    id: BRIEFING,
    status,
    due_on: addDaysToKey(today, open ? 2 : -1),
    identification: {
      brand_name: "Flor de Açúcar",
      contact_name: "Ana Souza",
      region: "Curitiba e região metropolitana",
      instagram: "@flordeacucar.doces",
      site: "",
    },
    released_at: `${addDaysToKey(today, -6)}T13:00:00.000Z`,
    started_at: `${addDaysToKey(today, -5)}T13:00:00.000Z`,
    submitted_at: open ? null : `${addDaysToKey(today, -1)}T21:40:00.000Z`,
    immersion_at: null,
    document_sent_at: null,
    validated_at: null,
    last_seen_at: `${addDaysToKey(today, open ? 0 : -1)}T18:20:00.000Z`,
    blocks: VB_BRIEFING_BLOCKS,
    questions: QUESTIONS,
    answers,
    immersion: null,
    analysis,
  }
}
