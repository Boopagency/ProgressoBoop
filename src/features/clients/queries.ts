import "server-only"

import { requireUser } from "@/features/auth/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ClientDetail, ClientReview, ReviewCheckItem } from "@/lib/types"

const CLIENT_COLUMNS =
  "id, name, active, avatar_path, instagram_handle, instagram_bio, owner_id, services, since, contact_name, contact_email, contact_phone, notes, review_day, created_at, updated_at"

const REVIEW_COLUMNS =
  "id, client_id, period, health, checklist, notes, done, done_at, done_by, created_by, created_at, updated_at"

function asChecklist(value: unknown): ReviewCheckItem[] {
  if (!Array.isArray(value)) return []
  return value.filter(
    (item): item is ReviewCheckItem =>
      typeof item === "object" &&
      item !== null &&
      typeof (item as ReviewCheckItem).key === "string" &&
      typeof (item as ReviewCheckItem).label === "string" &&
      typeof (item as ReviewCheckItem).done === "boolean"
  )
}

/** Cadastro completo de todos os clientes (ativos e inativos). */
export async function getClients(): Promise<ClientDetail[]> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from("clients").select(CLIENT_COLUMNS).order("name")
  if (error) throw loadError(error, "os clientes")
  return data
}

export async function getClient(id: string): Promise<ClientDetail | null> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from("clients").select(CLIENT_COLUMNS).eq("id", id).maybeSingle()
  if (error) throw loadError(error, "o cliente")
  return data
}

/**
 * Revisões mensais (todas, ou de um cliente). O volume é pequeno: uma por
 * cliente por mês.
 */
export async function getClientReviews(clientId?: string): Promise<ClientReview[]> {
  await requireUser()
  const supabase = await createClient()
  let query = supabase.from("client_reviews").select(REVIEW_COLUMNS).order("period", { ascending: false })
  if (clientId) query = query.eq("client_id", clientId)
  const { data, error } = await query
  if (error) throw loadError(error, "as revisões")
  return data.map((review) => ({ ...review, checklist: asChecklist(review.checklist) }))
}
