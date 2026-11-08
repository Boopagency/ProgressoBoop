import type { BriefingForm } from "@/features/briefing/team-queries"
import {
  parseQuestionOptions,
  type TeamBriefingAnswer,
  type TeamBriefingBlock,
  type TeamBriefingDetail,
  type TeamBriefingQuestion,
} from "@/features/briefing/team-logic"
import { addDaysToKey } from "@/lib/dates"
import type { BriefingStatus, DateKey } from "@/lib/types"

/*
 * Briefing de exemplo do Café Aurora (só a vitrine): o formulário v1
 * resumido, respostas de todos os tipos, áudios com a IA em estados
 * diferentes, uma pulada e a imersão.
 */

export const VB_BRIEFING_CLIENT = "00000000-0000-4000-8000-0000000000a1"
export const VB_BRIEFING_ID = "00000000-0000-4000-8000-00000000bf01"
const BRIEFING = VB_BRIEFING_ID
const OLD = "2026-10-01T12:00:00.000Z"

export const VB_BRIEFING_BLOCKS: TeamBriefingBlock[] = [
  { id: "b0", position: 0, title: "Pra começar", description: "Confere se a gente anotou tudo certinho.", estimated_minutes: 1, active: true },
  { id: "b1", position: 1, title: "Negócio e prioridades", description: "O que você vende e o que precisa vender mais agora.", estimated_minutes: 6, active: true },
  { id: "b2", position: 2, title: "Quem compra", description: "Quem é o seu cliente e como ele decide.", estimated_minutes: 5, active: true },
  { id: "b4", position: 3, title: "Como a marca fala", description: "O jeito de falar que tem a sua cara.", estimated_minutes: 4, active: true },
  { id: "b6", position: 4, title: "Referências e materiais", description: "Tudo opcional. O que tiver à mão já ajuda.", estimated_minutes: 3, active: true },
  { id: "b9", position: 5, title: "Datas especiais (teste)", description: null, estimated_minutes: 2, active: false },
]

function q(
  id: string,
  block: string,
  position: number,
  kind: TeamBriefingQuestion["kind"],
  text: string,
  options: unknown,
  required: boolean,
  hint: string | null = null,
  active = true
): TeamBriefingQuestion {
  return { id, block_id: block, position, key: null, text, hint, kind, options: parseQuestionOptions(options), required, active, created_at: OLD }
}

export const VB_BRIEFING_QUESTIONS: TeamBriefingQuestion[] = [
  q("q0", "b0", 1, "identification", "Esses dados estão certos?", {
    fields: [
      { key: "brand_name", label: "Nome da marca" },
      { key: "contact_name", label: "Quem responde pela marca" },
      { key: "region", label: "Cidade ou região que vocês atendem" },
      { key: "instagram", label: "@ do Instagram" },
      { key: "site", label: "Site (se tiver)" },
    ],
  }, true),
  q("q1", "b1", 1, "choice", "Há quanto tempo a marca existe?", {
    choices: [
      { value: "starting", label: "Começando agora" },
      { value: "up_to_1y", label: "Até 1 ano" },
      { value: "1_3y", label: "De 1 a 3 anos" },
      { value: "3_10y", label: "De 3 a 10 anos" },
    ],
  }, true, "Conta desde quando você começou a vender, mesmo que informal."),
  q("q2", "b1", 2, "audio", "O que você vende? Fala dos principais produtos ou serviços.", {}, true),
  q("q3", "b1", 3, "number", "Quanto o cliente gasta, em média, por compra?", { unit: "BRL" }, false),
  q("q4", "b1", 4, "multiple", "Como as pessoas descobrem a sua marca?", {
    max: 2,
    other: true,
    choices: [
      { value: "client_referral", label: "Indicação de clientes" },
      { value: "google", label: "Google ou Maps" },
      { value: "organic_social", label: "Redes sociais, sem anúncio" },
      { value: "walk_in", label: "Passam em frente" },
    ],
    extras: [{ key: "share", kind: "short_text", label: "Se souber, quanto vem de cada um?" }],
  }, true),
  q("q5", "b1", 5, "audio", "O que fez você buscar a Boop agora?", { voice: "essential" }, true),
  q("q6", "b2", 1, "audio", "Qual cliente você adoraria atender de novo? O que ele comprou, o que valorizou, por que repetiria?", { voice: "essential" }, true),
  q("q7", "b2", 2, "audio", "Que pedidos você recusa ou que tipo de cliente não quer atrair?", {}, false),
  q("q8", "b2", 3, "choice", "Quando alguém adia a decisão, o que mais pesa?", {
    other: true,
    choices: [
      { value: "price", label: "Preço ou forma de pagamento" },
      { value: "trust", label: "Confiança" },
      { value: "distance", label: "Distância" },
    ],
    extras: [{ key: "phrase", kind: "short_text", label: "Uma frase que você já ouviu" }],
  }, true),
  q("q9", "b4", 1, "cards", "Quais dessas aberturas você publicaria? Se marcar duas, qual é a principal?", {
    max: 2,
    primary: true,
    cards: [
      { value: "warm", label: "Acolhedora", description: "Abraça, cuida, entende a pessoa.", example: "Sabe aquele dia em que tudo precisa dar certo? A gente cuida do café pra você cuidar do resto." },
      { value: "close", label: "Próxima", description: "Fala como amiga, de igual pra igual.", example: "Conta aqui: você também cheira o pacote antes de abrir?" },
      { value: "formal", label: "Formal", description: "Elegante e cuidadosa com as palavras." },
    ],
  }, true),
  q("q10", "b4", 2, "short_text", "Palavras que você usa e palavras que prefere evitar", {
    fields: [
      { key: "use", label: "Palavras e expressões que você usa" },
      { key: "avoid", label: "Palavras, assuntos e promessas a evitar" },
    ],
  }, false),
  q("q11", "b6", 1, "links", "Com quem seus clientes costumam comparar a sua marca?", { max: 2 }, false),
  q("q12", "b6", 2, "upload", "Logo, fontes, paleta ou manual. Se a identidade está em aberto, quais cores você quer usar ou evitar?", {
    accept: ["image/*", "application/pdf"],
    extras: [{ key: "palette", kind: "palette", label: "Cores pra usar ou evitar" }],
  }, false),
  q("q13", "b6", 3, "dates", "O que já tem data nos próximos três meses?", {}, false),
  q("q14", "b2", 4, "short_text", "Pergunta antiga que foi desativada", {}, false, null, false),
]

