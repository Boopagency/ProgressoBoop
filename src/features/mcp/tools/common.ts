import "server-only"

import type { McpContext } from "@/features/mcp/auth"
import { bullet, dueLabel, findByName, isClear, readDate, readList, readText, type Parsed } from "@/features/mcp/logic"
import { textResult, type ToolResult } from "@/features/mcp/protocol"
import type { Directory, Names } from "@/features/mcp/queries"
import { isDone } from "@/features/tasks/logic"
import { formatLongDate, formatShortDate, toDateKey } from "@/lib/dates"
import { TASK_PRIORITY_LABEL } from "@/lib/labels"
import { foldText } from "@/lib/text"
import type { DateKey, Project, Task } from "@/lib/types"

/* Peças comuns às ferramentas de cada área: anotações, nomes, datas e a exclusão em dois passos. */

type Args = Record<string, unknown>

export const READ_ONLY = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false } as const
export const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const
export const EDIT = { ...WRITE, idempotentHint: true } as const
export const DESTRUCTIVE = { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: false } as const

export const LIST_LIMIT = 40

/** Campo `confirmar` das ferramentas que apagam. */
export const CONFIRM = {
  type: "boolean",
  description: "Só com true apaga de verdade. Sem isso, a ferramenta só descreve o que seria apagado.",
} as const

/**
 * Exclusão em dois passos: sem `confirmar: true` (exatamente o booleano),
 * devolve o que seria apagado e o que vai junto, e não apaga nada.
 */
export function confirmFirst(args: Args, what: string, details: string[]): ToolResult | null {
  if (args.confirmar === true) return null
  return textResult(
    [
      `Nada foi apagado. Excluir ${what}:`,
      ...details.map((line) => `- ${line}`),
      "Não dá para desfazer. Confirme com a pessoa e, se ela quiser, chame de novo com confirmar: true.",
    ].join("\n")
  )
}

/** Valor de um enum pelo código ("high") ou pelo rótulo ("Alta"), sem acento. */
export function enumValue<T extends string>(raw: string | null, values: readonly T[], labels: Record<T, string>): T | null | undefined {
  if (raw === null) return null
  const needle = foldText(raw)
  return values.find((value) => value === needle || foldText(labels[value]) === needle)
}

export function enumOptions<T extends string>(values: readonly T[], labels: Record<T, string>): string[] {
  return values.map((value) => foldText(labels[value]))
}

export function isMe(text: string): boolean {
  return ["eu", "mim", "me", "minhas", "meu", "minha", "eu mesmo", "eu mesma"].includes(foldText(text.trim()))
}

export function todayLine(context: McpContext): string {
  return `Hoje: ${formatLongDate(context.today)} de ${context.today.slice(0, 4)}.`
}

export function limited(lines: string[], limit = LIST_LIMIT): string[] {
  return lines.length > limit ? [...lines.slice(0, limit), `- … e mais ${lines.length - limit}`] : lines
}

/* ------------------------------------------------------------------ */
/* Nomes → ids                                                         */
/* ------------------------------------------------------------------ */

export function findPerson(directory: Directory, name: string, userId: string): Parsed<{ id: string; full_name: string }> {
  if (isMe(name)) {
    const me = directory.profiles.find((profile) => profile.id === userId)
    if (me) return { ok: true, value: me }
  }
  return findByName(directory.profiles, name, (profile) => profile.full_name, (profile) => profile.id, "pessoa da equipe")
}

export function findPeople(directory: Directory, names: string[], userId: string): Parsed<string[]> {
  const ids: string[] = []
  for (const name of names) {
    const found = findPerson(directory, name, userId)
    if (!found.ok) return found
    ids.push(found.value.id)
  }
  return { ok: true, value: ids }
}

export function findClient(directory: Directory, query: string): Parsed<Directory["clients"][number]> {
  return findByName(directory.clients, query, (client) => client.name, (client) => client.id, "cliente")
}

export function findProject(directory: Directory, query: string, clientId?: string | null): Parsed<Project> {
  const candidates = clientId ? directory.projects.filter((project) => project.client_id === clientId) : directory.projects
  return findByName(candidates, query, (project) => project.name, (project) => project.id, "projeto")
}

/**
 * Lê `cliente` e `projeto` dos argumentos para um registro (só o que veio).
 * "nenhum" limpa; o projeto leva o cliente dele quando o cliente não veio.
 */
export function readLinks(
  args: Args,
  directory: Directory
): Parsed<{ client_id?: string | null; project_id?: string | null }> {
  const links: { client_id?: string | null; project_id?: string | null } = {}
  if ("cliente" in args) {
    if (isClear(args.cliente)) links.client_id = null
    else {
      const raw = readText(args, "cliente", 120)
      if (!raw.ok) return raw
      const found = findClient(directory, raw.value ?? "")
      if (!found.ok) return found
      links.client_id = found.value.id
    }
  }
  if ("projeto" in args) {
    if (isClear(args.projeto)) links.project_id = null
    else {
      const raw = readText(args, "projeto", 200)
      if (!raw.ok) return raw
      const found = findProject(directory, raw.value ?? "", links.client_id)
      if (!found.ok) return found
      links.project_id = found.value.id
      if (!("client_id" in links)) links.client_id = found.value.client_id
    }
  }
  return { ok: true, value: links }
}

/** Data opcional de um campo que pode ser limpo ("nenhum"); `undefined` = não veio. */
export function readOptionalDate(args: Args, key: string, today: DateKey): Parsed<DateKey | null | undefined> {
  if (!(key in args)) return { ok: true, value: undefined }
  if (isClear(args[key])) return { ok: true, value: null }
  return readDate(args, key, today)
}

/** Lista de pessoas (`responsaveis`), se veio. */
export function readPeople(args: Args, key: string, directory: Directory, userId: string): Parsed<string[] | undefined> {
  if (!(key in args)) return { ok: true, value: undefined }
  const names = readList(args, key)
  if (!names.ok) return names
  return findPeople(directory, names.value, userId)
}

/* ------------------------------------------------------------------ */
/* Linhas                                                              */
/* ------------------------------------------------------------------ */

/** "- Título · Venceu 07/10 · Alta · Velmont · Site · com Renatha · id …" */
export function taskLine(task: Task, names: Names, today: DateKey, exceptPerson?: string): string {
  const others = task.assignee_ids.filter((id) => id !== exceptPerson).map((id) => names.person(id)).filter(Boolean)
  return bullet(
    task.title,
    isDone(task)
      ? `concluída${task.completed_at ? ` em ${formatShortDate(toDateKey(task.completed_at), today)}` : ""}`
      : dueLabel(task.due_date, today),
    task.status === "doing" ? "Fazendo" : null,
    task.priority === "high" ? `prioridade ${TASK_PRIORITY_LABEL.high.toLowerCase()}` : null,
    names.client(task.client_id),
    names.project(task.project_id) ? `projeto ${names.project(task.project_id)}` : null,
    others.length > 0 ? `${exceptPerson ? "com" : "de"} ${others.join(", ")}` : null,
    `id ${task.id}`
  )
}
