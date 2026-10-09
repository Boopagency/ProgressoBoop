import { addDaysToKey, describeDue, isDateKey } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { foldText } from "@/lib/text"
import { isUuid } from "@/lib/utils"

/*
 * Regras puras das ferramentas do MCP: leitura dos argumentos que o Claude
 * manda (podem vir em qualquer formato), busca de pessoas, clientes,
 * projetos e canais pelo nome, e formatação das respostas em texto.
 */

export type Parsed<T> = { ok: true; value: T } | { ok: false; error: string }

type Args = Record<string, unknown>

/** Texto opcional: espaços aparados; vazio vira null. */
export function readText(args: Args, key: string, max: number): Parsed<string | null> {
  const raw = args[key]
  if (raw === undefined || raw === null) return { ok: true, value: null }
  if (typeof raw !== "string") return { ok: false, error: `"${key}" deve ser um texto.` }
  const text = raw.replace(/\r\n?/g, "\n").trim()
  if (text.length > max) return { ok: false, error: `"${key}" passa do limite de ${max} caracteres.` }
  return { ok: true, value: text || null }
}

export function readRequiredText(args: Args, key: string, max: number): Parsed<string> {
  const parsed = readText(args, key, max)
  if (!parsed.ok) return parsed
  if (!parsed.value) return { ok: false, error: `Informe "${key}".` }
  return { ok: true, value: parsed.value }
}

export function readBoolean(args: Args, key: string): boolean {
  const raw = args[key]
  return raw === true || raw === "true" || raw === "sim"
}

/** Lista de textos: array ou texto separado por vírgula ("Jabez, Renatha"). */
export function readList(args: Args, key: string): Parsed<string[]> {
  const raw = args[key]
  if (raw === undefined || raw === null) return { ok: true, value: [] }
  const items = Array.isArray(raw) ? raw : typeof raw === "string" ? raw.split(/[,;]| e /) : null
  if (!items || !items.every((item) => typeof item === "string")) {
    return { ok: false, error: `"${key}" deve ser uma lista de nomes.` }
  }
  return { ok: true, value: items.map((item) => item.trim()).filter(Boolean).slice(0, 10) }
}

/**
 * Data de prazo: "hoje", "amanhã", "2026-10-15" ou "15/10" (sem ano: a
 * próxima vez que o dia acontece, a partir de hoje).
 */
export function readDate(args: Args, key: string, today: DateKey): Parsed<DateKey | null> {
  const raw = args[key]
  if (raw === undefined || raw === null || raw === "") return { ok: true, value: null }
  if (typeof raw !== "string") return { ok: false, error: `"${key}" deve ser uma data (aaaa-mm-dd).` }
  const text = foldText(raw.trim())
  if (text === "hoje") return { ok: true, value: today }
  if (text === "amanha") return { ok: true, value: addDaysToKey(today, 1) }
  const match = text.match(/^(\d{1,2})\/(\d{1,2})(?:\/(\d{4}))?$/)
  if (isDateKey(text)) return { ok: true, value: text }
  if (match) {
    const [, day, month, year] = match
    const build = (y: string) => `${y}-${month!.padStart(2, "0")}-${day!.padStart(2, "0")}`
    const thisYear = today.slice(0, 4)
    let key = build(year ?? thisYear)
    if (!year && key < today) key = build(String(Number(thisYear) + 1))
    if (isDateKey(key)) return { ok: true, value: key }
  }
  return { ok: false, error: `Data inválida em "${key}": use aaaa-mm-dd (ex.: ${today}).` }
}

/* ------------------------------------------------------------------ */
/* Busca pelo nome                                                     */
/* ------------------------------------------------------------------ */

/**
 * Acha um item pelo id ou pelo nome, sem acento e sem diferença de
 * maiúsculas: nome igual primeiro, depois "começa com" e por fim "contém".
 * Mais de um no mesmo nível é ambíguo: a resposta lista as opções.
 */
export function findByName<T>(
  items: readonly T[],
  query: string,
  nameOf: (item: T) => string,
  idOf: (item: T) => string,
  what: string
): Parsed<T> {
  const trimmed = query.trim()
  if (isUuid(trimmed)) {
    const byId = items.find((item) => idOf(item) === trimmed.toLowerCase())
    return byId ? { ok: true, value: byId } : { ok: false, error: `Nenhum(a) ${what} com o id ${trimmed}.` }
  }
  const needle = foldText(trimmed)
  if (!needle) return { ok: false, error: `Informe o nome do(a) ${what}.` }
  const folded = items.map((item) => ({ item, name: foldText(nameOf(item)) }))
  const levels = [
    folded.filter(({ name }) => name === needle),
    folded.filter(({ name }) => name.startsWith(needle) || name.split(/\s+/).some((word) => word.startsWith(needle))),
    folded.filter(({ name }) => name.includes(needle)),
  ]
  for (const level of levels) {
    if (level.length === 1) return { ok: true, value: level[0]!.item }
    if (level.length > 1) {
      return { ok: false, error: `Mais de um(a) ${what} com "${trimmed}": ${namesList(level.map(({ item }) => nameOf(item)))}. Diga qual.` }
    }
  }
  const options = items.map(nameOf)
  return {
    ok: false,
    error: `Nenhum(a) ${what} com "${trimmed}".${options.length > 0 ? ` Opções: ${namesList(options)}.` : ""}`,
  }
}

function namesList(names: string[], max = 15): string {
  const shown = names.slice(0, max).join(", ")
  return names.length > max ? `${shown} e mais ${names.length - max}` : shown
}

/* ------------------------------------------------------------------ */
/* Formatação                                                          */
/* ------------------------------------------------------------------ */

/** "1 post", "3 posts". */
export function count(total: number, singular: string, plural: string): string {
  return `${total} ${total === 1 ? singular : plural}`
}

export function dueLabel(due: DateKey | null, today: DateKey): string {
  return describeDue(due, today).label
}

/** Uma linha só, curta: o resto do texto fica no app. */
export function excerpt(text: string, max = 160): string {
  const line = text.replace(/\s+/g, " ").trim()
  return line.length > max ? `${line.slice(0, max - 1)}…` : line
}

/** "- a · b · c" sem os pedaços vazios. */
export function bullet(...parts: (string | null | undefined | false)[]): string {
  return `- ${parts.filter((part): part is string => Boolean(part)).join(" · ")}`
}

/** Seção com título e linhas; sem linhas, não aparece. */
export function section(title: string, lines: string[]): string | null {
  return lines.length > 0 ? `${title}\n${lines.join("\n")}` : null
}

export function joinSections(...sections: (string | null)[]): string {
  return sections.filter((part): part is string => part !== null).join("\n\n")
}
