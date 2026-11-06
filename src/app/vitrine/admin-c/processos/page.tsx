"use client"

import { DocsView } from "@/features/docs/docs-view"
import { todayKey } from "@/lib/dates"

import { gestaoDocs } from "../fixtures"
import { GestaoFrame } from "../gestao-frame"

export default function VitrineDocsPage() {
  const today = todayKey()
  return (
    <GestaoFrame active="/processos">
      <DocsView docs={gestaoDocs(today)} query="" hits={[]} today={today} />
    </GestaoFrame>
  )
}
