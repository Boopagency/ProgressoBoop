"use client"

import { AlertTriangle, Check, CircleAlert, ClipboardList, Loader2, NotebookPen, Search, Sparkles } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useMemo, useState, useTransition } from "react"
import { toast } from "sonner"

import { EmptyPanel } from "@/components/empty-panel"
import { PageBody, PageContainer, PageHeader, PageMeta, PageToolbar, SectionTitle } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { prepareBriefing } from "@/features/briefing/actions"
import { BriefingCentralNav } from "@/features/briefing/central-nav"
import {
  filterBriefingRows,
  matchesFilter,
  needsAction,
  type BriefingCentral,
  type BriefingRow,
  type CentralFilter,
} from "@/features/briefing/central-logic"
import { ContentImage } from "@/features/content/content-image"
import { clientColor } from "@/features/content/post-meta"
import { formatShortDate, toDateKey, toTimeLabel } from "@/lib/dates"
import { BRIEFING_STATUSES, BRIEFING_STATUS_LABEL } from "@/lib/labels"
import type { BriefingStatus, DateKey, Timestamp } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Pílula dos filtros, como nas outras telas. */
const FILTER_PILL =
  "inline-flex h-9 items-center gap-1.5 rounded-full border border-glass-edge bg-card px-3.5 text-[13px] whitespace-nowrap text-muted-foreground shadow-[inset_0_1px_0_var(--glass-highlight)] transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
const FILTER_PILL_ACTIVE = "border-glow/45 bg-glow-soft font-medium text-foreground"

/**
 * Central de briefings (`/briefing`, aba Briefings): todos os briefings dos
 * clientes numa lista densa, o que pede ação primeiro (enviado esperando a
 * imersão, atrasado, em preenchimento), com filtro por status e busca por
 * nome. Abrir uma linha leva ao briefing na própria central
 * (`/briefing/<cliente>`), com os mesmos componentes da ficha. Os clientes
 * ativos sem briefing ficam num grupo à parte, com "Preparar briefing".
 */
