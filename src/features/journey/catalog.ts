/*
 * Catálogo da jornada do cliente (issue #115): as fases e as etapas de cada
 * linha de serviço, na ordem, como estão nos Processos da Boop ("SOCIAL 00 —
 * Mapa geral e fluxograma" e SOCIAL 01 a 07). O sistema segue esse processo e
 * não inventa etapas; nada daqui é configurável pela tela.
 *
 * O banco tem uma cópia mínima (chave, nome, ordem, quem age, prazo, portão e
 * regra automática) em `private.journey_steps`, só para os avisos do job
 * diário. O teste `journey-sql.test.mjs` confere que as duas são iguais:
 * mudou aqui, muda numa migration nova também.
 *
 * Sem `enum` nem nada que o Node não rode direto (os testes importam o .ts).
 */

/** Linha de serviço. Site é projeto (Projetos), fora da jornada. */
export type JourneyLine = "social" | "traffic"
/** Entrada, Onboarding, Ongoing, Renovação e Saída. */
export type JourneyPhase = "entry" | "onboarding" | "ongoing" | "renewal" | "offboarding"
/** Onboarding compacto (plano Básico, 2 semanas) ou completo (Intermediário e Avançado, 4–5 semanas). */
export type JourneyMode = "compact" | "full"
/** Quem precisa agir para a etapa andar. */
export type JourneyActor = "boop" | "client"

/**
 * Dados do sistema que marcam uma etapa sozinhos (ver `journey_facts` na
 * migration): negócio ganho, 1ª fatura paga, responsável definido, acesso ao
 * portal, briefing liberado e enviado, reunião de briefing (imersão) feita,
 * Instagram conectado, 1º post publicado e a revisão mensal do mês.
 */
export type JourneyFact =
  | "deal_won"
  | "first_payment"
  | "owner_defined"
  | "portal_access"
  | "briefing_released"
  | "briefing_submitted"
  | "briefing_meeting"
  | "instagram_connected"
  | "first_post"
  | "monthly_review"

/**
 * Prazo-alvo da etapa:
 * - `business_days`: dias úteis depois do começo da fase (no onboarding,
 *   um valor para o completo e outro para o compacto);
 * - `month_day`: dia do mês (ongoing; nos meses curtos, o último dia);
 * - `month_business_day`: o enésimo dia útil do mês (ongoing).
 */
export type JourneyTarget =
  | { kind: "business_days"; full: number; compact: number }
  | { kind: "month_day"; day: number }
  | { kind: "month_business_day"; day: number }

export interface JourneyStepDef {
  /** Nome estável (vai para o banco nas marcações). Único dentro da linha. */
  key: string
  name: string
  /** Descrição curta: o que é a etapa, do processo. */
  description: string
  actor: JourneyActor
  target: JourneyTarget
  /** Portão: o que precisa acontecer para a fase andar. Não aceita "não se aplica". */
  gate?: string
  /** Dado que marca a etapa sozinho. A equipe ainda pode marcar à mão. */
  auto?: JourneyFact
  /** Sprint do onboarding (ex.: "Sprint 1 · Entender"). */
  group?: string
  /** Só no último mês de cada trimestre (março, junho, setembro e dezembro). */
  quarterly?: boolean
  /** Aba da ficha do cliente onde a etapa é feita (o briefing). */
  section?: "briefing"
}

export interface JourneyPhaseDef {
  phase: JourneyPhase
  name: string
  description: string
  /** Processo de origem, nos Processos do app. */
  source: string
  steps: JourneyStepDef[]
}

export interface JourneyLineDef {
  line: JourneyLine
  name: string
  /** O onboarding tem os modos compacto e completo. */
  modes: boolean
  phases: JourneyPhaseDef[]
}

export const JOURNEY_LINES: readonly JourneyLine[] = ["social", "traffic"]
export const JOURNEY_PHASES: readonly JourneyPhase[] = ["entry", "onboarding", "ongoing", "renewal", "offboarding"]

export const JOURNEY_LINE_LABEL: Record<JourneyLine, string> = {
  social: "Social media",
  traffic: "Tráfego pago",
}

export const JOURNEY_LINE_SHORT: Record<JourneyLine, string> = {
  social: "Social",
  traffic: "Tráfego",
}

export const JOURNEY_PHASE_LABEL: Record<JourneyPhase, string> = {
  entry: "Entrada",
  onboarding: "Onboarding",
  ongoing: "Ongoing",
  renewal: "Renovação",
  offboarding: "Saída",
}

