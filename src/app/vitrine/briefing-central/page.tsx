"use client"

import { BriefingCentralView } from "@/features/briefing/briefing-central"
import { todayKey } from "@/lib/dates"

import { VitrineB } from "../admin-b/vitrine-b"
import { vbCentral } from "./fixtures"

/** A central de briefings (aba Briefings) com vários clientes de exemplo. */
export default function VitrineBriefingCentralPage() {
  const today = todayKey()
  return (
    <VitrineB active="/briefing">
      <BriefingCentralView central={vbCentral(today)} today={today} basePath="/vitrine/briefing-central" demo />
    </VitrineB>
  )
}
