import type { Metadata } from "next"

import { getDecisions } from "@/features/decisions/queries"
import { DecisionsView } from "@/features/decisions/decisions-view"
import { getMeetingRecords } from "@/features/meetings/queries"

export const metadata: Metadata = { title: "Decisões" }

export default async function DecisionsPage(props: PageProps<"/decisoes">) {
  const searchParams = await props.searchParams
  const query = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 120) : ""
  const [decisions, { records }] = await Promise.all([getDecisions(), getMeetingRecords()])

  return (
    <DecisionsView
      decisions={decisions}
      meetings={records.map((record) => ({ id: record.id, occurs_on: record.occurs_on }))}
      initialQuery={query}
    />
  )
}
