import { addDeliverableFile, createDeliverableUpload } from "@/features/deliverables/actions"
import { titleFromFileName, type Deliverable } from "@/features/deliverables/logic"

/**
 * Envia um arquivo de entrega (imagem ou PDF, como está: o layout precisa da
 * resolução original): o servidor confere a sessão e devolve uma URL assinada
 * de envio, o arquivo vai direto ao Storage e depois a entrega é salva.
 */
export async function uploadDeliverable(taskId: string, file: File): Promise<Deliverable> {
  const ticket = await createDeliverableUpload(taskId, file.type, file.size)
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

  const saved = await addDeliverableFile(taskId, {
    title: titleFromFileName(file.name),
    path: ticket.data.path,
    contentType: file.type,
    size: file.size,
  })
  if (!saved.ok) throw new Error(saved.error)
  return saved.data
}
