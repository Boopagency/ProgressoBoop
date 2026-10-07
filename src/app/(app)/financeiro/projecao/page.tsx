import type { Metadata } from "next"

import { ProjectionView } from "@/features/finance/projection-view"
import { getFinance } from "@/features/finance/queries"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Projeção · Financeiro" }

export default async function ProjectionPage() {
  const data = await getFinance()
  return <ProjectionView data={data} today={todayKey()} />
}