function path(name: string) {
  return `${VB_BRIEFING_CLIENT}/${BRIEFING}/${name}`
}

export function vbAnswer(questionId: string, extra: Partial<TeamBriefingAnswer>, snapshotText?: string): TeamBriefingAnswer {
  const question = VB_BRIEFING_QUESTIONS.find((item) => item.id === questionId)!
  return {
    id: `a-${questionId}`,
    question_id: questionId,
    snapshot: {
      text: snapshotText ?? question.text,
      hint: question.hint,
      kind: question.kind,
      options: question.options,
      required: question.required,
      block_title: null,
    },
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

function audio(id: string, seconds: number, transcription: TeamBriefingAnswer["audios"][number]["transcription"]) {
  return { id, path: path(`0000000${id}-0000-4000-8000-000000000000`), duration_ms: seconds * 1000, created_at: OLD, transcription }
}

const ANSWERS: TeamBriefingAnswer[] = [
  vbAnswer("q0", {
    value: { brand_name: "Café Aurora", contact_name: "Marina Prado", region: "Curitiba, Batel e Água Verde", instagram: "@aurora.cafe", site: "auroracafe.com.br" },
  }),
  vbAnswer("q1", { value: { choice: "3_10y" } }),
  vbAnswer("q2", {
    audios: [
      audio("a1", 102, {
        status: "ready",
        transcript:
          "Então, a gente é uma cafeteria de especialidade, com torra própria. Vende café na xícara, claro, mas o que mais cresce é o café em grão pra levar pra casa e os kits de presente. Também tem o brunch de fim de semana, que lota.",
        error: null,
      }),
    ],
    summary: {
      status: "ready",
      summary: "Cafeteria de especialidade com torra própria. Carros-chefe: café na xícara, café em grão para casa (o que mais cresce), kits de presente e brunch de fim de semana (lota).",
      error: null,
    },
  }, "O que você vende? Liste os principais produtos ou serviços."),
  vbAnswer("q3", { value: { number: 46 } }),
  vbAnswer("q4", { value: { choices: ["client_referral", "organic_social"], extras: { share: "Uns 60% indicação, o resto Instagram" } } }),
  vbAnswer("q5", {
    audios: [
      audio("a2", 74, { status: "ready", transcript: "A gente posta quando dá, sem plano. Abrimos a segunda loja e precisamos que ela fique conhecida rápido.", error: null }),
      audio("a3", 31, { status: "processing", transcript: null, error: null }),
    ],
    summary: { status: "processing", summary: null, error: null },
  }),
  vbAnswer("q6", {
    text: "A Júlia, que comprou o kit de presente pro time inteiro no fim do ano e voltou pra encomendar o café da empresa. Valorizou o cuidado com a embalagem e o bilhete escrito à mão.",
    summary: { status: "ready", summary: "Cliente ideal: empresas que compram kits de presente e viram assinantes. Valorizam embalagem caprichada e o toque pessoal (bilhete à mão).", error: null },
  }),
  vbAnswer("q7", { skipped: true }),
  vbAnswer("q8", { value: { choice: "price", extras: { phrase: "“Nossa, mas um pacote de café por esse preço?”" } } }),
  vbAnswer("q9", { value: { choices: ["warm", "close"], primary: "close" } }),
  vbAnswer("q10", { value: { fields: { use: "fornada, torra da semana, cafezinho", avoid: "“o melhor café da cidade”, política" } } }),
  vbAnswer("q11", { value: { links: ["@cafedobairro", "https://www.instagram.com/torrefacaosul/"] } }),
  vbAnswer("q12", {
    files: [
      { path: path("logo-aurora.png"), name: "logo-aurora.png", mime_type: "image/png", size_bytes: 182_000 },
      { path: path("manual-da-marca.pdf"), name: "manual-da-marca.pdf", mime_type: "application/pdf", size_bytes: 3_400_000 },
    ],
    value: { extras: { palette: { colors: [{ hex: "#3b2a20", use: "use" }, { hex: "#e9b872", use: "use" }, { hex: "#ff3d7f", use: "avoid" }] } } },
  }),
  vbAnswer("q13", {
    value: { dates: [{ date: "2026-11-28", label: "Black Friday dos kits" }, { date: "2026-12-12", label: "Aniversário de 5 anos" }] },
    audios: [audio("a4", 48, { status: "failed", transcript: null, error: "Tempo esgotado ao falar com a OpenAI." })],
    summary: { status: "failed", summary: null, error: "Sem transcrição." },
  }),
  vbAnswer("q14", { text: "Uma resposta guardada de uma pergunta que saiu do formulário." }),
]

export function vbBriefing(today: DateKey, status: BriefingStatus): TeamBriefingDetail {
  const open = status === "not_started" || status === "in_progress"
  const answers = status === "not_started" ? [] : open ? ANSWERS.filter((answer) => !["q6", "q8", "q9", "q10", "q11", "q12", "q13"].includes(answer.question_id)) : ANSWERS
  return {
    id: BRIEFING,
    status,
    due_on: addDaysToKey(today, open ? 2 : -1),
    identification: {
      brand_name: "Café Aurora",
      contact_name: "Marina Prado",
      region: "Curitiba, Batel e Água Verde",
      instagram: "@aurora.cafe",
      site: "auroracafe.com.br",
    },
    released_at: `${addDaysToKey(today, -6)}T13:00:00.000Z`,
    started_at: open ? `${addDaysToKey(today, -4)}T13:00:00.000Z` : `${addDaysToKey(today, -5)}T13:00:00.000Z`,
    submitted_at: open ? null : `${addDaysToKey(today, -1)}T21:40:00.000Z`,
    immersion_at: null,
    document_sent_at: null,
    validated_at: null,
    last_seen_at: status === "not_started" ? null : `${addDaysToKey(today, open ? 0 : -1)}T18:20:00.000Z`,
    blocks: VB_BRIEFING_BLOCKS,
    questions: VB_BRIEFING_QUESTIONS,
    answers,
    immersion: open
      ? null
      : {
          meeting_id: null,
          transcript: "",
          notes: "Reforçar a segunda loja (Água Verde) nos primeiros 90 dias. Kits corporativos são a oferta de maior margem.",
          updated_at: `${today}T12:10:00.000Z`,
        },
  }
}

export function vbBriefingForm(): BriefingForm {
  return {
    template: { id: "t1", name: "Briefing de onboarding", version: 1 },
    blocks: VB_BRIEFING_BLOCKS,
    questions: VB_BRIEFING_QUESTIONS,
    answerCounts: Object.fromEntries(ANSWERS.map((answer) => [answer.question_id, 3])),
  }
}

/** Imagem de exemplo no lugar do bucket (o logo); o resto não abre na vitrine. */
export function vbFileUrl(path: string): string {
  if (path.endsWith(".png")) {
    const svg =
      "<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 160 120'><rect width='160' height='120' fill='#3b2a20'/><circle cx='80' cy='52' r='22' fill='#e9b872'/><text x='80' y='100' font-family='Georgia' font-size='16' fill='#f5e6d0' text-anchor='middle'>Aurora</text></svg>"
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
  }
  return "#"
}
