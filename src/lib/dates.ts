import {
  addDays,
  addMonths,
  differenceInCalendarDays,
  endOfMonth,
  endOfWeek,
  format,
  isValid,
  parseISO,
  startOfMonth,
  startOfWeek,
} from "date-fns"
import { ptBR } from "date-fns/locale"

import type { DateKey, Timestamp } from "@/lib/types"

/**
 * Regras de data do Boop Admin.
 *
 * - Toda data "de calendário" (prazo, semana, dia) é uma `DateKey`
 *   (`yyyy-MM-dd`), comparável como texto.
 * - "Hoje" e o dia de um instante são sempre calculados no fuso de
 *   São Paulo, mesmo com o servidor em UTC.
 * - Semanas vão de segunda a domingo.
 */

export const TIME_ZONE = "America/Sao_Paulo"
export const WEEK_STARTS_ON = 1

const dayPartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
})

function zonedParts(instant: Date) {
  const parts = dayPartsFormatter.formatToParts(instant)
  const get = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((part) => part.type === type)?.value ?? "00"
  return {
    date: `${get("year")}-${get("month")}-${get("day")}`,
    hour: Number(get("hour")),
    time: `${get("hour")}:${get("minute")}`,
  }
}

function toDate(instant: Date | Timestamp): Date {
  return typeof instant === "string" ? new Date(instant) : instant
}

/** Dia (em São Paulo) de um instante. */
export function toDateKey(instant: Date | Timestamp): DateKey {
  return zonedParts(toDate(instant)).date
}

/** Horário `HH:mm` (em São Paulo) de um instante. */
export function toTimeLabel(instant: Date | Timestamp): string {
  return zonedParts(toDate(instant)).time
}

export function todayKey(now: Date = new Date()): DateKey {
  return toDateKey(now)
}

export function greetingFor(now: Date = new Date()): string {
  const hour = zonedParts(now).hour
  if (hour >= 5 && hour < 12) return "Bom dia"
  if (hour >= 12 && hour < 18) return "Boa tarde"
  return "Boa noite"
}

/** Converte uma `DateKey` em Date à meia-noite local, para aritmética de calendário. */
export function parseDateKey(key: DateKey): Date {
  return parseISO(key)
}

export function formatDateKey(date: Date): DateKey {
  return format(date, "yyyy-MM-dd")
}

export function isDateKey(value: unknown): value is DateKey {
  return (
    typeof value === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(value) &&
    isValid(parseISO(value)) &&
    formatDateKey(parseISO(value)) === value
  )
}

export function addDaysToKey(key: DateKey, days: number): DateKey {
  return formatDateKey(addDays(parseDateKey(key), days))
}

export function daysBetween(from: DateKey, to: DateKey): number {
  return differenceInCalendarDays(parseDateKey(to), parseDateKey(from))
}

export interface DateRange {
  start: DateKey
  end: DateKey
}

export function weekRangeOf(key: DateKey): DateRange {
  const date = parseDateKey(key)
  return {
    start: formatDateKey(startOfWeek(date, { weekStartsOn: WEEK_STARTS_ON })),
    end: formatDateKey(endOfWeek(date, { weekStartsOn: WEEK_STARTS_ON })),
  }
}

export function monthRangeOf(key: DateKey): DateRange {
  const date = parseDateKey(key)
  return {
    start: formatDateKey(startOfMonth(date)),
    end: formatDateKey(endOfMonth(date)),
  }
}

export function addMonthsToKey(key: DateKey, months: number): DateKey {
  return formatDateKey(addMonths(parseDateKey(key), months))
}

/** Próximo dia da semana (0 = domingo … 6 = sábado) estritamente depois de `from`. */
export function nextWeekdayKey(from: DateKey, weekday: number): DateKey {
  const current = parseDateKey(from).getDay()
  const offset = (weekday - current + 7) % 7 || 7
  return addDaysToKey(from, offset)
}

export function isWithin(key: DateKey, range: DateRange): boolean {
  return key >= range.start && key <= range.end
}

/** Lista de dias (inclusive) entre duas datas. */
export function eachDayKey(range: DateRange): DateKey[] {
  const days: DateKey[] = []
  for (let key = range.start; key <= range.end; key = addDaysToKey(key, 1)) {
    days.push(key)
  }
  return days
}

/* ------------------------------------------------------------------ */
/* Formatação em pt-BR                                                 */
/* ------------------------------------------------------------------ */

export function capitalize(text: string): string {
  return text.charAt(0).toLocaleUpperCase("pt-BR") + text.slice(1)
}

function fmt(key: DateKey, pattern: string): string {
  return format(parseDateKey(key), pattern, { locale: ptBR })
}

/** "Sexta-feira, 25 de setembro" */
export function formatLongDate(key: DateKey): string {
  return capitalize(fmt(key, "EEEE, d 'de' MMMM"))
}

/** "25/09" (com ano quando diferente do ano de referência) */
export function formatShortDate(key: DateKey, referenceKey?: DateKey): string {
  const sameYear = !referenceKey || key.slice(0, 4) === referenceKey.slice(0, 4)
  return fmt(key, sameYear ? "dd/MM" : "dd/MM/yyyy")
}

/** "sex" */
export function formatWeekdayShort(key: DateKey): string {
  return fmt(key, "EEEEEE")
}

/** "25 de setembro" */
export function formatDayMonth(key: DateKey): string {
  return fmt(key, "d 'de' MMMM")
}

/** "Setembro de 2026" */
export function formatMonthYear(key: DateKey): string {
  return capitalize(fmt(key, "MMMM 'de' yyyy"))
}

/** "21 a 27 de setembro" · "28 de setembro a 4 de outubro" */
export function formatRange(range: DateRange): string {
  const sameMonth = range.start.slice(0, 7) === range.end.slice(0, 7)
  const sameYear = range.start.slice(0, 4) === range.end.slice(0, 4)
  if (sameMonth) return `${fmt(range.start, "d")} a ${fmt(range.end, "d 'de' MMMM")}`
  if (sameYear) return `${fmt(range.start, "d 'de' MMMM")} a ${fmt(range.end, "d 'de' MMMM")}`
  return `${fmt(range.start, "d 'de' MMMM 'de' yyyy")} a ${fmt(range.end, "d 'de' MMMM 'de' yyyy")}`
}

export type DueTone = "overdue" | "today" | "soon" | "future" | "none"

/** Prazo em linguagem natural: "Venceu 24/09", "Hoje", "Amanhã", "Sáb, 26/09". */
export function describeDue(
  due: DateKey | null,
  today: DateKey
): { label: string; tone: DueTone } {
  if (!due) return { label: "Sem prazo", tone: "none" }
  const diff = daysBetween(today, due)
  if (diff < 0) return { label: `Venceu ${formatShortDate(due, today)}`, tone: "overdue" }
  if (diff === 0) return { label: "Hoje", tone: "today" }
  if (diff === 1) return { label: "Amanhã", tone: "soon" }
  const sameYear = due.slice(0, 4) === today.slice(0, 4)
  if (!sameYear) return { label: formatShortDate(due, today), tone: "future" }
  return {
    label: `${capitalize(formatWeekdayShort(due))}, ${formatShortDate(due)}`,
    tone: "future",
  }
}
