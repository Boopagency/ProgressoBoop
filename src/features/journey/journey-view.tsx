"use client"

import { ArrowUpRight, Route } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { EmptyPanel } from "@/components/empty-panel"
import { PageBody, PageContainer, PageHeader, PageToolbar, SectionTitle } from "@/components/layout/page"
import { SegmentedControl } from "@/components/segmented-control"
import { StatGrid } from "@/components/stat-grid"
import { Button } from "@/components/ui/button"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { ClientMark } from "@/features/content/post-meta"
import { JOURNEY_PHASE_LABEL, JOURNEY_PHASES, type JourneyLine, type JourneyPhase } from "@/features/journey/catalog"
import { ActorPill, LineBadge, StepClock } from "@/features/journey/journey-ui"
import {
  evaluateJourney,
  missingLines,
  sortByAttention,
  type JourneyAttention,
  type JourneyRecord,
  type JourneyStatus,
} from "@/features/journey/logic"
import { StartJourneyDialog, type StartJourneyTarget } from "@/features/journey/start-journey-dialog"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

export type JourneyViewMode = "board" | "list"

const ALL = "all"

/** O que a etiqueta do cartão diz quando a jornada pede ação. */
const ATTENTION_LABEL: Partial<Record<JourneyAttention, string>> = {
  ready: "Pronta para avançar",
  renewal: "Renovação chegando",
}

/**
 * Tela Jornada: todos os clientes por fase e etapa, em quadro ou lista, com a
 * linha de serviço, há quantos dias está na etapa e o atraso. O que pede
 * ação vem primeiro. Filtro por linha e por responsável.
 */
