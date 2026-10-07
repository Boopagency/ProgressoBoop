"use client"

import { MessagesSquare, Plus, Search } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { CommunicationDialog, type CommunicationDialogState } from "@/features/communications/communication-dialog"
import { ChannelIcon, CommunicationKindBadge } from "@/features/communications/communication-meta"
import {
  DEFAULT_COMMUNICATION_FILTERS,
  filterCommunications,
  groupByPeriod,
  type CommunicationFilters,
} from "@/features/communications/logic"
import { Highlight } from "@/features/docs/doc-meta"
import { firstName } from "@/features/tasks/logic"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { useUrlTrigger } from "@/hooks/use-url-trigger"
import { formatShortDate, formatWeekdayShort } from "@/lib/dates"
import { COMMUNICATION_KIND_LABEL, COMMUNICATION_KINDS, isCommunicationKind } from "@/lib/labels"
import type { Communication } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Tudo o que foi falado com os clientes, do mais recente para o mais antigo. */
export function CommunicationsView({
  communications,
  initialClient,
  initialQuery,
}: {
  communications: Communication[]
  /** ?cliente= (link do cartão do cliente). */
  initialClient: string | null
  /** ?q= (vindo da busca geral). */
  initialQuery: string
}) {
  const { clients, clientById, projectById, profileById } = useWorkspace()
  const { today, tasks } = useTasks()
  const [filters, setFilters] = useState<CommunicationFilters>({
    ...DEFAULT_COMMUNICATION_FILTERS,
    client: initialClient && clients.some((client) => client.id === initialClient) ? initialClient : "all",
    query: initialQuery,
  })
  const [dialog, setDialog] = useState<CommunicationDialogState>({ open: false, key: 0 })
  useUrlTrigger(() =>
    setDialog((current) => ({
      open: true,
      key: current.key + 1,
      defaults: filters.client !== "all" ? { client_id: filters.client } : undefined,
    }))
  )

  const visible = filterCommunications(communications, filters)
  const groups = groupByPeriod(visible, today)
  const withTasks = new Set(tasks.map((task) => task.communication_id).filter(Boolean))
  const openRequests = communications.filter((item) => item.kind === "request" && !withTasks.has(item.id)).length

  function openNew() {
    setDialog((current) => ({
      open: true,
      key: current.key + 1,
      defaults: filters.client !== "all" ? { client_id: filters.client } : undefined,
    }))
  }

  return (
    <PageContainer className="max-w-[1080px]">
      <PageHeader
        title="Comunicações"
        description={
          openRequests > 0
            ? `${openRequests} ${openRequests === 1 ? "pedido de cliente ainda não virou tarefa" : "pedidos de clientes ainda não viraram tarefa"}`
            : "O que foi falado com cada cliente: pedidos, aprovações e retornos"
        }
        actions={
          <Button onClick={openNew} className="gap-1.5">
            <Plus />
            Registrar
          </Button>
        }
      />

      <div className="mt-7 flex flex-col gap-3 md:flex-row md:items-center">
        <div className="relative md:w-72">
          <Search className="pointer-events-none absolute top-1/2 left-2.5 size-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={filters.query}
            onChange={(event) => setFilters((current) => ({ ...current, query: event.target.value }))}
            placeholder="Buscar nas comunicações"
            aria-label="Buscar nas comunicações"
            className="h-8 pl-8 text-[13px]"
          />
        </div>
        <Select value={filters.client} onValueChange={(client) => setFilters((current) => ({ ...current, client }))}>
          <SelectTrigger size="sm" aria-label="Cliente" className="h-8 max-w-[240px] text-[13px] shadow-none">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value="all">Todos os clientes</SelectItem>
            {clients.map((client) => (
              <SelectItem key={client.id} value={client.id}>
                {client.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <div className="flex flex-wrap gap-1.5 md:ml-auto" role="radiogroup" aria-label="Tipo">
          {(["all", ...COMMUNICATION_KINDS] as const).map((kind) => (
            <button
              key={kind}
              type="button"
              role="radio"
              aria-checked={filters.kind === kind}
              onClick={() => setFilters((current) => ({ ...current, kind: isCommunicationKind(kind) ? kind : "all" }))}
              className={cn(
                "h-7 rounded-full border px-3 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                filters.kind === kind ? "border-foreground/25 bg-accent font-medium text-foreground" : "bg-background text-muted-foreground hover:text-foreground"
              )}
            >
              {kind === "all" ? "Todos" : COMMUNICATION_KIND_LABEL[kind]}
            </button>
          ))}
        </div>
      </div>

      {communications.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <div className="flex size-10 items-center justify-center rounded-full bg-muted">
            <MessagesSquare className="size-5 text-muted-foreground" />
          </div>
          <h2 className="mt-4 text-sm font-semibold">Nada registrado ainda</h2>
          <p className="mt-1 max-w-sm text-sm text-muted-foreground">
            O cliente pediu uma mudança, aprovou um layout, reclamou de um prazo? Registre aqui (ou na página do
            cliente) e transforme pedidos em tarefas.
          </p>
          <Button size="sm" className="mt-5" onClick={openNew}>
            Registrar a primeira
          </Button>
        </div>
      ) : groups.length === 0 ? (
        <p className="mt-10 text-center text-sm text-muted-foreground">Nenhuma comunicação com esses filtros.</p>
      ) : (
        <div className="mt-8 space-y-8">
          {groups.map((group) => (
            <section key={group.label} aria-label={group.label}>
              <h2 className="text-xs font-medium tracking-wide text-muted-foreground uppercase">{group.label}</h2>
              <ul className="mt-2 divide-y rounded-xl border bg-card">
                {group.items.map((item) => {
                  const client = clientById.get(item.client_id)
                  const project = item.project_id ? projectById.get(item.project_id) : undefined
                  const author = profileById.get(item.created_by)
                  return (
                    <li key={item.id} className="relative flex gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
                      <ChannelIcon channel={item.channel} className="mt-1 text-muted-foreground" />
                      <div className="min-w-0 flex-1">
                        <button
                          type="button"
                          onClick={() => setDialog((current) => ({ open: true, key: current.key + 1, communication: item }))}
                          className="text-left text-[14px] leading-6 font-medium text-foreground outline-none after:absolute after:inset-0 focus-visible:underline"
                        >
                          <Highlight text={item.summary} query={filters.query} />
                        </button>
                        {item.details ? (
                          <p className="line-clamp-2 text-[13px] leading-5 whitespace-pre-line text-muted-foreground">
                            <Highlight text={item.details} query={filters.query} />
                          </p>
                        ) : null}
                        <p className="relative z-10 mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                          <CommunicationKindBadge kind={item.kind} />
                          <span className="tabular-nums">
                            {formatWeekdayShort(item.occurred_on)}, {formatShortDate(item.occurred_on, today)}
                          </span>
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
                          {author ? <><span aria-hidden="true">·</span>{firstName(author.full_name)}</> : null}
                          {withTasks.has(item.id) ? <><span aria-hidden="true">·</span>virou tarefa</> : null}
                        </p>
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}

      <CommunicationDialog state={dialog} onOpenChange={(open) => setDialog((current) => ({ ...current, open }))} />
    </PageContainer>
  )
}
