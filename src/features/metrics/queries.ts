import "server-only"

import { cache } from "react"

import { requireUser } from "@/features/auth/session"
import { fetchClientReviews, fetchClients, getClientReviews, getClients } from "@/features/clients/queries"
import { fetchDeals, getDeals } from "@/features/deals/queries"
import { fetchFinance, getFinance } from "@/features/finance/queries"
import type { MetricsSource } from "@/features/metrics/catalog"
import { PROJECT_COLUMNS } from "@/features/projects/columns"
import { fetchTasks, getTasks } from "@/features/tasks/queries"
import { loadError } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"

/** Tudo de que os indicadores precisam (financeiro, comercial e operação), em paralelo. */
export const getMetricsSource = cache(async (): Promise<MetricsSource> => {
  await requireUser()
  const supabase = await createClient()
  const [finance, deals, tasks, clients, reviews, projects] = await Promise.all([
    getFinance(),
    getDeals(),
    getTasks(),
    getClients(),
    getClientReviews(),
    supabase.from("projects").select(PROJECT_COLUMNS).order("starts_on"),
  ])
  if (projects.error) throw loadError(projects.error, "os projetos")
  return { finance, deals, tasks, clients, reviews, projects: projects.data }
})

/**
 * O mesmo com o cliente de quem chama (o token do conector do Claude), sob o
 * RLS. As telas ficam com getMetricsSource, que reaproveita as leituras em
 * cache da mesma página.
 */
export async function fetchMetricsSource(supabase: SupabaseServerClient): Promise<MetricsSource> {
  const [finance, deals, tasks, clients, reviews, projects] = await Promise.all([
    fetchFinance(supabase),
    fetchDeals(supabase),
    fetchTasks(supabase),
    fetchClients(supabase),
    fetchClientReviews(supabase),
    supabase.from("projects").select(PROJECT_COLUMNS).order("starts_on"),
  ])
  if (projects.error) throw loadError(projects.error, "os projetos")
  return { finance, deals, tasks, clients, reviews, projects: projects.data }
}
