import type { Metadata } from "next"

import { requireUser } from "@/features/auth/session"
import { loadReport } from "@/features/reports/load"
import { ReportActions } from "@/features/reports/report-actions"
import { ReportView } from "@/features/reports/report-view"

export const metadata: Metadata = { title: "Relatório" }

/** Relatório para apresentar (fora do menu, pronto para imprimir ou salvar em PDF). */
export default async function ReportPage(props: PageProps<"/relatorio">) {
  const user = await requireUser()
  const searchParams = await props.searchParams
  const { input, clientName } = await loadReport(searchParams, user)
  const query = new URLSearchParams(
    Object.entries(searchParams).flatMap(([key, value]) => (typeof value === "string" ? [[key, value]] : []))
  ).toString()

  return (
    <div className="min-h-svh bg-background">
      <ReportView
        input={input}
        clientName={clientName}
        actions={<ReportActions excelHref={`/api/relatorios/excel?${query}`} backHref={`/relatorios?${query}`} />}
      />
    </div>
  )
}
