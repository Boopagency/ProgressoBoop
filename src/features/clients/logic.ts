import { expandEvents, type Occurrence } from "@/features/calendar/recurrence"
import { isDone } from "@/features/tasks/logic"
import { addDaysToKey, addMonthsToKey, formatMonthYear } from "@/lib/dates"
import type {
  CalendarEvent,
  ClientDetail,
  ClientHealth,
  ClientReview,
  DateKey,
  ReviewCheckItem,
  Task,
} from "@/lib/types"

/**
 * Regras dos Clientes: funções puras sobre o cadastro, as revisões mensais,
 * as tarefas e os eventos de cada cliente.
 *
 * - Cada cliente ativo com revisão mensal tem uma revisão por mês, que vence
 *   no `review_day` do mês (padrão: dia 10).
 * - A saúde atual é a da revisão mais recente que tem saúde marcada.
 */

/** Itens que toda revisão mensal confere (copiados para a revisão ao criar). */
export const REVIEW_CHECKLIST: readonly { key: string; label: string }[] = [
  { key: "deliveries", label: "Entregas do mês feitas como combinado" },
  { key: "results", label: "Resultados do mês analisados (números e metas)" },
  { key: "report", label: "Relatório do mês enviado ao cliente" },
  { key: "feedback", label: "Retorno do cliente registrado (satisfação e pedidos)" },
  { key: "finance", label: "Financeiro em dia (nota emitida e pagamento recebido)" },
  { key: "next_month", label: "Próximo mês planejado (prioridades e calendário)" },
  { key: "access", label: "Acessos e materiais em ordem" },
]

export function defaultChecklist(): ReviewCheckItem[] {
  return REVIEW_CHECKLIST.map((item) => ({ ...item, done: false }))
}

/** Frentes mais comuns, sugeridas no cadastro (dá para escrever outras). */
export const SERVICE_SUGGESTIONS = [
  "Social media",
  "Tráfego pago",
  "Conteúdo",
  "Vídeo",
  "Site",
  "Identidade visual",
  "Estratégia",
  "Consultoria",
] as const

/* ------------------------------------------------------------------ */
/* Meses                                                               */
/* ------------------------------------------------------------------ */

/** Mês de referência de um dia: o dia 1 daquele mês. */
export function periodOf(day: DateKey): DateKey {
  return `${day.slice(0, 7)}-01`
}

export function addPeriods(period: DateKey, months: number): DateKey {
  return addMonthsToKey(period, months)
}

/** "outubro" */
export function monthName(period: DateKey): string {
  return formatMonthYear(period).split(" ")[0]!.toLocaleLowerCase("pt-BR")
}

/** "Outubro de 2026" */
export function periodLabel(period: DateKey): string {
  return formatMonthYear(period)
}

/** "2026-10" (para a URL) ↔ "2026-10-01". */
export function periodParam(period: DateKey): string {
  return period.slice(0, 7)
}

export function parsePeriodParam(value: unknown): DateKey | null {
  if (typeof value !== "string" || !/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) return null
  return `${value}-01`
}

/* ------------------------------------------------------------------ */
/* Revisão do mês                                                      */
/* ------------------------------------------------------------------ */

export type ReviewState = "off" | "done" | "in_progress" | "pending" | "overdue"

export interface ReviewStatus {
  period: DateKey
  /** Dia em que a revisão do mês vence (null sem revisão mensal). */
  due: DateKey | null
  state: ReviewState
  review: ClientReview | null
}

export function reviewDue(client: Pick<ClientDetail, "review_day">, period: DateKey): DateKey | null {
  if (!client.review_day) return null
  return `${period.slice(0, 8)}${String(client.review_day).padStart(2, "0")}`
}

