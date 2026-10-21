import { isUuid } from "@/lib/utils"
import type { Timestamp } from "@/lib/types"

/*
 * Entregas de uma etapa de projeto: o que o cliente precisa ver para aprovar
 * a etapa (ex.: o layout da home). Um link (Figma, Drive, prévia do site) ou
 * um arquivo (imagem ou PDF) no bucket privado `deliverables`, no caminho
 * `<client_id>/<task_id>/<arquivo>`. O cliente vê as entregas de toda etapa
 * que ele vê, na página do projeto no portal.
 */

export type DeliverableKind = "link" | "file"

export interface Deliverable {
  id: string
  task_id: string
  kind: DeliverableKind
  title: string
  url: string | null
  file_path: string | null
  mime_type: string | null
  created_at: Timestamp
}

/** Tamanho máximo de um arquivo (o bucket confere o mesmo). */
export const DELIVERABLE_FILE_MAX = 20 * 1024 * 1024
export const DELIVERABLE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"] as const
export const DELIVERABLE_TITLE_MAX = 200
export const DELIVERABLE_URL_MAX = 2000
/** O `accept` do campo de arquivo. */
export const DELIVERABLE_ACCEPT = DELIVERABLE_TYPES.join(",")

const EXTENSION: Record<(typeof DELIVERABLE_TYPES)[number], string> = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "application/pdf": "pdf",
}

export function isDeliverableType(value: unknown): value is (typeof DELIVERABLE_TYPES)[number] {
  return typeof value === "string" && (DELIVERABLE_TYPES as readonly string[]).includes(value)
}

export function deliverableExtension(type: (typeof DELIVERABLE_TYPES)[number]): string {
  return EXTENSION[type]
}

/** Caminho no bucket: `<client_id>/<task_id>/<uuid>.<ext>`. */
export function isDeliverablePath(value: unknown): value is string {
  if (typeof value !== "string") return false
  const parts = value.split("/")
  if (parts.length !== 3 || !isUuid(parts[0]) || !isUuid(parts[1])) return false
  const match = /^([0-9a-f-]{36})\.(png|jpg|webp|gif|pdf)$/i.exec(parts[2] ?? "")
  return match !== null && isUuid(match[1])
}

/** Endereço estável do arquivo no app: confere a sessão e redireciona para uma URL assinada. */
export function deliverableFileUrl(path: string): string {
  return `/api/entregas/${path}`
}

export function isImageDeliverable(item: Pick<Deliverable, "kind" | "mime_type">): boolean {
  return item.kind === "file" && (item.mime_type?.startsWith("image/") ?? false)
}

/** Para onde a entrega leva: o link ou o arquivo pelo app. */
export function deliverableHref(item: Pick<Deliverable, "kind" | "url" | "file_path">): string {
  return item.kind === "link" ? (item.url ?? "#") : item.file_path ? deliverableFileUrl(item.file_path) : "#"
}

/** Só o domínio do link, para a linha da entrega (ex.: "figma.com"). */
export function linkHost(url: string | null): string | null {
  if (!url) return null
  try {
    return new URL(url).hostname.replace(/^www\./, "")
  } catch {
    return null
  }
}

/**
 * Confere o link digitado: aceita sem o "https://" (completa) e só http(s).
 * Devolve o link pronto ou null.
 */
export function normalizeDeliverableUrl(raw: string): string | null {
  const text = raw.trim()
  if (!text || /\s/.test(text)) return null
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`
  try {
    const url = new URL(withScheme)
    if (url.protocol !== "https:" && url.protocol !== "http:") return null
    if (!url.hostname.includes(".")) return null
    const value = url.toString()
    return value.length <= DELIVERABLE_URL_MAX ? value : null
  } catch {
    return null
  }
}

/** Título da entrega a partir do nome do arquivo, sem a extensão. */
export function titleFromFileName(name: string): string {
  const base = name.replace(/\.[^.]+$/, "").trim() || "Arquivo"
  return base.slice(0, DELIVERABLE_TITLE_MAX)
}