export function BriefingCentralView({
  central,
  today,
  basePath = "/briefing",
  demo = false,
}: {
  central: BriefingCentral
  today: DateKey
  /** A vitrine monta a central em outro endereço. */
  basePath?: string
  /** Vitrine: "Preparar briefing" não vai ao servidor. */
  demo?: boolean
}) {
  const [filter, setFilter] = useState<CentralFilter>("all")
  const [query, setQuery] = useState("")

  const { rows, withoutBriefing } = central
  const visible = useMemo(() => filterBriefingRows(rows, filter, query), [rows, filter, query])
  const actionCount = rows.filter(needsAction).length

  const chips: { value: CentralFilter; label: string; count: number }[] = [
    { value: "all", label: "Todos", count: rows.length },
    { value: "action", label: "Pedem ação", count: actionCount },
    ...BRIEFING_STATUSES.map((status) => ({
      value: status as CentralFilter,
      label: BRIEFING_STATUS_LABEL[status],
      count: rows.filter((row) => matchesFilter(row, status)).length,
    })).filter((chip) => chip.count > 0 || chip.value === filter),
  ]

  return (
    <PageContainer>
      <PageHeader
        title={
          <>
            Central de <em>briefings</em>
          </>
        }
        description={
          <PageMeta
            items={[
              rows.length === 1 ? "1 briefing" : `${rows.length} briefings`,
              actionCount > 0 ? (actionCount === 1 ? "1 pede ação" : `${actionCount} pedem ação`) : null,
              withoutBriefing.length > 0
                ? withoutBriefing.length === 1
                  ? "1 cliente sem briefing"
                  : `${withoutBriefing.length} clientes sem briefing`
                : null,
            ]}
          />
        }
      />
      <BriefingCentralNav basePath={basePath} />

      {rows.length > 0 ? (
        <PageToolbar className="mt-4">
          <div className="relative w-full sm:w-64">
            <Search className="pointer-events-none absolute top-1/2 left-3.5 size-3.5 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar cliente"
              aria-label="Buscar cliente"
              className="h-9 rounded-full border-glass-edge bg-card pl-9 text-[13px] shadow-[inset_0_1px_0_var(--glass-highlight)] dark:bg-card"
            />
          </div>
          <div
            role="group"
            aria-label="Filtrar por status"
            className="-mx-4 flex w-[calc(100%+2rem)] gap-1.5 overflow-x-auto px-4 [scrollbar-width:none] sm:mx-0 sm:w-auto sm:flex-wrap sm:px-0 [&::-webkit-scrollbar]:hidden"
          >
            {chips.map((chip) => (
              <button
                key={chip.value}
                type="button"
                aria-pressed={filter === chip.value}
                onClick={() => setFilter(chip.value)}
                className={cn(FILTER_PILL, filter === chip.value && FILTER_PILL_ACTIVE)}
              >
                {chip.label}
                <span className="text-[11px] font-semibold tabular-nums text-subtle-foreground">{chip.count}</span>
              </button>
            ))}
          </div>
        </PageToolbar>
      ) : null}

      <PageBody className="gap-10">
        {rows.length === 0 ? (
          <EmptyPanel icon={ClipboardList} title="Nenhum briefing ainda">
            Prepare ou libere o briefing de um cliente: ele aparece aqui, com o andamento e o prazo.
          </EmptyPanel>
        ) : (
          <section aria-labelledby="briefings-titulo" className="space-y-3">
            <SectionTitle id="briefings-titulo" count={visible.length}>
              Briefings
            </SectionTitle>
            {visible.length === 0 ? (
              <p className="rounded-3xl border border-dashed border-foreground/15 px-4 py-8 text-center text-[13px] text-muted-foreground">
                Nenhum briefing com esses filtros.
              </p>
            ) : (
              <>
                <BriefingTable rows={visible} today={today} basePath={basePath} />
                <BriefingCards rows={visible} today={today} basePath={basePath} />
              </>
            )}
          </section>
        )}

        {withoutBriefing.length > 0 ? (
          <section aria-labelledby="sem-briefing-titulo" className="space-y-3">
            <div className="space-y-1">
              <SectionTitle id="sem-briefing-titulo" count={withoutBriefing.length}>
                Clientes ativos sem briefing
              </SectionTitle>
              <p className="text-[13px] leading-5 text-muted-foreground">
                Prepare para preencher o que a Boop já sabe; o cliente só vê quando você liberar.
              </p>
            </div>
            <ul className="grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
              {withoutBriefing.map((client) => (
                <li key={client.id} className="flex items-center gap-3 rounded-2xl border bg-card px-4 py-3">
                  <ClientMark id={client.id} name={client.name} avatarPath={client.avatarPath} />
                  <Link
                    href={`${basePath}/${client.id}`}
                    className="min-w-0 flex-1 truncate text-[13.5px] font-medium text-foreground hover:underline"
                  >
                    {client.name}
                  </Link>
                  <PrepareButton clientId={client.id} name={client.name} defaults={client.defaults} basePath={basePath} demo={demo} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </PageBody>
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Tabela (computador) e cartões (celular)                             */
/* ------------------------------------------------------------------ */

function BriefingTable({ rows, today, basePath }: { rows: BriefingRow[]; today: DateKey; basePath: string }) {
  return (
    <div className="scrollbar-soft hidden overflow-x-auto rounded-3xl border bg-card-solid md:block">
      <table className="w-full min-w-[820px] text-sm tabular-nums">
        <thead>
          <tr className="text-left text-[10.5px] text-subtle-foreground [&>th]:eyebrow [&>th]:py-3 [&>th]:text-[10.5px]">
            <th scope="col" className="px-4 font-medium">Cliente</th>
            <th scope="col" className="px-3 font-medium">Status</th>
            <th scope="col" className="px-3 font-medium">Respondido</th>
            <th scope="col" className="px-3 font-medium">Prazo</th>
            <th scope="col" className="px-3 font-medium whitespace-nowrap">Último acesso</th>
            <th scope="col" className="px-3 font-medium">Obrigatórias</th>
            <th scope="col" className="px-4 font-medium">IA</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr
              key={row.briefingId}
              className={cn(
                "relative border-t transition-colors hover:bg-muted/40 [&>td]:py-3",
                needsAction(row) && "shadow-[inset_3px_0_0_var(--glow)]"
              )}
            >
              <td className="max-w-[240px] px-4">
                <div className="flex items-center gap-2.5">
                  <ClientMark id={row.clientId} name={row.name} avatarPath={row.avatarPath} />
                  <Link
                    href={`${basePath}/${row.clientId}`}
                    className="min-w-0 truncate font-medium text-foreground outline-none after:absolute after:inset-0 after:content-[''] focus-visible:after:rounded-sm focus-visible:after:ring-2 focus-visible:after:ring-ring/40"
                  >
                    {row.name}
                  </Link>
                  {!row.active ? <span className="shrink-0 text-xs text-subtle-foreground">inativo</span> : null}
                </div>
              </td>
              <td className="px-3 whitespace-nowrap">
                <StatusPill status={row.status} />
              </td>
              <td className="px-3">
                <Answered row={row} />
              </td>
              <td className="px-3 whitespace-nowrap">
                <Due row={row} today={today} />
              </td>
              <td className="px-3 whitespace-nowrap text-muted-foreground">
                <LastSeen at={row.lastSeenAt} status={row.status} today={today} />
              </td>
              <td className="px-3 whitespace-nowrap">
                <Missing row={row} />
              </td>
              <td className="px-4 whitespace-nowrap">
                <AiSignal ai={row.ai} empty="—" />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function BriefingCards({ rows, today, basePath }: { rows: BriefingRow[]; today: DateKey; basePath: string }) {
  return (
    <ul className="space-y-2 md:hidden">
      {rows.map((row) => (
        <li key={row.briefingId}>
          <Link
            href={`${basePath}/${row.clientId}`}
            className={cn(
              "block rounded-2xl border bg-card px-4 py-3.5 outline-none transition-colors hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring/40",
              needsAction(row) && "border-glow/45"
            )}
          >
            <div className="flex items-center gap-2.5">
              <ClientMark id={row.clientId} name={row.name} avatarPath={row.avatarPath} />
              <span className="min-w-0 flex-1 truncate text-[14px] font-medium text-foreground">{row.name}</span>
              <StatusPill status={row.status} />
            </div>
            <Answered row={row} className="mt-3" wide />
            <dl className="mt-3 grid grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
              <div className="flex min-w-0 gap-1.5">
                <dt className="text-subtle-foreground">Prazo</dt>
                <dd className="truncate">
                  <Due row={row} today={today} />
                </dd>
              </div>
              <div className="flex min-w-0 gap-1.5">
                <dt className="text-subtle-foreground">Acesso</dt>
                <dd className="truncate text-muted-foreground">
                  <LastSeen at={row.lastSeenAt} status={row.status} today={today} />
                </dd>
              </div>
              <div className="flex min-w-0 gap-1.5">
                <dt className="sr-only">Obrigatórias</dt>
                <dd className="truncate">
                  <Missing row={row} />
                </dd>
              </div>
              {row.ai ? (
                <div className="flex min-w-0 gap-1.5">
                  <dt className="sr-only">IA</dt>
                  <dd className="truncate">
                    <AiSignal ai={row.ai} />
                  </dd>
                </div>
              ) : null}
            </dl>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/* ------------------------------------------------------------------ */
/* Peças de uma linha                                                  */
/* ------------------------------------------------------------------ */

/** Foto do cliente (bucket `content`) ou a inicial na cor do cliente. */
function ClientMark({ id, name, avatarPath }: { id: string; name: string; avatarPath: string | null }) {
  const initial = (
    <span
      aria-hidden="true"
      className={cn("absolute inset-0 flex items-center justify-center text-[12px] font-semibold select-none", clientColor(id))}
    >
      {name.trim().charAt(0).toLocaleUpperCase("pt-BR")}
    </span>
  )
  return (
    <span className="relative block size-8 shrink-0 overflow-hidden rounded-full border">
      {avatarPath ? <ContentImage key={avatarPath} path={avatarPath} alt="" fallback={initial} /> : initial}
    </span>
  )
}

const STATUS_STYLE: Record<BriefingStatus, string> = {
  preparing: "border-dashed border-border text-muted-foreground",
  not_started: "border-border text-muted-foreground",
  in_progress: "border-glow/35 text-brand-ink",
  submitted: "border-transparent bg-primary text-primary-foreground shadow-glow",
  immersion_done: "border-border text-foreground",
  document_sent: "border-border text-foreground",
  validated: "border-success/30 text-success-ink",
}

function StatusPill({ status }: { status: BriefingStatus }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[11.5px] font-medium whitespace-nowrap",
        STATUS_STYLE[status]
      )}
    >
      {status === "validated" ? <Check className="size-3" aria-hidden="true" /> : null}
      {BRIEFING_STATUS_LABEL[status]}
    </span>
  )
}

function Answered({ row, className, wide = false }: { row: BriefingRow; className?: string; wide?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <span
        role="meter"
        aria-label="Respondido"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={row.percent}
        className={cn("relative h-1.5 overflow-hidden rounded-full bg-muted", wide ? "flex-1" : "w-14")}
      >
        <span className="absolute inset-y-0 left-0 rounded-full bg-brand" style={{ width: `${row.percent}%` }} />
      </span>
      <span className="text-[13px] font-medium text-foreground">{row.percent}%</span>
      <span className="text-xs text-subtle-foreground">
        {row.answered}/{row.total}
      </span>
    </div>
  )
}

function Due({ row, today }: { row: BriefingRow; today: DateKey }) {
  if (row.status === "preparing") return <span className="text-muted-foreground">ao liberar</span>
  if (row.due === "late") {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-overdue" title={`Prazo: ${formatShortDate(row.dueOn, today)}`}>
        <AlertTriangle className="size-3.5" aria-hidden="true" />
        {row.lateDays === 1 ? "1 dia atrasado" : `${row.lateDays} dias atrasado`}
      </span>
    )
  }
  if (row.due === "today") return <span className="font-medium text-warning-ink">vence hoje</span>
  if (row.due === "ok") return <span className="text-foreground">{formatShortDate(row.dueOn, today)}</span>
  return (
    <span className="text-muted-foreground">
      {row.submittedAt ? `enviado ${dayLabel(toDateKey(row.submittedAt), today)}` : "—"}
    </span>
  )
}

/** "hoje, 14:32" / "06/11, 09:10" / nunca abriu. */
function LastSeen({ at, status, today }: { at: Timestamp | null; status: BriefingStatus; today: DateKey }) {
  if (!at) return <>{status === "preparing" ? "—" : "não abriu"}</>
  return <>{`${dayLabel(toDateKey(at), today)}, ${toTimeLabel(at)}`}</>
}

function dayLabel(day: DateKey, today: DateKey): string {
  return day === today ? "hoje" : formatShortDate(day, today)
}

function Missing({ row }: { row: BriefingRow }) {
  if (row.missingRequired === 0) {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Check className="size-3.5 text-brand-ink" aria-hidden="true" />
        Completas
      </span>
    )
  }
  // Enviado com obrigatória em aberto trava a imersão: pede olhar.
  const blocking = row.status === "submitted"
  return (
    <span className={cn("inline-flex items-center gap-1", blocking ? "font-medium text-overdue" : "text-foreground")}>
      <CircleAlert className={cn("size-3.5", blocking ? "" : "text-subtle-foreground")} aria-hidden="true" />
      {row.missingRequired === 1 ? "Falta 1" : `Faltam ${row.missingRequired}`}
    </span>
  )
}

function AiSignal({ ai, empty = null }: { ai: BriefingRow["ai"]; empty?: string | null }) {
  if (ai === "failed") {
    return (
      <span className="inline-flex items-center gap-1 font-medium text-overdue">
        <AlertTriangle className="size-3.5" aria-hidden="true" />
        IA falhou
      </span>
    )
  }
  if (ai === "pending") {
    return (
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        <Sparkles className="size-3.5 text-brand-ink" aria-hidden="true" />
        IA pendente
      </span>
    )
  }
  return empty ? <span className="text-subtle-foreground">{empty}</span> : null
}

/* ------------------------------------------------------------------ */
/* Preparar (a mesma ação da ficha)                                    */
/* ------------------------------------------------------------------ */

function PrepareButton({
  clientId,
  name,
  defaults,
  basePath,
  demo,
}: {
  clientId: string
  name: string
  defaults: BriefingCentral["withoutBriefing"][number]["defaults"]
  basePath: string
  demo: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()

  function prepare() {
    if (demo) return
    startTransition(async () => {
      const result = await prepareBriefing(clientId, { identification: defaults })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(`Briefing de ${name} em preparação. Preencha o que a Boop já sabe e libere quando quiser.`)
      router.push(`${basePath}/${clientId}`)
    })
  }

  return (
    <Button variant="outline" size="sm" onClick={prepare} disabled={isPending} className="shrink-0 gap-1.5 shadow-none">
      {isPending ? <Loader2 className="animate-spin" /> : <NotebookPen />}
      {isPending ? "Preparando…" : "Preparar briefing"}
    </Button>
  )
}
