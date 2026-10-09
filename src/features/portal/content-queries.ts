import "server-only"

import { cache } from "react"

import { asSlides } from "@/features/content/queries"
import type { PortalPost } from "@/features/portal/content-logic"
import { requirePortalUser } from "@/features/portal/session"
import type { Database } from "@/lib/supabase/database.types"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { MessageKind } from "@/lib/types"

/*
 * Leitura do conteúdo no portal, só pelas funções `portal_*` com a sessão da
 * pessoa: o banco confere o cliente e a etapa. Os tipos gerados marcam as
 * colunas das funções como obrigatórias; aqui as que podem vir vazias voltam
 * a aceitar null.
 */

type PostRow = Database["public"]["Functions"]["portal_posts"]["Returns"][number]
type MessageRow = Database["public"]["Functions"]["portal_post_messages"]["Returns"][number]

/** Perfil do Instagram do cliente (cabeçalho do feed). */
export interface PortalProfile {
  client_id: string
  client_name: string
  instagram_handle: string | null
  instagram_bio: string | null
  avatar_path: string | null
}

/** Mensagem do chat do post, como o cliente vê. */
export interface PortalMessage {
  id: string
  kind: MessageKind
  body: string
  author_name: string
  from_team: boolean
  mine: boolean
  resolved: boolean
  created_at: string
  edited_at: string | null
}

function toPost(row: PostRow): PortalPost {
  return {
    id: row.id,
    title: row.title,
    format: row.format,
    networks: row.networks ?? [],
    publish_on: row.publish_on ?? null,
    publish_time: row.publish_time ?? null,
    stage: row.stage,
    caption: row.caption ?? null,
    slides: asSlides(row.slides),
    cover_path: row.cover_path ?? null,
    pinned: row.pinned ?? false,
    published_at: row.published_at ?? null,
    updated_at: row.updated_at,
  }
}

export function toPortalMessage(row: MessageRow): PortalMessage {
  return {
    id: row.id,
    kind: row.kind,
    body: row.body,
    author_name: row.author_name,
    from_team: row.from_team,
    mine: row.mine,
    resolved: row.resolved,
    created_at: row.created_at,
    edited_at: row.edited_at ?? null,
  }
}

/** Posts do cliente que a conta vê. Cliente de outra conta volta vazio. */
export const getPortalPosts = cache(async (clientId: string): Promise<PortalPost[]> => {
  await requirePortalUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("portal_posts", { target_client: clientId })
  if (error) throw loadError(error, "os posts")
  return (data ?? []).map(toPost)
})

export const getPortalProfile = cache(async (clientId: string): Promise<PortalProfile | null> => {
  await requirePortalUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("portal_client_profile", { target_client: clientId })
  if (error) throw loadError(error, "o perfil")
  const row = data?.[0]
  if (!row) return null
  return {
    client_id: row.client_id,
    client_name: row.client_name,
    instagram_handle: row.instagram_handle ?? null,
    instagram_bio: row.instagram_bio ?? null,
    avatar_path: row.avatar_path ?? null,
  }
})

export const getPortalPostMessages = cache(async (postId: string): Promise<PortalMessage[]> => {
  await requirePortalUser()
  const supabase = await createClient()
  const { data, error } = await supabase.rpc("portal_post_messages", { target_post: postId })
  if (error) throw loadError(error, "as mensagens")
  return (data ?? []).map(toPortalMessage)
})
