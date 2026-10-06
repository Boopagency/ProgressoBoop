import { TASK_AREAS } from "@/lib/labels"
import { findMatches, foldText, includesText } from "@/lib/text"
import type { DateKey, DocSummary, TaskArea } from "@/lib/types"

/**
 * Regras dos Processos: funções puras, sem React, sobre os documentos e os
 * blocos do editor (BlockNote, guardados como JSON).
 *
 * - "Revisar": status "Revisar" ou, em vigor, com a próxima revisão vencida.
 * - O texto puro do documento (para a busca e os trechos) sai dos blocos.
 */

/** Um bloco do BlockNote como vem do banco (formato tolerante a versões). */
interface BlockJson {
  id?: unknown
  type?: unknown
  props?: Record<string, unknown>
  content?: unknown
  children?: unknown
}

function asBlocks(value: unknown): BlockJson[] {
  return Array.isArray(value)
    ? value.filter((item): item is BlockJson => typeof item === "object" && item !== null)
    : []
}

/** Texto do conteúdo em linha: texto simples, trechos com estilo e links. */
function inlineText(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .map((item) => {
      if (typeof item === "string") return item
      if (typeof item !== "object" || item === null) return ""
      const node = item as { text?: unknown; content?: unknown }
      if (typeof node.text === "string") return node.text
      return inlineText(node.content)
    })
    .join("")
}

function tableText(content: Record<string, unknown>): string {
  const rows = Array.isArray(content.rows) ? content.rows : []
  return rows
    .map((row) => {
      const cells = (row as { cells?: unknown }).cells
      if (!Array.isArray(cells)) return ""
      return cells
        .map((cell) =>
          Array.isArray(cell) || typeof cell === "string"
            ? inlineText(cell)
            : inlineText((cell as { content?: unknown })?.content)
        )
        .join(" | ")
    })
    .filter(Boolean)
    .join("\n")
}

function blockText(block: BlockJson): string {
  const { content, props } = block
  const text =
    typeof content === "object" && content !== null && !Array.isArray(content)
      ? tableText(content as Record<string, unknown>)
      : inlineText(content)
  // Imagens e arquivos: a legenda entra na busca.
  const caption = typeof props?.caption === "string" ? props.caption : ""
  return [text, caption].filter(Boolean).join(" ")
}

/** Percorre os blocos (e os filhos, recuados) em ordem. */
function walk(blocks: unknown, visit: (block: BlockJson, depth: number) => void, depth = 0) {
  for (const block of asBlocks(blocks)) {
    visit(block, depth)
    walk(block.children, visit, depth + 1)
  }
}

/** Texto puro do documento, uma linha por bloco. */
export function blocksToText(blocks: unknown): string {
  const lines: string[] = []
  walk(blocks, (block) => {
    const text = blockText(block).trim()
    if (text) lines.push(text)
  })
  return lines.join("\n")
}

export interface ChecklistItem {
  id: string
  text: string
  checked: boolean
}

/** Itens de checklist do documento (os que viram tarefas). */
export function checklistItems(blocks: unknown): ChecklistItem[] {
  const items: ChecklistItem[] = []
  walk(blocks, (block) => {
    if (block.type !== "checkListItem") return
    const text = blockText(block).trim()
    if (!text) return
    items.push({
      id: typeof block.id === "string" ? block.id : `item-${items.length}`,
      text,
      checked: block.props?.checked === true,
    })
  })
  return items
}

export interface Heading {
  id: string
  level: number
  text: string
}

/** Títulos do documento, para o índice "Neste documento". */
export function headings(blocks: unknown): Heading[] {
  const result: Heading[] = []
  walk(blocks, (block) => {
    if (block.type !== "heading" || typeof block.id !== "string") return
    const text = blockText(block).trim()
    if (!text) return
    const level = Number(block.props?.level ?? 1)
    result.push({ id: block.id, level: Number.isFinite(level) ? level : 1, text })
  })
  return result
}

/* ------------------------------------------------------------------ */
/* Revisão                                                             */
/* ------------------------------------------------------------------ */

export function needsReview(
  doc: Pick<DocSummary, "status" | "next_review_on">,
  today: DateKey
): boolean {
  if (doc.status === "review") return true
  return doc.status === "active" && doc.next_review_on !== null && doc.next_review_on <= today
}

/* ------------------------------------------------------------------ */
/* Organização e busca                                                 */
/* ------------------------------------------------------------------ */

/** Fixados primeiro, depois por título. */
export function compareDocs(a: DocSummary, b: DocSummary): number {
  if (a.pinned !== b.pinned) return a.pinned ? -1 : 1
  return a.title.localeCompare(b.title, "pt-BR")
}

/** Seções da biblioteca: uma por área (na ordem das áreas) e "Sem área" no fim. */
export function groupByArea(docs: DocSummary[]): { area: TaskArea | null; docs: DocSummary[] }[] {
  const groups = new Map<TaskArea | null, DocSummary[]>()
  for (const doc of docs) {
    const list = groups.get(doc.area) ?? []
    list.push(doc)
    groups.set(doc.area, list)
  }
  const order: (TaskArea | null)[] = [...TASK_AREAS, null]
  return order
    .filter((area) => groups.has(area))
    .map((area) => ({ area, docs: (groups.get(area) ?? []).sort(compareDocs) }))
}

/** O título ou o "para que serve" batem com a busca (sem acento)? */
export function matchesQuick(doc: Pick<DocSummary, "title" | "summary">, query: string): boolean {
  return includesText(doc.title, query) || (doc.summary !== null && includesText(doc.summary, query))
}

/** Trecho do texto em volta da primeira ocorrência da busca, com reticências. */
export function searchSnippet(text: string, query: string, radius = 70): string | null {
  const match = findMatches(text, query, 1)[0]
  if (!match) {
    // A busca do banco acha por radical ("processos" → "processo"); tenta palavra a palavra.
    const word = foldText(query).split(/\s+/).find((part) => part.length >= 4)
    if (!word) return null
    return word === query ? null : searchSnippet(text, word.slice(0, -1), radius)
  }
  const start = Math.max(0, match.start - radius)
  const end = Math.min(text.length, match.end + radius)
  const slice = text.slice(start, end).replace(/\s+/g, " ").trim()
  return `${start > 0 ? "…" : ""}${slice}${end < text.length ? "…" : ""}`
}
