import { createAvatarUpload } from "@/features/account/actions"
import { prepareImage } from "@/features/content/image-upload"

/** Lado maior da foto depois de reduzir no navegador. */
const AVATAR_SIDE = 400

/**
 * Envia a foto da conta: reduz no navegador, pede ao servidor uma URL
 * assinada na pasta da própria conta e manda o arquivo direto ao Storage.
 * Devolve o caminho no bucket, que `saveMyAvatar` grava no perfil.
 */
export async function uploadAvatar(original: File): Promise<string> {
  const file = await prepareImage(original, AVATAR_SIDE)
  const ticket = await createAvatarUpload(file.type, file.size)
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
  if (!response.ok) throw new Error("Não foi possível enviar a foto. Tente de novo.")
  return ticket.data.path
}
