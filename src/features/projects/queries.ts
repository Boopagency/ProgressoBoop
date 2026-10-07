import "server-only"

import { cache } from "react"

import { requireUser } from "@/features/auth/session"
import { PROJECT_COLUMNS } from "@/features/projects/columns"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { Project } from "@/lib/types"

/** Um projeto (metadados da página e a própria página usam a mesma leitura). */
export const getProject = cache(async (id: string): Promise<Project | null> => {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from("projects").select(PROJECT_COLUMNS).eq("id", id).maybeSingle()
  if (error) throw loadError(error, "o projeto")
  return data
})
