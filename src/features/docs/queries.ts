import "server-only"

import { cache } from "react"

import { requireUser } from "@/features/auth/session"
import { searchSnippet } from "@/features/docs/logic"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import { foldText } from "@/lib/text"
import type { Doc, DocSummary, DocVersion } from "@/lib/types"

export const SUMMARY_COLUMNS =
  "id, title, kind, status, area, client_id, owner_id, summary, review_every_months, reviewed_on, next_review_on, pinned, created_by, updated_by, created_at, updated_at, content_updated_at, content_updated_by"

/** Todos os documentos, sem o conteúdo (para listas, filtros e a tela Hoje). */
export async function getDocs(): Promise<DocSummary[]> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase.from("docs").select(SUMMARY_COLUMNS).order("title")
  if (error) throw loadError(error, "os processos")
  return data
}

/** Um documento completo. `null` se não existir. (Uma consulta por requisição: título e página.) */
export const getDoc = cache(async (id: string): Promise<Doc | null> => {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("docs")
    .select(`${SUMMARY_COLUMNS}, content`)
    .eq("id", id)
    .maybeSingle()
  if (error) throw loadError(error, "o processo")
  if (!data) return null
  return { ...data, content: Array.isArray(data.content) ? data.content : [] }
})

/** Versões anteriores (sem o conteúdo), da mais recente para a mais antiga. */
export async function getDocVersions(docId: string): Promise<DocVersion[]> {
  await requireUser()
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("doc_versions")
    .select("id, doc_id, title, saved_by, saved_at")
    .eq("doc_id", docId)
    .order("saved_at", { ascending: false })
    .limit(100)
  if (error) throw loadError(error, "as versões")
  return data
}

export interface DocSearchHit {
  id: string
  /** Trecho do texto em volta do que foi encontrado. */
  snippet: string | null
}

/**
 * Busca no título, no "para que serve" e no texto (busca textual do
 * Postgres em português, sem acento), com um trecho de cada resultado.
 */
export async function searchDocs(query: string): Promise<DocSearchHit[]> {
  await requireUser()
  const terms = foldText(query).trim()
  if (!terms) return []

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("docs")
    .select("id, content_text")
    .textSearch("search", terms, { config: "portuguese", type: "websearch" })
    .limit(50)
  if (error) throw loadError(error, "a busca")
  return data.map((row) => ({ id: row.id, snippet: searchSnippet(row.content_text, query) }))
}