/** Situação da revisão de um mês (por padrão, o mês de hoje). */
export function reviewStatus(
  client: Pick<ClientDetail, "id" | "active" | "review_day">,
  reviews: ClientReview[],
  today: DateKey,
  period: DateKey = periodOf(today)
): ReviewStatus {
  const review = reviews.find((candidate) => candidate.client_id === client.id && candidate.period === period) ?? null
  const due = reviewDue(client, period)
  if (review?.done) return { period, due, state: "done", review }
  if (!client.active || !due) return { period, due, state: review ? "in_progress" : "off", review }
  if (today > due) return { period, due, state: "overdue", review }
  return { period, due, state: review ? "in_progress" : "pending", review }
}

/** Revisões que precisam de atenção agora: atrasadas primeiro, depois as do mês. */
export function reviewsToDo(
  clients: ClientDetail[],
  reviews: ClientReview[],
  today: DateKey
): { client: ClientDetail; status: ReviewStatus }[] {
  const order: Record<ReviewState, number> = { overdue: 0, in_progress: 1, pending: 2, done: 3, off: 4 }
  return clients
    .filter((client) => client.active)
    .map((client) => ({ client, status: reviewStatus(client, reviews, today) }))
    .filter(({ status }) => status.state === "overdue" || status.state === "pending" || status.state === "in_progress")
    .sort(
      (a, b) =>
        order[a.status.state] - order[b.status.state] || a.client.name.localeCompare(b.client.name, "pt-BR")
    )
}

/** Saúde atual: a da revisão mais recente que tem saúde marcada. */
export function currentHealth(
  clientId: string,
  reviews: ClientReview[]
): { health: ClientHealth; period: DateKey } | null {
  const latest = reviews
    .filter((review) => review.client_id === clientId && review.health !== null)
    .sort((a, b) => (a.period < b.period ? 1 : -1))[0]
  return latest?.health ? { health: latest.health, period: latest.period } : null
}

/** Saúde mês a mês (mais recente primeiro), para o histórico. */
export function healthHistory(
  clientId: string,
  reviews: ClientReview[],
  today: DateKey,
  months = 6
): { period: DateKey; review: ClientReview | null }[] {
  const current = periodOf(today)
  return Array.from({ length: months }, (_, index) => {
    const period = addPeriods(current, -index)
    return {
      period,
      review: reviews.find((review) => review.client_id === clientId && review.period === period) ?? null,
    }
  })
}

/* ------------------------------------------------------------------ */
/* Tarefas e compromissos do cliente                                   */
/* ------------------------------------------------------------------ */

export interface ClientTaskStats {
  open: number
  overdue: number
  /** Tarefa aberta com o prazo mais próximo. */
  next: Task | null
}

export function clientTaskStats(tasks: Task[], clientId: string, today: DateKey): ClientTaskStats {
  const open = tasks.filter((task) => task.client_id === clientId && !isDone(task))
  const dated = open
    .filter((task) => task.due_date !== null)
    .sort((a, b) => (a.due_date! < b.due_date! ? -1 : a.due_date! > b.due_date! ? 1 : 0))
  return {
    open: open.length,
    overdue: open.filter((task) => task.due_date !== null && task.due_date < today).length,
    next: dated.find((task) => task.due_date! >= today) ?? dated[0] ?? null,
  }
}

/** Próximos compromissos com o cliente (reuniões e entregas), a partir de hoje. */
export function upcomingClientEvents(
  events: CalendarEvent[],
  clientId: string,
  today: DateKey,
  days = 60
): Occurrence[] {
  return expandEvents(
    events.filter((event) => event.client_id === clientId && event.event_type !== "internal"),
    { start: today, end: addDaysToKey(today, days) }
  )
}

/** Clientes ativos primeiro (por nome), depois os inativos. */
export function compareClients(a: ClientDetail, b: ClientDetail): number {
  if (a.active !== b.active) return a.active ? -1 : 1
  return a.name.localeCompare(b.name, "pt-BR")
}

/** Checklist de uma revisão: itens salvos, ou o padrão para uma revisão nova. */
export function checklistOf(review: ClientReview | null): ReviewCheckItem[] {
  return review && review.checklist.length > 0 ? review.checklist : defaultChecklist()
}
