import "server-only"

import { cache } from "react"

import { requireUser } from "@/features/auth/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ContentIdea } from "@/lib/types"

export const IDEA_COLUMNS = "id, client_id, title, notes, format, reference_url, post_id, created_by, created_at, updated_at"

/** Ideias de todos os clientes (ou de um), a mais nova primeiro. */
export const getContentIdeas = cache(async (clientId?: string): Promise<ContentIdea[]> => {
  await requireUser()
  const supabase = await createClient()
  let query = supabase.from("content_ideas").select(IDEA_COLUMNS)
  if (clientId) query = query.eq("client_id", clientId)
  const { data, error } = await query.order("created_at", { ascending: false }).limit(1000)
  if (error) throw loadError(error, "as ideias")
  return data
})