export const JOURNEY_MODE_LABEL: Record<JourneyMode, string> = {
  compact: "Compacto",
  full: "Completo",
}

export const JOURNEY_MODE_HINT: Record<JourneyMode, string> = {
  compact: "Plano Básico (12 posts): onboarding em 2 semanas.",
  full: "Intermediário (16) ou Avançado (20): onboarding em 4–5 semanas.",
}

export const JOURNEY_ACTOR_LABEL: Record<JourneyActor, string> = {
  boop: "Boop",
  client: "Cliente",
}

const days = (full: number, compact: number = full): JourneyTarget => ({ kind: "business_days", full, compact })
const monthDay = (day: number): JourneyTarget => ({ kind: "month_day", day })
const monthBusinessDay = (day: number): JourneyTarget => ({ kind: "month_business_day", day })

/* ------------------------------------------------------------------ */
/* Fases comuns                                                         */
/* ------------------------------------------------------------------ */

/** Fase 1 · Entrada (dias 0–3), SOCIAL 01. Começa com o portão do comercial. */
function entryPhase(line: JourneyLine): JourneyPhaseDef {
  const steps: JourneyStepDef[] = [
    {
      key: "deal_won",
      name: "Negócio ganho",
      description: "O comercial fechou: o negócio está como ganho no Comercial.",
      actor: "boop",
      target: days(0),
      auto: "deal_won",
    },
    {
      key: "contract_signed",
      name: "Contrato assinado",
      description: "Contrato assinado pelo cliente.",
      actor: "client",
      target: days(2),
      gate: "Contrato assinado e 1ª fatura paga: passa para a operação.",
    },
    {
      key: "first_payment",
      name: "1ª fatura paga",
      description: "A primeira cobrança do contrato recebida no Financeiro.",
      actor: "client",
      target: days(3),
      gate: "Contrato assinado e 1ª fatura paga: passa para a operação.",
      auto: "first_payment",
    },
    {
      key: "owner_defined",
      name: "Gerente de projeto definido",
      description: "Cliente e gerente de projeto definidos (o responsável na ficha).",
      actor: "boop",
      target: days(1),
      auto: "owner_defined",
    },
    {
      key: "portal_access",
      name: "Boas-vindas e acesso ao portal",
      description: "Mensagem de boas-vindas e o acesso do cliente ao portal criado.",
      actor: "boop",
      target: days(1),
      auto: "portal_access",
    },
    {
      key: "access_materials",
      name: "Acessos e materiais",
      description: "Acessos e materiais do cliente recebidos. Sem eles em 3 dias úteis, o prazo do onboarding anda junto com o atraso.",
      actor: "client",
      target: days(3),
    },
  ]
  if (line === "social") {
    steps.push({
      key: "instagram_connected",
      name: "Instagram conectado",
      description: "A conta do Instagram do cliente conectada ao Boop Admin (publicação e métricas).",
      actor: "client",
      target: days(3),
      auto: "instagram_connected",
    })
  }
  steps.push({
    key: "kickoff",
    name: "Kickoff de capacitação",
    description: "Reunião de 30 minutos para o cliente saber como a Boop trabalha e como usar o portal.",
    actor: "boop",
    target: days(3),
  })
  return {
    phase: "entry",
    name: "Entrada",
    description: "Dias 0 a 3: contrato, boas-vindas, acessos e kickoff.",
    source: "SOCIAL 01",
    steps,
  }
}

/** Fase 4 · Renovação: 30 dias antes do fim do contrato. */
const RENEWAL: JourneyPhaseDef = {
  phase: "renewal",
  name: "Renovação",
  description: "30 dias antes do fim do contrato: relatório do período e proposta de renovação ou upgrade.",
  source: "SOCIAL 00",
  steps: [
    {
      key: "renewal_report",
      name: "Relatório do período",
      description: "Relatório de tudo o que foi feito e dos resultados do contrato.",
      actor: "boop",
      target: days(5),
    },
    {
      key: "renewal_proposal",
      name: "Proposta de renovação",
      description: "Proposta de renovação ou de upgrade apresentada ao cliente.",
      actor: "boop",
      target: days(10),
    },
    {
      key: "renewal_decision",
      name: "Decisão do cliente",
      description: "O cliente renova (volta para o ongoing) ou não renova (vai para a saída).",
      actor: "client",
      target: days(20),
      gate: "O cliente decide: renova ou não renova.",
    },
  ],
}

