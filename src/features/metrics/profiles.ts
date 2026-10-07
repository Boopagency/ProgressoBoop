import "server-only"

import { cache } from "react"

import { requireUser } from "@/features/auth/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { Profile } from "@/lib/types"

/** A equipe, na ordem de criação (Jabez, Renatha, Léo). */
export const getProfiles = cache(async (): Promise<Profile[]> => {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from("profiles").select("id, full_name, avatar_url, role").order("created_at")
  if (error) throw loadError(error, "a equipe")
  return data
})
