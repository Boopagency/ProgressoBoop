"use client"

import type { ReactNode } from "react"

import { FinanceShell } from "@/features/finance/finance-shell"

import { GestaoFrame } from "../gestao-frame"

export default function VitrineFinanceLayout({ children }: { children: ReactNode }) {
  return (
    <GestaoFrame active="/financeiro">
      <FinanceShell basePath="/vitrine/admin-c/financeiro">{children}</FinanceShell>
    </GestaoFrame>
  )
}
