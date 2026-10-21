import type { ClientFileCategory, Timestamp } from "@/lib/types"

/*
 * Documentos do cliente (`client_files`, bucket `client-files`): arquivos que
 * a equipe envia e o cliente vê e baixa no portal. Funções puras, usadas no
 * admin, no portal e na rota de download.
 */

export const CLIENT_FILES_BUCKET = "client-files"

/** Até 25 MB por arquivo (o mesmo limite do bucket). */
export const CLIENT_FILE_MAX = 25 * 1024 * 1024
export const CLIENT_FILE_NAME_MAX = 200
export const CLIENT_FILE_DESCRIPTION_MAX = 500

/** Documento do cliente, como a equipe vê. */
export interface ClientFile {
  id: string
  client_id: string
  name: string
  category: ClientFileCategory
  description: string | null
  file_name: string
  mime_type: string
  size_bytes: number
  /** O cliente vê no portal. */
  client_visible: boolean
  created_at: Timestamp
}

/** Documento como o cliente vê no portal (só os visíveis). */
export type PortalClientFile = Omit<ClientFile, "client_id" | "client_visible">

export type FileKind = "pdf" | "image" | "doc" | "sheet" | "slides" | "archive" | "video" | "text"

/** Tipos aceitos (os mesmos do bucket) e a extensão de cada um, para quando o navegador não diz o tipo. */
const FILE_TYPES: Record<string, { kind: FileKind; extensions: readonly string[] }> = {
  "application/pdf": { kind: "pdf", extensions: ["pdf"] },
  "image/png": { kind: "image", extensions: ["png"] },
  "image/jpeg": { kind: "image", extensions: ["jpg", "jpeg"] },
  "image/webp": { kind: "image", extensions: ["webp"] },
  "image/gif": { kind: "image", extensions: ["gif"] },
  "application/msword": { kind: "doc", extensions: ["doc"] },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { kind: "doc", extensions: ["docx"] },
  "application/vnd.ms-excel": { kind: "sheet", extensions: ["xls"] },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { kind: "sheet", extensions: ["xlsx"] },
  "application/vnd.ms-powerpoint": { kind: "slides", extensions: ["ppt"] },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { kind: "slides", extensions: ["pptx"] },
  "text/plain": { kind: "text", extensions: ["txt"] },
  "text/csv": { kind: "sheet", extensions: ["csv"] },
  "application/zip": { kind: "archive", extensions: ["zip"] },
  "application/x-zip-compressed": { kind: "archive", extensions: [] },
  "video/mp4": { kind: "video", extensions: ["mp4"] },
}

/** Para o seletor de arquivo do navegador. */
export const CLIENT_FILE_ACCEPT = [
  ...Object.keys(FILE_TYPES),
  ...Object.values(FILE_TYPES).flatMap((type) => type.extensions.map((extension) => `.${extension}`)),
].join(",")

export const CLIENT_FILE_TYPES_HINT = "PDF, imagem, Word, Excel, PowerPoint, texto, CSV, ZIP ou vídeo MP4"

export function isClientFileType(mimeType: string): boolean {
  return Object.hasOwn(FILE_TYPES, mimeType)
}

function extensionOf(fileName: string): string {
  const match = /\.([a-z0-9]+)$/i.exec(fileName)
  return match?.[1]?.toLowerCase() ?? ""
}

/**
 * Tipo do arquivo para o envio: o que o navegador diz, quando aceito; senão,
 * pela extensão (ex.: CSV que o Windows marca como Excel, ou .docx sem tipo).
 * Null quando o tipo não é aceito.
 */
export function resolveFileType(fileName: string, browserType: string): string | null {
  const extension = extensionOf(fileName)
  const byExtension = Object.entries(FILE_TYPES).find(([, type]) => type.extensions.includes(extension))?.[0] ?? null
  if (isClientFileType(browserType)) {
    // O tipo do navegador vale quando combina com a extensão (ou não há outra pista).
    return byExtension && FILE_TYPES[browserType]?.kind !== FILE_TYPES[byExtension]?.kind ? byExtension : browserType
  }
  return byExtension
}

export function fileKindOf(mimeType: string): FileKind {
  return FILE_TYPES[mimeType]?.kind ?? "doc"
}

/** Abre no navegador (o resto só baixa). */
export function opensInBrowser(mimeType: string): boolean {
  const kind = fileKindOf(mimeType)
  return kind === "pdf" || kind === "image" || kind === "video" || kind === "text"
}

/** Nome sugerido a partir do arquivo: sem a extensão e com espaços no lugar de _ e -. */
export function suggestedName(fileName: string): string {
  const base = fileName.replace(/\.[^.]+$/, "").replace(/[_]+/g, " ").replace(/\s+/g, " ").trim()
  return (base || fileName).slice(0, CLIENT_FILE_NAME_MAX)
}

/** Ex.: "820 KB", "3,4 MB". */
export function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`
  const megabytes = bytes / (1024 * 1024)
  return `${megabytes.toLocaleString("pt-BR", { maximumFractionDigits: megabytes < 10 ? 1 : 0 })} MB`
}

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"
const PATH = new RegExp(`^(${UUID})/${UUID}$`)

/** Caminho `<client_id>/<uuid>` do bucket, do cliente indicado. */
export function isClientFilePath(path: unknown, clientId: string): path is string {
  return typeof path === "string" && PATH.exec(path)?.[1] === clientId
}

/** Endereço do arquivo pelo app (a rota confere a sessão e redireciona para uma URL assinada). */
export function clientFileHref(id: string, download = false): string {
  return download ? `/api/documentos/${id}?baixar=1` : `/api/documentos/${id}`
}
