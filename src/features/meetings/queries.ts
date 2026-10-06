import "server-only"

import { requireUser } from "@/features/auth/session"
import type { Agenda } from "@/features/meetings/logic"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { MeetingItem, MeetingRecord } from "@/lib/types"
import { foldText } from "@/lib/text"

const RECORD_COLUMNS =
  "id, event_id, occurs_on, status, summary, transcript_length, closed_at, closed_by, created_by, created_at, updated_at"
const ITEM_COLUMNS =
  "id, meeting_id, kind, content, owner_id, due_date, done, task_id, created_by, created_at"

function toRecord(row: Omit<MeetingRecord, "transcript_length"> & { transcript_length: number | null }) {
  return { ...row, transcript_length: row.transcript_length ?? 0 }
}

/** Todos os registros de reunião (sem transcrição) e todos os itens. */
export async function getMeetingRecords(): Promise<{
  records: MeetingRecord[]
  items: MeetingItem[]
}> {
  await requireUser()
  const supabase = await createClient()

  const [records, items] = await Promise.all([
    supabase.from("meetings").select(RECORD_COLUMNS).order("occurs_on", { ascending: false }),
    supabase.from("meeting_items").select(ITEM_COLUMNS).order("created_at"),
  ])
  if (records.error) throw loadError(records.error, "as reuniões")
  if (items.error) throw loadError(items.error, "os combinados")

  return { records: records.data.map(toRecord), items: items.data }
}

export interface MeetingDetail {
  record: MeetingRecord
  transcript: string | null
  /** Pauta congelada ao encerrar; `null` enquanto a reunião está aberta. */
  agenda: Agenda | null
}

/** Um registro com a transcrição e a pauta guardada. `null` se não existir. */
export async function getMeetingDetail(id: string): Promise<MeetingDetail | null> {
  await requireUser()
  const supabase = await createClient()

  const { data, error } = await supabase
    .from("meetings")
    .select(`${RECORD_COLUMNS}, transcript, agenda`)
    .eq("id", id)
    .maybeSingle()
  if (error) throw loadError(error, "a reunião")
  if (!data) return null

  const { transcript, agenda, ...record } = data
  return {
    record: toRecord(record),
    transcript,
    agenda: isAgenda(agenda) ? agenda : null,
  }
}

function isAgenda(value: unknown): value is Agenda {
  return typeof value === "object" && value !== null && (value as { version?: unknown }).version === 1
}

/**
 * Ids das reuniões cujo resumo ou transcrição batem com a busca (busca
 * textual do Postgres, sem acento). Título e combinados são filtrados no app.
 */
export async function searchMeetingIds(query: string): Promise<Set<string>> {
  await requireUser()
  const terms = foldText(query).trim()
  if (!terms) return new Set()

  const supabase = await createClient()
  const { data, error } = await supabase
    .from("meetings")
    .select("id")
    .textSearch("search", terms, { config: "portuguese", type: "websearch" })
  if (error) throw loadError(error, "a busca")
  return new Set(data.map((row) => row.id))
}