export function JourneyView({
  journeys,
  today,
  initialMode = "board",
}: {
  journeys: JourneyRecord[]
  today: DateKey
  initialMode?: JourneyViewMode
}) {
  const { clients, profiles } = useWorkspace()
  const [mode, setMode] = useState<JourneyViewMode>(initialMode)
  const [line, setLine] = useState<JourneyLine | typeof ALL>(ALL)
  const [owner, setOwner] = useState<string>(ALL)
  const [start, setStart] = useState<StartJourneyTarget | null>(null)

  const active = journeys.filter((journey) => !journey.ended_on && journey.client_active)
  const statuses = sortByAttention(
    active
      .filter((journey) => line === ALL || journey.line === line)
      .filter((journey) => owner === ALL || journey.owner_id === owner)
      .map((journey) => evaluateJourney(journey, today))
  )
  const needAction = statuses.filter((status) => status.rank < 200000)
  const late = statuses.filter((status) => status.late)
  const withClient = statuses.filter((status) => status.waiting_on === "client")

  // Clientes ativos que ainda não estão na jornada (em nenhuma linha).
  const outside = clients.filter((client) => client.active && !active.some((journey) => journey.client_id === client.id))
  const ownerOptions = profiles.filter((profile) => active.some((journey) => journey.owner_id === profile.id))

  return (
    <PageContainer>
      <PageHeader
        title={
          <>
            Jornada dos <em>clientes</em>
          </>
        }
        description="Em que fase e etapa cada cliente está, há quanto tempo e quem precisa agir."
        actions={
          <Button className="gap-1.5" onClick={() => setStart({ clientId: null, lines: [] })}>
            <Route />
            Iniciar jornada
          </Button>
        }
      />

      <PageToolbar>
        <SegmentedControl
          aria-label="Linha de serviço"
          value={line}
          onValueChange={setLine}
          options={[
            { value: ALL, label: "Todas" },
            { value: "social", label: "Social" },
            { value: "traffic", label: "Tráfego" },
          ]}
        />
        <Select value={owner} onValueChange={setOwner}>
          <SelectTrigger aria-label="Responsável" className="h-10 w-auto min-w-40 rounded-full shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={ALL}>Todos os responsáveis</SelectItem>
            {ownerOptions.map((profile) => (
              <SelectItem key={profile.id} value={profile.id}>
                {firstName(profile.full_name)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <SegmentedControl
          aria-label="Modo de ver"
          value={mode}
          onValueChange={setMode}
          options={[
            { value: "board", label: "Quadro" },
            { value: "list", label: "Lista" },
          ]}
          className="ml-auto"
        />
      </PageToolbar>

      <PageBody>
        <StatGrid
          items={[
            { label: "Pedem ação", value: needAction.length, hint: "atraso, fase pronta ou renovação", accent: needAction.length > 0 },
            { label: "Atrasadas", value: late.length, hint: "passaram do prazo-alvo", alert: late.length > 0 },
            { label: "Com o cliente", value: withClient.length, hint: "esperando o cliente agir" },
            { label: "Na jornada", value: statuses.length, unit: statuses.length === 1 ? "linha" : "linhas", hint: `${outside.length} fora da jornada` },
          ]}
        />

        {active.length === 0 ? (
          <EmptyPanel
            icon={Route}
            title="Nenhum cliente na jornada ainda"
            action={
              <Button className="gap-1.5" onClick={() => setStart({ clientId: null, lines: [] })}>
                <Route />
                Iniciar jornada
              </Button>
            }
          >
            Clientes novos entram sozinhos ao ganhar o negócio no Comercial. Quem já roda entra por “Iniciar jornada”, na fase em que está.
          </EmptyPanel>
        ) : statuses.length === 0 ? (
          <EmptyPanel icon={Route} title="Ninguém com esse filtro" compact />
        ) : mode === "board" ? (
          <Board statuses={statuses} />
        ) : (
          <List statuses={statuses} />
        )}

        {outside.length > 0 ? (
          <section aria-labelledby="fora-da-jornada" className="space-y-3">
            <SectionTitle id="fora-da-jornada" count={outside.length}>
              Fora da jornada
            </SectionTitle>
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
              {outside.map((client) => (
                <li key={client.id} className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
                  <ClientMark clientId={client.id} />
                  <Link href={`/clientes/${client.id}`} className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground hover:underline">
                    {client.name}
                  </Link>
                  <Button
                    variant="outline"
                    size="sm"
                    className="h-8 shadow-none"
                    onClick={() => setStart({ clientId: client.id, lines: missingLines([]) })}
                  >
                    Iniciar
                  </Button>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </PageBody>

      <StartJourneyDialog target={start} today={today} onOpenChange={(open) => !open && setStart(null)} />
    </PageContainer>
  )
}

/** Quadro: uma coluna por fase (no celular, as colunas deslizam de lado). */
function Board({ statuses }: { statuses: JourneyStatus[] }) {
  const phases = JOURNEY_PHASES.filter(
    (phase) => phase !== "offboarding" || statuses.some((status) => status.record.phase === "offboarding")
  )
  return (
    <div
      role="list"
      aria-label="Jornada por fase"
      className="scrollbar-soft -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-0 lg:grid lg:snap-none lg:overflow-visible"
      style={{ gridTemplateColumns: `repeat(${phases.length}, minmax(0, 1fr))` }}
    >
      {phases.map((phase) => {
        const items = statuses.filter((status) => status.record.phase === phase)
        return <Column key={phase} phase={phase} items={items} />
      })}
    </div>
  )
}

function Column({ phase, items }: { phase: JourneyPhase; items: JourneyStatus[] }) {
  const late = items.filter((item) => item.late).length
  return (
    <section
      role="listitem"
      aria-label={`${JOURNEY_PHASE_LABEL[phase]}: ${items.length}`}
      className="flex w-[82vw] max-w-[340px] shrink-0 snap-start flex-col gap-2 rounded-2xl bg-board p-2 sm:w-[300px] lg:w-auto lg:max-w-none"
    >
      <header className="flex items-center gap-2 px-2 pt-1.5 pb-1">
        <h2 className="text-[13px] font-semibold text-foreground">{JOURNEY_PHASE_LABEL[phase]}</h2>
        <span className="text-[13px] text-muted-foreground tabular-nums">{items.length}</span>
        {late > 0 ? <span className="ml-auto text-xs font-medium text-overdue tabular-nums">{late} em atraso</span> : null}
      </header>
      {items.length === 0 ? (
        <p className="px-2 pb-3 text-xs text-subtle-foreground">Ninguém nesta fase.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {items.map((status) => (
            <li key={status.record.id}>
              <JourneyCard status={status} />
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}

function JourneyCard({ status }: { status: JourneyStatus }) {
  const { record } = status
  const flag = ATTENTION_LABEL[status.attention]
  return (
    <Link
      href={`/clientes/${record.client_id}`}
      className={cn(
        "group block rounded-xl border bg-board-card p-3 transition-colors hover:border-glow/40 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none",
        status.late && "border-overdue/40"
      )}
    >
      <div className="flex items-center gap-2">
        <ClientMark clientId={record.client_id} />
        <p className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">{record.client_name}</p>
        <LineBadge line={record.line} />
      </div>
      <p className="mt-2 text-[13px] leading-5 text-foreground">
        {status.current ? status.current.step.name : record.phase === "ongoing" ? "Mês em dia" : "Fase concluída"}
      </p>
      <div className="mt-2 flex flex-wrap items-center gap-1.5">
        {status.current ? <ActorPill actor={status.current.step.actor} /> : null}
        {flag ? (
          <span className="inline-flex h-5 items-center rounded-full bg-brand-soft px-2 text-[11px] font-medium text-brand-ink">{flag}</span>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-2">
        <StepClock status={status} />
        <span className="ml-auto text-[11px] text-subtle-foreground tabular-nums">
          {status.done}/{status.total}
        </span>
      </div>
    </Link>
  )
}

/** Lista: uma linha por cliente e linha de serviço, o que pede ação primeiro. */
function List({ statuses }: { statuses: JourneyStatus[] }) {
  return (
    <ul aria-label="Jornada dos clientes" className="divide-y overflow-hidden rounded-2xl border bg-card">
      {statuses.map((status) => {
        const { record } = status
        const flag = ATTENTION_LABEL[status.attention]
        return (
          <li key={record.id}>
            <Link
              href={`/clientes/${record.client_id}`}
              className="group flex flex-col gap-2 px-4 py-3 hover:bg-foreground/[0.03] sm:flex-row sm:items-center sm:gap-4"
            >
              <div className="flex min-w-0 items-center gap-2.5 sm:w-56">
                <ClientMark clientId={record.client_id} />
                <span className="min-w-0 truncate text-[14px] font-medium text-foreground">{record.client_name}</span>
                <LineBadge line={record.line} />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13.5px] text-foreground">
                  <span className="text-muted-foreground">{JOURNEY_PHASE_LABEL[record.phase]} · </span>
                  {status.current ? status.current.step.name : record.phase === "ongoing" ? "Mês em dia" : "Fase concluída"}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                {flag ? (
                  <span className="inline-flex h-5 items-center rounded-full bg-brand-soft px-2 text-[11px] font-medium text-brand-ink">{flag}</span>
                ) : null}
                {status.current ? <ActorPill actor={status.current.step.actor} /> : null}
                <StepClock status={status} />
                <ArrowUpRight className="hidden size-4 text-subtle-foreground group-hover:text-foreground sm:block" aria-hidden="true" />
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
