import { createDocImageUpload } from "@/features/docs/actions"

/** Lado maior das fotos depois de reduzidas (suficiente para ler um print). */
const MAX_SIDE = 2000
/** Abaixo disso a imagem vai como está. */
const SMALL_FILE = 400 * 1024

/**
 * Reduz fotos e prints grandes antes de enviar (WebP quando o navegador
 * consegue gerar; senão mantém o arquivo original). GIFs vão como estão.
 */
async function prepareImage(file: File): Promise<File> {
  if (file.type === "image/gif" || file.size <= SMALL_FILE) return file
  const bitmap = await createImageBitmap(file).catch(() => null)
  if (!bitmap) return file

  const scale = Math.min(1, MAX_SIDE / Math.max(bitmap.width, bitmap.height))
  const canvas = document.createElement("canvas")
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  canvas.getContext("2d")?.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  bitmap.close()

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.86))
  if (!blob || blob.size >= file.size) return file
  const extension = blob.type === "image/webp" ? "webp" : blob.type === "image/jpeg" ? "jpg" : "png"
  return new File([blob], `${file.name.replace(/\.[^.]+$/, "") || "imagem"}.${extension}`, {
    type: blob.type,
  })
}

/**
 * Envia uma imagem do documento: o servidor confere a sessão e devolve uma
 * URL assinada de envio (o arquivo vai direto ao Storage, sem passar pelo
 * limite das Server Actions) e o endereço estável que entra no documento.
 */
export async function uploadDocImage(docId: string, original: File): Promise<string> {
  const file = await prepareImage(original)
  const ticket = await createDocImageUpload(docId, file.type, file.size)
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
  return ticket.data.url
}
