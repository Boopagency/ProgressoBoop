import { createClientFileUpload, discardClientFileUpload } from "@/features/client-files/actions"
import { CLIENT_FILE_MAX, CLIENT_FILE_TYPES_HINT, resolveFileType } from "@/features/client-files/logic"

/**
 * Envia um documento do cliente: o servidor confere a sessão e devolve uma URL
 * assinada de envio (o arquivo vai direto ao Storage, sem passar pelo limite
 * das Server Actions) e o caminho que vai no banco.
 */
export async function uploadClientFile(clientId: string, original: File): Promise<string> {
  const type = resolveFileType(original.name, original.type)
  if (!type) throw new Error(`Esse tipo de arquivo não é aceito. Use ${CLIENT_FILE_TYPES_HINT}.`)
  if (original.size > CLIENT_FILE_MAX) throw new Error("O arquivo precisa ter até 25 MB.")
  const file = original.type === type ? original : new File([original], original.name, { type })

  const ticket = await createClientFileUpload(clientId, file.type, file.size)
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
  if (!response.ok) throw new Error("Não foi possível enviar o arquivo. Tente de novo.")
  return ticket.data.path
}

/** Apaga um arquivo enviado que não foi salvo. */
export async function discardClientFile(clientId: string, path: string): Promise<void> {
  await discardClientFileUpload(clientId, path).catch(() => undefined)
}
