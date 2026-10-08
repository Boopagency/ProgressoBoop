import "server-only"

import { postImagePaths } from "@/features/content/logic"
import { asSlides } from "@/features/content/queries"
import type { SupabaseServerClient } from "@/lib/supabase/server"

/*
 * Arquivos do bucket privado `content` (capas, slides e foto do perfil do
 * cliente), sempre com a sessão da pessoa: as políticas do Storage deixam a
 * equipe ver, enviar e apagar. Apagar é limpeza de cortesia: uma falha aqui
 * não desfaz o que já foi salvo no banco.
 */

export const CONTENT_BUCKET = "content"

export async function removeContentImages(supabase: SupabaseServerClient, paths: readonly string[]): Promise<void> {
  if (paths.length === 0) return
  const { error } = await supabase.storage.from(CONTENT_BUCKET).remove([...paths])
  if (error) console.error(`[storage] ${error.message}`)
}

/** Todas as imagens de um cliente (foto do perfil, capas e slides dos posts), antes de excluí-lo. */
export async function clientContentImages(supabase: SupabaseServerClient, clientId: string): Promise<string[]> {
  const [client, posts] = await Promise.all([
    supabase.from("clients").select("avatar_path").eq("id", clientId).maybeSingle(),
    supabase.from("content_posts").select("cover_path, slides").eq("client_id", clientId),
  ])
  const paths = (posts.data ?? []).flatMap((post) =>
    postImagePaths({ cover_path: post.cover_path, slides: asSlides(post.slides) })
  )
  return client.data?.avatar_path ? [client.data.avatar_path, ...paths] : paths
}
