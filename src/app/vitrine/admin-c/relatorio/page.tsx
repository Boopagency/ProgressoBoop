"use client"

import { addPeriods, periodOf } from "@/features/clients/logic"
import { periodsFrom } from "@/features/finance/management"
import { defaultDreStart } from "@/features/finance/ranges"
import { parseLedgerFilters } from "@/features/finance/ledger-filters"
import { goalsView } from "@/features/goals/view-model"
import { buildContext } from "@/features/metrics/dashboard"
import { periodFor } from "@/features/metrics/periods"
import { ReportActions } from "@/features/reports/report-actions"
import { ReportView } from "@/features/reports/report-view"
import { REPORT_SECTIONS } from "@/features/reports/sections"
import { WorkspaceProvider } from "@/features/workspace/workspace-provider"
import { todayKey } from "@/lib/dates"

import { VITRINE_USER, vitrineWorkspace } from "../../fixtures"
import { gestaoGoals, gestaoMetricsSource, gestaoWorkspace } from "../fixtures"

/** A página do relatório (apresentar e imprimir), com dados de exemplo. */
export default function VitrineReportPage() {
  const today = todayKey()
  const source = gestaoMetricsSource(today)
  const ctx = buildContext(source, today)
  const period = periodFor("month", addPeriods(periodOf(today), -1))
  const goals = gestaoGoals(today)
  return (
    <WorkspaceProvider workspace={gestaoWorkspace(today)} currentUser={VITRINE_USER}>
      <div className="min-h-svh bg-background print:bg-transparent">
        <ReportView
          clientName={null}
          input={{
            ctx,
            period,
            compare: "previous",
            sections: [...REPORT_SECTIONS],
            dreMonths: periodsFrom(defaultDreStart(source.finance.settings.opening_on, period.months[0]!), 12),
            ledger: { ...parseLedgerFilters({}, periodOf(today)), from: period.months[0]!, to: period.months[0]! },
            profiles: vitrineWorkspace(today).profiles,
            goals: goalsView(ctx, goals.objectives, goals.keyResults),
            instagram: [],
            generatedBy: "Jabez",
            generatedAt: "05/11/2026 às 17:40",
          }}
          actions={<ReportActions excelHref="#" backHref="/vitrine/admin-c/relatorios" />}
        />
      </div>
    </WorkspaceProvider>
  )
}
