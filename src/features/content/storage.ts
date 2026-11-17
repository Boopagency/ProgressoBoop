import "server-only"

import { postImagePaths } from "@/features/content/logic"
import { asSlides } from "@/features/content/queries"
import { IMAGE_MAX, IMAGE_TYPES } from "@/features/content/validation"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

/*
 * Arquivos do bucket privado `content` (capas, slides e foto do perfil do
 * cliente), sempre com a sessão da pessoa: as políticas do Storage deixam a
 * equipe ver, enviar e apagar. Apagar é limpeza de cortesia: uma falha aqui
 * não desfaz o que já foi salvo no banco.
 */

export const CONTENT_BUCKET = "content"

/**
 * URL assinada para enviar uma imagem direto ao Storage (PUT com o arquivo e
 * o Content-Type) e o caminho que vai no banco (`<client_id>/<arquivo>`).
 * Serve à tela e ao conector.
 */
export async function signContentImageUpload(
  supabase: SupabaseServerClient,
  clientId: string,
  contentType: string,
  size: number
): Promise<ActionResult<{ uploadUrl: string; path: string }>> {
  if (!(IMAGE_TYPES as readonly string[]).includes(contentType)) {
    return { ok: false, error: "Use uma imagem PNG, JPG ou WebP." }
  }
  if (!Number.isFinite(size) || size <= 0 || size > IMAGE_MAX) {
    return { ok: false, error: "A imagem precisa ter até 5 MB." }
  }
  const path = `${clientId}/${crypto.randomUUID()}`
  const { data, error } = await supabase.storage.from(CONTENT_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error(`[storage] ${error?.message ?? "sem dados"}`)
    return { ok: false, error: "Não foi possível enviar a imagem." }
  }
  return { ok: true, data: { uploadUrl: data.signedUrl, path } }
}

export async function removeContentImages(supabase: SupabaseServerClient, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await supabase.storage.from(CONTENT_BUCKET).remove([...paths])
  if (error) console.error(`[storage] ${error.message}`)
}

/** Todas as imagens de um cliente (foto do perfil, capas, slides e cópias em JPEG do Instagram), antes de excluí-lo. */
export async function clientContentImages(supabase: SupabaseServerClient, clientId: string): Promise<string[]> {
  const [client, posts] = await Promise.all([
    supabase.from("clients").select("avatar_path").eq("id", clientId).maybeSingle(),
    supabase.from("content_posts").select("cover_path, slides, publish_jpeg_paths").eq("client_id", clientId),
  ])
  const paths = (posts.data ?? []).flatMap((post) => [
    ...postImagePaths({ cover_path: post.cover_path, slides: asSlides(post.slides) }),
    ...post.publish_jpeg_paths,
  ])
  return client.data?.avatar_path ? [client.data.avatar_path, ...paths] : paths
}
