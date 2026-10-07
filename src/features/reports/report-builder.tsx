"use client"

import { Download, FileText } from "lucide-react"
import Link from "next/link"
import { useState, type ReactNode } from "react"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { PanelCard } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { SegmentedControl } from "@/components/segmented-control"
import { addPeriods, periodOf } from "@/features/clients/logic"
import { COMPARE_LABEL, periodFor, periodSearch, PERIOD_KIND_LABEL, type CompareMode, type PeriodKind } from "@/features/metrics/periods"
import { REPORT_SECTION_HINT, REPORT_SECTION_LABEL, REPORT_SECTIONS, type ReportSection } from "@/features/reports/sections"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import type { DateKey } from "@/lib/types"

const ALL = "all"

/** Períodos para escolher: do início do controle até um pouco à frente. */
function periodOptions(kind: PeriodKind, today: DateKey, openingOn: DateKey) {
  const current = periodOf(today)
  const options = new Map<string, { key: string; label: string; anchor: DateKey }>()
  const first = openingOn < addPeriods(current, -24) ? addPeriods(current, -24) : openingOn
  for (let month = addPeriods(current, 6); month >= first; month = addPeriods(month, -1)) {
    const period = periodFor(kind, month)
    options.set(period.range.start, { key: period.range.start, label: period.label, anchor: period.range.start })
  }
  return [...options.values()]
}

/** Tela Relatórios: escolher período, comparação, seções e recorte, e gerar o Excel ou o relatório. */
export function ReportBuilder({
  today,
  openingOn,
  initial,
}: {
  today: DateKey
  openingOn: DateKey
  initial: { kind: PeriodKind; anchor: DateKey; compare: CompareMode; sections: ReportSection[]; clientId: string | null }
}) {
  const { clients } = useWorkspace()
  const [kind, setKind] = useState<PeriodKind>(initial.kind)
  const [anchor, setAnchor] = useState<DateKey>(initial.anchor)
  const [compare, setCompare] = useState<CompareMode>(initial.compare)
  const [sections, setSections] = useState<ReportSection[]>(initial.sections)
  const [clientId, setClientId] = useState<string | null>(initial.clientId)
  const options = periodOptions(kind, today, openingOn)
  const period = periodFor(kind, anchor)
  const selected = options.find((option) => option.key === period.range.start)?.key ?? options[0]?.key ?? period.range.start
  const extra: Record<string, string> = { secoes: sections.join(",") }
  if (clientId) extra.cliente = clientId
  const search = periodSearch(periodFor(kind, selected), compare, extra)
  const ready = sections.length > 0

  return (
    <PageContainer className="max-w-[920px]">
      <PageHeader title="Relatórios" description="Os números do sistema em Excel ou num relatório para apresentar, no período e recorte que você escolher" />

      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_280px] md:items-start">
        <div className="space-y-6">
          <PanelCard id="relatorio-periodo" title="Período e recorte">
            <div className="space-y-4 px-4 py-4">
              <SegmentedControl
                aria-label="Tipo de período"
                value={kind}
                onValueChange={(next) => {
                  setKind(next)
                  setAnchor(periodFor(next, anchor).range.start)
                }}
                options={(["month", "quarter", "year"] as const).map((value) => ({ value, label: PERIOD_KIND_LABEL[value] }))}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <BuilderField label={PERIOD_KIND_LABEL[kind]}>
                  <Select value={selected} onValueChange={setAnchor}>
                    <SelectTrigger aria-label={PERIOD_KIND_LABEL[kind]} className="h-9 w-full shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start" className="max-h-72">
                      {options.map((option) => (
                        <SelectItem key={option.key} value={option.key}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </BuilderField>
                <BuilderField label="Comparar com">
                  <Select value={compare} onValueChange={(value) => setCompare(value as CompareMode)}>
                    <SelectTrigger aria-label="Comparar com" className="h-9 w-full shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      {(["previous", "year"] as const).map((mode) => (
                        <SelectItem key={mode} value={mode}>
                          {COMPARE_LABEL[mode].charAt(0).toUpperCase() + COMPARE_LABEL[mode].slice(1)}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </BuilderField>
              </div>
              <BuilderField label="Recorte">
                <Select value={clientId ?? ALL} onValueChange={(value) => setClientId(value === ALL ? null : value)}>
                  <SelectTrigger aria-label="Recorte" className="h-9 w-full shadow-none sm:w-80">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    <SelectItem value={ALL}>Toda a Boop</SelectItem>
                    {clients.map((client) => (
                      <SelectItem key={client.id} value={client.id}>
                        Só {client.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </BuilderField>
              {clientId ? (
                <p className="text-xs text-muted-foreground">
                  Recorte de um cliente: receita, contratos, custos diretos, negócios, tarefas e projetos dele. O resultado vira a margem do cliente (sem custos fixos).
                </p>
              ) : null}
            </div>
          </PanelCard>

          <PanelCard
            id="relatorio-secoes"
            title="O que entra"
            action={
              <button
                type="button"
                onClick={() => setSections(sections.length === REPORT_SECTIONS.length ? [] : [...REPORT_SECTIONS])}
                className="text-xs font-medium text-muted-foreground hover:text-foreground"
              >
                {sections.length === REPORT_SECTIONS.length ? "Limpar" : "Tudo"}
              </button>
            }
          >
            <ul className="divide-y">
              {REPORT_SECTIONS.map((section) => (
                <li key={section}>
                  <label className="flex cursor-pointer items-start gap-3 px-4 py-3">
                    <Checkbox
                      checked={sections.includes(section)}
                      onCheckedChange={(checked) =>
                        setSections((current) =>
                          checked === true ? REPORT_SECTIONS.filter((item) => item === section || current.includes(item)) : current.filter((item) => item !== section)
                        )
                      }
                      className="mt-0.5"
                    />
                    <span>
                      <span className="block text-[13px] font-medium text-foreground">{REPORT_SECTION_LABEL[section]}</span>
                      <span className="block text-xs text-muted-foreground">{REPORT_SECTION_HINT[section]}</span>
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          </PanelCard>
        </div>

        <aside className="space-y-3 md:sticky md:top-6">
          <div className="rounded-xl border bg-card p-4">
            <p className="text-xs text-muted-foreground">Período</p>
            <p className="font-display text-lg font-semibold text-foreground">{periodFor(kind, selected).label}</p>
            <p className="mt-1 text-xs text-muted-foreground">
              {sections.length} {sections.length === 1 ? "seção" : "seções"} · {clientId ? clients.find((client) => client.id === clientId)?.name : "toda a Boop"}
            </p>
            <div className="mt-4 grid gap-2">
              <Button asChild disabled={!ready} className="gap-1.5">
                <Link href={ready ? `/relatorio?${search}` : "#"} aria-disabled={!ready}>
                  <FileText className="size-4" />
                  Ver relatório
                </Link>
              </Button>
              <Button variant="outline" asChild className="gap-1.5">
                <a href={ready ? `/api/relatorios/excel?${search}` : "#"} aria-disabled={!ready}>
                  <Download className="size-4" />
                  Baixar Excel
                </a>
              </Button>
            </div>
          </div>
          <p className="px-1 text-xs text-muted-foreground">
            O relatório abre numa página limpa, pronta para imprimir ou salvar em PDF. O Excel traz uma aba por seção, com as
            fórmulas da planilha (margens, resultado e totais) e as premissas editáveis.
          </p>
        </aside>
      </div>
    </PageContainer>
  )
}

function BuilderField({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground" aria-hidden="true">
        {label}
      </p>
      {children}
    </div>
  )
}
