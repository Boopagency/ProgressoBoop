"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import { useState } from "react"

import { PanelCard, PanelCount } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { CommunicationDialog, type CommunicationDialogState } from "@/features/communications/communication-dialog"
import { ChannelIcon, CommunicationKindBadge } from "@/features/communications/communication-meta"
import { compareCommunications } from "@/features/communications/logic"
import { firstName } from "@/features/tasks/logic"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate } from "@/lib/dates"
import type { Communication } from "@/lib/types"

/**
 * Últimas comunicações de um cliente (ou de um projeto de cliente), com
 * "Registrar" já ligado a ele.
 */
export function CommunicationsCard({
  communications,
  defaults,
  showProject = false,
  showClient = false,
  limit = 6,
  className,
}: {
  communications: Communication[]
  defaults: CommunicationDialogState["defaults"]
  showProject?: boolean
  showClient?: boolean
  limit?: number
  className?: string
}) {
  const { today, tasks } = useTasks()
  const { profileById, projectById, clientById } = useWorkspace()
  const [dialog, setDialog] = useState<CommunicationDialogState>({ open: false, key: 0 })
  const sorted = [...communications].sort(compareCommunications)
  const withTasks = new Set(tasks.map((task) => task.communication_id).filter(Boolean))

  return (
    <PanelCard
      id="comunicacoes"
      title={
        <>
          Comunicações
          <PanelCount value={communications.length} />
        </>
      }
      action={
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setDialog((current) => ({ open: true, key: current.key + 1, defaults }))}
          className="h-7 gap-1 px-2 text-xs"
        >
          <Plus className="size-3.5" />
          Registrar
        </Button>
      }
      className={className}
    >
      {sorted.length === 0 ? (
        <p className="px-4 py-4 text-[13px] text-muted-foreground">
          Pedidos, aprovações e retornos do cliente ficam aqui, com data e canal.
        </p>
      ) : (
        <ul className="divide-y">
          {sorted.slice(0, limit).map((item) => {
            const author = profileById.get(item.created_by)
            const project = item.project_id ? projectById.get(item.project_id) : undefined
            const client = clientById.get(item.client_id)
            return (
              <li key={item.id}>
                <button
                  type="button"
                  onClick={() => setDialog((current) => ({ open: true, key: current.key + 1, communication: item }))}
                  className="flex w-full items-start gap-3 px-4 py-2.5 text-left transition-colors hover:bg-muted/50"
                >
                  <ChannelIcon channel={item.channel} className="mt-0.5 text-muted-foreground" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] leading-5 text-foreground">{item.summary}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-1 text-xs text-muted-foreground">
                      <CommunicationKindBadge kind={item.kind} />
                      <span className="tabular-nums">{formatShortDate(item.occurred_on, today)}</span>
                      {showClient && client ? <span>· {client.name}</span> : null}
                      {showProject && project ? <span className="truncate">· {project.name}</span> : null}
                      {author ? <span>· {firstName(author.full_name)}</span> : null}
                      {withTasks.has(item.id) ? <span>· virou tarefa</span> : null}
                    </span>
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
      {sorted.length > limit ? (
        <Link
          href={defaults?.client_id ? `/comunicacoes?cliente=${defaults.client_id}` : "/comunicacoes"}
          className="block border-t px-4 py-2.5 text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Ver todas ({sorted.length})
        </Link>
      ) : null}
      <CommunicationDialog state={dialog} onOpenChange={(open) => setDialog((current) => ({ ...current, open }))} />
    </PanelCard>
  )
}
