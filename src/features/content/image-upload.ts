import { createContentImageUpload, discardContentImages } from "@/features/content/actions"
import { DISCARD_MAX, IMAGE_TYPES } from "@/features/content/validation"

/**
 * Lado maior depois de reduzir: capas e slides no tamanho que o Instagram
 * mostra (1080 × 1440 no 3:4), a foto do perfil bem menor. O plano gratuito
 * do Supabase tem 1 GB de Storage.
 */
const MAX_SIDE = { post: 1440, avatar: 400 } as const
export type ContentImageKind = keyof typeof MAX_SIDE

/** Já pequena, no tamanho e num formato aceito: vai como está. */
const SMALL_FILE = 300 * 1024
const QUALITY = 0.85

function accepted(type: string): boolean {
  return (IMAGE_TYPES as readonly string[]).includes(type)
}

function toBlob(canvas: HTMLCanvasElement, type: string): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, QUALITY))
}

/**
 * Reduz a imagem no navegador antes de enviar: WebP quando o navegador
 * consegue gerar, senão JPEG (com fundo branco, que JPEG não tem
 * transparência). GIF e outros formatos viram uma imagem parada.
 */
async function prepareImage(file: File, maxSide: number): Promise<File> {
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) {
    if (accepted(file.type)) return file
    throw new Error("Não deu para abrir esta imagem. Use PNG, JPG ou WebP.")
  }

  const scale = Math.min(1, maxSide / Math.max(bitmap.width, bitmap.height))
  if (scale === 1 && accepted(file.type) && file.size <= SMALL_FILE) {
    bitmap.close()
    return file
  }
  const canvas = document.createElement("canvas")
  canvas.width = Math.max(1, Math.round(bitmap.width * scale))
  canvas.height = Math.max(1, Math.round(bitmap.height * scale))
  const context = canvas.getContext("2d")
  if (!context) {
    bitmap.close()
    if (accepted(file.type)) return file
    throw new Error("Não deu para preparar esta imagem. Use PNG, JPG ou WebP.")
  }
  context.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  let blob = await toBlob(canvas, "image/webp")
  if (blob?.type !== "image/webp") {
    context.globalCompositeOperation = "destination-over"
    context.fillStyle = "#ffffff"
    context.fillRect(0, 0, canvas.width, canvas.height)
    blob = await toBlob(canvas, "image/jpeg")
  }
  if (!blob || !accepted(blob.type) || (scale === 1 && accepted(file.type) && blob.size >= file.size)) {
    if (accepted(file.type)) return file
    throw new Error("Não deu para preparar esta imagem. Use PNG, JPG ou WebP.")
  }
  const extension = blob.type === "image/webp" ? "webp" : "jpg"
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "imagem"}.${extension}`, { type: blob.type })
}

/**
 * Envia uma imagem do cliente: o servidor confere a sessão e devolve uma URL
 * assinada de envio (o arquivo vai direto ao Storage, sem passar pelo limite
 * das Server Actions) e o caminho que vai no banco.
 */
export async function uploadContentImage(clientId: string, original: File, kind: ContentImageKind = "post"): Promise<string> {
  const file = await prepareImage(original, MAX_SIDE[kind])
  const ticket = await createContentImageUpload(clientId, file.type, file.size)
  if (!ticket.ok) throw new Error(ticket.error)

  const body = new FormData()
  body.append("cacheControl", "3600")
  body.append("", file)
  const response = await fetch(ticket.data.uploadUrl, {
    method: "PUT",
    body,
    headers: {
      "x-upsert": "false",
      apikey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "",
    },
  })
  if (!response.ok) throw new Error("Não foi possível enviar a imagem. Tente de novo.")
  return ticket.data.path
}

/** Apaga, em lotes, imagens enviadas que não foram salvas (as que estão em uso ficam). */
export async function discardUploads(paths: readonly string[]): Promise<void> {
  for (let start = 0; start < paths.length; start += DISCARD_MAX) {
    await discardContentImages(paths.slice(start, start + DISCARD_MAX)).catch(() => undefined)
  }
}
