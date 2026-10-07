import type { ReactNode } from "react"

import { FinanceShell } from "@/features/finance/finance-shell"

export default function FinanceLayout({ children }: { children: ReactNode }) {
  return <FinanceShell>{children}</FinanceShell>
}
