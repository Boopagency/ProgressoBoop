"use client"

import { DocView } from "@/features/docs/doc-view"
import { todayKey } from "@/lib/dates"

import { gestaoDoc, gestaoDocVersions } from "../../fixtures"
import { GestaoFrame } from "../../gestao-frame"

export default function VitrineDocPage() {
  const today = todayKey()
  return (
    <GestaoFrame active="/processos">
      <DocView doc={gestaoDoc(today)} versions={gestaoDocVersions(today)} />
    </GestaoFrame>
  )
}