/** Fase 4 · Saída (offboarding), se o cliente não renova. */
const OFFBOARDING: JourneyPhaseDef = {
  phase: "offboarding",
  name: "Saída",
  description: "O cliente não renovou: relatório final, materiais entregues e acessos revogados.",
  source: "SOCIAL 00",
  steps: [
    {
      key: "final_report",
      name: "Relatório final",
      description: "Relatório final do trabalho entregue ao cliente.",
      actor: "boop",
      target: days(5),
    },
    {
      key: "materials_delivered",
      name: "Materiais entregues",
      description: "Artes, arquivos e documentos do cliente entregues.",
      actor: "boop",
      target: days(5),
    },
    {
      key: "access_revoked",
      name: "Acessos revogados",
      description: "A Boop sai das contas do cliente e o acesso ao portal é encerrado.",
      actor: "boop",
      target: days(10),
      gate: "Acessos revogados: a jornada termina.",
    },
  ],
}

/* ------------------------------------------------------------------ */
/* Social media                                                        */
/* ------------------------------------------------------------------ */

const S1 = "Sprint 1 · Entender"
const S2 = "Sprint 2 · Planejar"
const S3 = "Sprint 3 · Preparar"
const S4 = "Sprint 4 · Produzir e ativar"

/**
 * Fase 2 · Onboarding em sprints (SOCIAL 02 e 03). Completo: uma sprint por
 * semana e a 4ª nas semanas 4–5. Compacto: sprints 1+2 na semana 1 e 3+4 na
 * semana 2. Prazos em dias úteis desde o começo do onboarding.
 */
const SOCIAL_ONBOARDING: JourneyPhaseDef = {
  phase: "onboarding",
  name: "Onboarding",
  description: "Quatro sprints até a 1ª publicação, que fecha o onboarding.",
  source: "SOCIAL 02 e 03",
  steps: [
    {
      key: "briefing_released",
      name: "Briefing liberado",
      description: "O briefing de onboarding liberado para o cliente no portal.",
      actor: "boop",
      target: days(1, 1),
      auto: "briefing_released",
      group: S1,
      section: "briefing",
    },
    {
      key: "briefing_submitted",
      name: "Briefing respondido",
      description: "O cliente respondeu e enviou o briefing.",
      actor: "client",
      target: days(3, 2),
      auto: "briefing_submitted",
      group: S1,
      section: "briefing",
    },
    {
      key: "briefing_meeting",
      name: "Reunião de briefing",
      description: "A reunião de briefing (imersão) feita e registrada.",
      actor: "boop",
      target: days(4, 3),
      auto: "briefing_meeting",
      group: S1,
      section: "briefing",
    },
    {
      key: "analysis",
      name: "Análise em 7 blocos",
      description: "Análise do perfil, do mercado e dos concorrentes, nos 7 blocos.",
      actor: "boop",
      target: days(5, 4),
      group: S1,
    },
    {
      key: "quick_wins",
      name: "Quick wins",
      description: "Ajustes rápidos que já melhoram o perfil.",
      actor: "boop",
      target: days(5, 4),
      group: S1,
    },
    {
      key: "analysis_validated",
      name: "Cliente valida a análise",
      description: "O cliente valida a análise.",
      actor: "client",
      target: days(5, 5),
      gate: "O cliente valida a análise.",
      group: S1,
    },
    {
      key: "content_strategy",
      name: "Estratégia de conteúdo",
      description: "A estratégia de conteúdo, nas 8 partes.",
      actor: "boop",
      target: days(8, 5),
      group: S2,
    },
    {
      key: "moodboard",
      name: "Moodboard",
      description: "Moodboard da linha visual.",
      actor: "boop",
      target: days(9, 5),
      group: S2,
    },
    {
      key: "strategy_approved",
      name: "Estratégia aprovada",
      description: "Aprovação real da estratégia pelo cliente.",
      actor: "client",
      target: days(10, 5),
      gate: "Aprovação real da estratégia.",
      group: S2,
    },
    {
      key: "digital_kv",
      name: "KV digital",
      description: "O key visual digital da marca.",
      actor: "boop",
      target: days(12, 6),
      group: S3,
    },
    {
      key: "door_piece",
      name: "Peça-porta",
      description: "A peça de abertura da nova fase do perfil.",
      actor: "boop",
      target: days(13, 7),
      group: S3,
    },
    {
      key: "first_month_themes",
      name: "Temas do 1º mês",
      description: "Os temas dos posts do primeiro mês.",
      actor: "boop",
      target: days(12, 6),
      group: S3,
    },
    {
      key: "boost_plan",
      name: "Plano de impulsionamento",
      description: "O que vai ser impulsionado e com quanto.",
      actor: "boop",
      target: days(13, 7),
      group: S3,
    },
    {
      key: "themes_approved",
      name: "Temas aprovados",
      description: "O cliente aprova os temas em até 3 dias úteis.",
      actor: "client",
      target: days(15, 8),
      gate: "Temas aprovados em 3 dias úteis.",
      group: S3,
    },
    {
      key: "production",
      name: "Produção",
      description: "Produção das peças do primeiro mês.",
      actor: "boop",
      target: days(20, 9),
      group: S4,
    },
    {
      key: "pieces_approved",
      name: "Aprovação das peças",
      description: "O cliente aprova as peças.",
      actor: "client",
      target: days(22, 10),
      group: S4,
    },
    {
      key: "scheduling",
      name: "Agendamento",
      description: "As peças aprovadas agendadas.",
      actor: "boop",
      target: days(23, 10),
      group: S4,
    },
    {
      key: "first_post",
      name: "1ª publicação",
      description: "O primeiro post publicado: fim do onboarding.",
      actor: "boop",
      target: days(25, 10),
      gate: "1ª publicação = fim do onboarding.",
      auto: "first_post",
      group: S4,
    },
    {
      key: "checkin_30",
      name: "Check-in de 30 dias marcado",
      description: "A reunião de check-in dos 30 dias marcada na agenda.",
      actor: "boop",
      target: days(25, 10),
      group: S4,
    },
  ],
}

