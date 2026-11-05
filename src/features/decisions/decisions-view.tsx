"use client"

import { Gavel, Plus, Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { MonthTitle } from "@/components/month-title"
import { PageBody, PageContainer, PageHeader, PageToolbar } from "@/components/layout/page"
import { SegmentedControl } from "@/components/segmented-control"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { DecisionDialog, type DecisionDialogState } from "@/features/decisions/decision-dialog"
import {
  DEFAULT_DECISION_FILTERS,
  filterDecisions,
  groupByMonth,
  type DecisionFilters,
} from "@/features/decisions/logic"
import { Highlight } from "@/features/docs/doc-meta"
import { compareProjects } from "@/features/projects/logic"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { useUrlTrigger } from "@/hooks/use-url-trigger"
import { useViewFade } from "@/hooks/use-view-fade"
import { formatMonthYear, formatShortDate, todayKey } from "@/lib/dates"
import { TASK_AREA_LABEL, TASK_AREAS, isTaskArea } from "@/lib/labels"
import type { DateKey, Decision, MeetingRecord } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_OPTIONS = [
  { value: "active", label: "Em vigor" },
  { value: "revoked", label: "Revogadas" },
  { value: "all", label: "Todas" },
] as const

export function DecisionsView({
  decisions,
  meetings,
  initialQuery,
}: {
  decisions: Decision[]
  /** ?q= (vindo da busca geral): mostra também as revogadas. */
  initialQuery: string
  /** Registros de reunião (para o link "decidida na reunião de …"). */
  meetings: Pick<MeetingRecord, "id" | "occurs_on">[]
}) {
  const { clients, projects, clientById, projectById, profileById } = useWorkspace()
  const [today] = useState<DateKey>(() => todayKey())
  const [filters, setFilters] = useState<DecisionFilters>(
    initialQuery ? { ...DEFAULT_DECISION_FILTERS, status: "all", query: initialQuery } : DEFAULT_DECISION_FILTERS
  )
  // A busca digitada não anima; só as trocas de status, área e origem.
  const bodyRef = useViewFade(`${filters.status}:${filters.area}:${filters.origin}`)
  const [dialog, setDialog] = useState<DecisionDialogState>({ open: false, key: 0 })
  useUrlTrigger(() => setDialog((current) => ({ open: true, key: current.key + 1 })))
  const meetingDate = new Map(meetings.map((meeting) => [meeting.id, meeting.occurs_on]))

  const visible = filterDecisions(decisions, filters)
  const groups = groupByMonth(visible)
  const active = decisions.filter((decision) => decision.status === "active").length
  const usedClients = clients.filter((client) => decisions.some((decision) => decision.client_id === client.id))
  const usedProjects = projects
    .filter((project) => decisions.some((decision) => decision.project_id === project.id))
    .sort(compareProjects)

  return (
    <PageContainer>
      <PageHeader
        title="Decisões"
        description={`${active} em vigor · o que a Boop definiu, por quê e onde`}
        actions={
          <Button onClick={() => setDialog((current) => ({ open: true, key: current.key + 1 }))} className="gap-1.5">
            <Plus />
            Nova decisão
          </Button>
        }
      />

      <PageToolbar className="flex-col items-stretch gap-3 md:flex-row md:items-center">
        <div className="relative md:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="Buscar nas decisões"
            aria-label="Buscar nas decisões"
            className="h-8 pl-8 text-[13px]"
          />
        </div>
        <SegmentedControl
          aria-label="Situação"
          value={filters.status}
          onValueChange={(status) => setFilters((current) => ({ ...current, status }))}
          options={STATUS_OPTIONS}
        />
        <div className="flex flex-wrap gap-2 md:ml-auto">
          <Select
            value={filters.area}
            onValueChange={(value) => setFilters((current) => ({ ...current, area: isTaskArea(value) ? value : "all" }))}
          >
            <SelectTrigger size="sm" aria-label="Área" className="h-8 text-[13px] shadow-none">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="end">
              <SelectItem value="all">Todas as áreas</SelectItem>
              {TASK_AREAS.map((area) => (
                <SelectItem key={area} value={area}>
                  {TASK_AREA_LABEL[area]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {usedClients.length + usedProjects.length > 0 ? (
            <Select value={filters.origin} onValueChange={(origin) => setFilters((current) => ({ ...current, origin }))}>
              <SelectTrigger size="sm" aria-label="Cliente ou projeto" className="h-8 max-w-[220px] text-[13px] shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="end" className="max-h-80">
                <SelectItem value="all">Clientes e projetos</SelectItem>
                {usedClients.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel className="text-[11px] tracking-wide uppercase">Clientes</SelectLabel>
                    {usedClients.map((client) => (
                      <SelectItem key={client.id} value={`c:${client.id}`}>
                        {client.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
                {usedProjects.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel className="text-[11px] tracking-wide uppercase">Projetos</SelectLabel>
                    {usedProjects.map((project) => (
                      <SelectItem key={project.id} value={`p:${project.id}`}>
                        {project.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
              </SelectContent>
            </Select>
          ) : null}
        </div>
      </PageToolbar>

      <PageBody ref={bodyRef}>
        {decisions.length === 0 ? (
          <div className="flex flex-col items-center rounded-2xl border border-dashed border-foreground/15 bg-card px-6 py-16 text-center">
            <div className="flex size-12 items-center justify-center rounded-full border border-glass-edge bg-glow-soft text-brand-ink shadow-[0_0_24px_-6px_var(--glow)]">
              <Gavel className="size-5" />
            </div>
            <h2 className="mt-4 font-display text-[17px] font-medium tracking-tight text-foreground">
              Nenhuma decisão <em className="emphasis text-[1.14em] text-brand-ink">registrada</em>
            </h2>
            <p className="mt-1 max-w-sm text-sm text-muted-foreground">
              Preço mínimo, política de prazos, a escolha de um fornecedor: registre o que ficou definido e o porquê,
              para ninguém precisar lembrar de cabeça. Na reunião, use o cartão “Decisões”.
            </p>
            <Button size="sm" className="mt-5" onClick={() => setDialog((current) => ({ open: true, key: current.key + 1 }))}>
              Registrar a primeira
            </Button>
          </div>
        ) : groups.length === 0 ? (
          <p className="pt-4 text-center text-sm text-muted-foreground">Nenhuma decisão com esses filtros.</p>
        ) : (
          <>
            {groups.map((group) => (
              <section key={group.month} aria-label={formatMonthYear(`${group.month}-01`)}>
                <h2 className="flex items-baseline gap-2.5 font-display text-[19px] font-medium tracking-[-0.02em] text-foreground">
                  <MonthTitle period={`${group.month}-01`} />
                  <span className="font-sans text-[13px] font-normal tracking-normal text-muted-foreground tabular-nums">{group.decisions.length}</span>
                </h2>
                <ul className="mt-3 divide-y overflow-hidden rounded-2xl border bg-card">
                  {group.decisions.map((decision) => {
                    const client = decision.client_id ? clientById.get(decision.client_id) : undefined
                    const project = decision.project_id ? projectById.get(decision.project_id) : undefined
                    const author = profileById.get(decision.created_by)
                    const meetingDay = decision.meeting_id ? meetingDate.get(decision.meeting_id) : undefined
                    const revoked = decision.status === "revoked"
                    return (
                      <li key={decision.id} className="group relative grid grid-cols-[2.75rem_minmax(0,1fr)] gap-x-3 px-4 py-4 transition-colors hover:bg-muted/40 sm:grid-cols-[3.5rem_minmax(0,1fr)] sm:gap-x-4 sm:px-5">
                        {/* O dia grande, na serifada itálica: a linha do tempo do mês. */}
                        <span aria-hidden="true" className="row-span-3 flex flex-col items-center pt-0.5">
                          <span className={cn("display-number text-[30px] leading-none sm:text-[36px]", revoked ? "text-muted-foreground" : "text-foreground")}>
                            {decision.decided_on.slice(8, 10)}
                          </span>
                          <span className={cn("mt-1 size-1.5 rounded-full", revoked ? "bg-muted-foreground/50" : "bg-glow shadow-[0_0_8px_var(--glow)]")} />
                        </span>
                        <button
                          type="button"
                          onClick={() => setDialog((current) => ({ open: true, key: current.key + 1, decision }))}
                          className="w-full text-left outline-none after:absolute after:inset-0 focus-visible:underline"
                        >
                          <span
                            className={cn(
                              "block font-display text-[15px] leading-6 font-medium tracking-[-0.01em] text-foreground",
                              revoked && "text-muted-foreground line-through"
                            )}
                          >
                            <Highlight text={decision.title} query={filters.query} />
                          </span>
                        </button>
                        {decision.context ? (
                          <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 whitespace-pre-line text-muted-foreground">
                            <Highlight text={decision.context} query={filters.query} />
                          </p>
                        ) : null}
                        <p className="relative z-10 mt-2 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                          <span className="tabular-nums">{formatShortDate(decision.decided_on, today)}</span>
                          {revoked ? <span className="inline-flex h-5 items-center rounded-full border border-dashed border-foreground/25 px-2">revogada</span> : null}
                          {decision.area ? (
                            <span className="inline-flex h-5 items-center rounded-full border border-foreground/15 px-2 text-foreground/85">{TASK_AREA_LABEL[decision.area]}</span>
                          ) : null}
                          {client ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <Link href={`/clientes/${client.id}`} className="hover:text-foreground hover:underline">
                                {client.name}
                              </Link>
                            </>
                          ) : null}
                          {project ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <Link href={`/projetos/${project.id}`} className="hover:text-foreground hover:underline">
                                {project.name}
                              </Link>
                            </>
                          ) : null}
                          {decision.meeting_id ? (
                            <>
                              <span aria-hidden="true">·</span>
                              <Link href={`/reunioes/${decision.meeting_id}`} className="hover:text-foreground hover:underline">
                                reunião{meetingDay ? ` de ${formatShortDate(meetingDay, today)}` : ""}
                              </Link>
                            </>
                          ) : null}
                          {author ? <><span aria-hidden="true">·</span>{firstName(author.full_name)}</> : null}
                        </p>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
      </PageBody>

      <DecisionDialog state={dialog} onOpenChange={(open) => setDialog((current) => ({ ...current, open }))} />
    </PageContainer>
  )
}
