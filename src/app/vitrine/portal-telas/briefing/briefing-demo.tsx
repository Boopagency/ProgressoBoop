"use client"

import { BriefingFlow } from "@/features/briefing/briefing-flow"
import type { FlowData } from "@/features/briefing/flow-logic"
import type { DateKey } from "@/lib/types"

import { brandFileUrl } from "../../briefing-preencher/marcas"

/** O fluxo de mentira da vitrine, com os logos de exemplo no lugar do bucket. */
export function BriefingDemo({ data, today, startAt }: { data: FlowData; today: DateKey; startAt: number }) {
  return <BriefingFlow data={data} homeHref="/vitrine/portal" today={today} demo startAt={startAt} fileUrl={brandFileUrl} />
}