/**
 * Fase 3 · Ongoing social, todo mês (SOCIAL 04). Cada mês é uma rodada: as
 * etapas valem para o mês corrente e o prazo é o dia do mês.
 */
const SOCIAL_ONGOING: JourneyPhaseDef = {
  phase: "ongoing",
  name: "Ongoing",
  description: "Todo mês: números, temas, produção, aprovação e o mês seguinte 100% agendado até o dia 18.",
  source: "SOCIAL 04",
  steps: [
    {
      key: "month_numbers",
      name: "Números do mês e escuta",
      description: "Números do mês anterior e a escuta do cliente (dias 1 a 3).",
      actor: "boop",
      target: monthDay(3),
    },
    {
      key: "next_themes",
      name: "Temas do mês seguinte",
      description: "Os temas do mês seguinte enviados ao cliente (até o dia 4).",
      actor: "boop",
      target: monthDay(4),
    },
    {
      key: "themes_approval",
      name: "Cliente aprova os temas",
      description: "O cliente aprova os temas em até 3 dias úteis.",
      actor: "client",
      target: monthDay(7),
    },
    {
      key: "month_production",
      name: "Produção",
      description: "Produção das peças do mês seguinte (dias 7 a 11).",
      actor: "boop",
      target: monthDay(11),
    },
    {
      key: "pieces_ready",
      name: "Peças prontas",
      description: "As peças prontas e enviadas para aprovação (até o dia 12).",
      actor: "boop",
      target: monthDay(12),
    },
    {
      key: "monthly_report",
      name: "Relatório e revisão mensal",
      description: "Relatório do mês anterior e a revisão mensal, até 10 dias úteis depois do mês.",
      actor: "boop",
      target: monthBusinessDay(10),
      auto: "monthly_review",
    },
    {
      key: "pieces_approval",
      name: "Cliente aprova as peças",
      description: "O cliente aprova as peças em 2 a 3 dias úteis.",
      actor: "client",
      target: monthDay(15),
    },
    {
      key: "all_scheduled",
      name: "Mês seguinte 100% agendado",
      description: "Todo o mês seguinte agendado até o dia 18.",
      actor: "boop",
      target: monthDay(18),
      gate: "Até o dia 18: mês seguinte 100% agendado.",
    },
    {
      key: "quarterly_meeting",
      name: "Reunião estratégica trimestral",
      description: "Reunião estratégica do trimestre com o cliente.",
      actor: "boop",
      target: monthDay(28),
      quarterly: true,
    },
  ],
}

/* ------------------------------------------------------------------ */
/* Tráfego pago (SOCIAL 06)                                            */
/* ------------------------------------------------------------------ */

