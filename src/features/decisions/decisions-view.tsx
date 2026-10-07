"use client"

import { Gavel, Plus, Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { PageContainer, PageHeader } from "@/components/layout/page"
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
    <PageContainer className="max-w-[1080px]">
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

      <div className="mt-7 flex flex-col gap-3 md:flex-row md:items-center">
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
      </div>

      {decisions.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <Gavel className="size-5 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-sm font-semibold">Nenhuma decisão registrada</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            Preço mínimo, política de prazos, a escolha de um fornecedor: registre o que ficou definido e o porquê,
            para ninguém precisar lembrar de cabeça. Na reunião, use o cartão “Decisões”.
          </p>
          <Button size="sm" className="mt-5" onClick={() => setDialog((current) => ({ open: true, key: current.key + 1 }))}>
            Registrar a primeira
          </Button>
        </div>
      ) : groups.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">Nenhuma decisão com esses filtros.</p>
      ) : (
        <div className="mt-8 space-y-8">
          {groups.map((group) => (
            <section key={group.month} aria-label={formatMonthYear(`${group.month}-01`)}>
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {formatMonthYear(`${group.month}-01`)}
              </h2>
              <ul className="mt-2 divide-y rounded-xl border bg-card">
                {group.decisions.map((decision) => {
                  const client = decision.client_id ? clientById.get(decision.client_id) : undefined
                  const project = decision.project_id ? projectById.get(decision.project_id) : undefined
                  const author = profileById.get(decision.created_by)
                  const meetingDay = decision.meeting_id ? meetingDate.get(decision.meeting_id) : undefined
                  const revoked = decision.status === "revoked"
                  return (
                    <li key={decision.id} className="group relative px-4 py-3.5 transition-colors hover:bg-muted/40">
                      <button
                        type="button"
                        onClick={() => setDialog((current) => ({ open: true, key: current.key + 1, decision }))}
                        className="w-full text-left outline-none after:absolute after:inset-0 focus-visible:underline"
                      >
                        <span
                          className={cn(
                            "block text-[14px] leading-6 font-medium text-foreground",
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
                      <p className="relative z-10 mt-1.5 flex flex-wrap items-center gap-x-1.5 text-xs text-muted-foreground">
                        <span className="tabular-nums">{formatShortDate(decision.decided_on, today)}</span>
                        {revoked ? <span className="rounded-full border border-dashed px-1.5">revogada</span> : null}
                        {decision.area ? <><span aria-hidden="true">·</span>{TASK_AREA_LABEL[decision.area]}</> : null}
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
        </div>
      )}

      <DecisionDialog state={dialog} onOpenChange={(open) => setDialog((current) => ({ ...current, open }))} />
    </PageContainer>
  )
}