const TRAFFIC_ONBOARDING: JourneyPhaseDef = {
  phase: "onboarding",
  name: "Onboarding",
  description: "Acessos, rastreamento, estratégia e criativos até a subida das campanhas e o aprendizado.",
  source: "SOCIAL 06",
  steps: [
    {
      key: "ads_access",
      name: "Acessos Meta e Google",
      description: "Acessos às contas de anúncio do Meta e do Google.",
      actor: "client",
      target: days(2),
    },
    {
      key: "tracking_checked",
      name: "Pixel, eventos e UTM",
      description: "Pixel, eventos e UTMs conferidos.",
      actor: "boop",
      target: days(4),
    },
    {
      key: "ads_strategy",
      name: "Estratégia",
      description: "Objetivo, verba, projeção, público e quem atende o lead.",
      actor: "boop",
      target: days(6),
    },
    {
      key: "creatives_approved",
      name: "Criativos aprovados",
      description: "O cliente aprova os criativos.",
      actor: "client",
      target: days(8),
      gate: "Criativos aprovados pelo cliente.",
    },
    {
      key: "prelaunch_checklist",
      name: "Checklist pré-subida",
      description: "O checklist antes de subir as campanhas.",
      actor: "boop",
      target: days(9),
    },
    {
      key: "launch",
      name: "Subida das campanhas",
      description: "As campanhas no ar.",
      actor: "boop",
      target: days(10),
      gate: "Campanhas no ar.",
    },
    {
      key: "learning",
      name: "Aprendizado (2–4 semanas)",
      description: "As campanhas em aprendizado, de 2 a 4 semanas, antes das otimizações do ongoing.",
      actor: "boop",
      target: days(30),
    },
  ],
}

const TRAFFIC_ONGOING: JourneyPhaseDef = {
  phase: "ongoing",
  name: "Ongoing",
  description: "Otimização semanal, relatório mensal e a verba do mês seguinte aprovada até o dia 25.",
  source: "SOCIAL 06",
  steps: [
    {
      key: "monthly_report",
      name: "Relatório mensal",
      description: "Relatório do mês anterior: custo por lead e por lead qualificado.",
      actor: "boop",
      target: monthBusinessDay(10),
    },
    {
      key: "next_budget",
      name: "Verba do mês seguinte aprovada",
      description: "O cliente aprova a verba do mês seguinte até o dia 25.",
      actor: "client",
      target: monthDay(25),
      gate: "Verba do mês seguinte aprovada até o dia 25.",
    },
    {
      key: "weekly_optimization",
      name: "Otimizações semanais",
      description: "As otimizações de toda semana do mês feitas.",
      actor: "boop",
      target: monthDay(28),
    },
  ],
}

export const JOURNEY_CATALOG: Record<JourneyLine, JourneyLineDef> = {
  social: {
    line: "social",
    name: JOURNEY_LINE_LABEL.social,
    modes: true,
    phases: [entryPhase("social"), SOCIAL_ONBOARDING, SOCIAL_ONGOING, RENEWAL, OFFBOARDING],
  },
  traffic: {
    line: "traffic",
    name: JOURNEY_LINE_LABEL.traffic,
    modes: false,
    phases: [entryPhase("traffic"), TRAFFIC_ONBOARDING, TRAFFIC_ONGOING, RENEWAL, OFFBOARDING],
  },
}

export function phaseDef(line: JourneyLine, phase: JourneyPhase): JourneyPhaseDef {
  const def = JOURNEY_CATALOG[line].phases.find((candidate) => candidate.phase === phase)
  if (!def) throw new Error(`Fase ${phase} sem catálogo na linha ${line}`)
  return def
}

/** A etapa de uma linha pela chave (com a fase dela). */
export function findStep(line: JourneyLine, key: string): { phase: JourneyPhase; step: JourneyStepDef } | null {
  for (const def of JOURNEY_CATALOG[line].phases) {
    const step = def.steps.find((candidate) => candidate.key === key)
    if (step) return { phase: def.phase, step }
  }
  return null
}

export function isJourneyLine(value: unknown): value is JourneyLine {
  return typeof value === "string" && (JOURNEY_LINES as readonly string[]).includes(value)
}

export function isJourneyPhase(value: unknown): value is JourneyPhase {
  return typeof value === "string" && (JOURNEY_PHASES as readonly string[]).includes(value)
}

export function isJourneyMode(value: unknown): value is JourneyMode {
  return value === "compact" || value === "full"
}

/**
 * A linha da jornada que um serviço vendido no Comercial começa ("Tráfego
 * pago" → tráfego; "Site" → nenhuma, é projeto; o resto → social).
 */
export function lineForService(service: string | null): JourneyLine | null {
  const text = (service ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  if (/trafego|ads|anuncio/.test(text)) return "traffic"
  if (/\bsite\b|landing/.test(text)) return null
  return "social"
}
