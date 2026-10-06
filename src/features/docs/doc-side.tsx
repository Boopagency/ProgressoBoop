"use client"

import { History, ListTodo } from "lucide-react"

import { Progress } from "@/components/ui/progress"
import type { Heading } from "@/features/docs/logic"
import { firstName, isDone } from "@/features/tasks/logic"
import { TaskRow } from "@/features/tasks/task-row"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { addDaysToKey, formatShortDate, toDateKey, toTimeLabel } from "@/lib/dates"
import type { DateKey, DocVersion, Task, Timestamp } from "@/lib/types"
import { cn } from "@/lib/utils"

/** "Hoje, 14:32", "Ontem, 09:10" ou "06/10, 11:00". */
export function whenLabel(at: Timestamp, today: DateKey): string {
  const day = toDateKey(at)
  const time = toTimeLabel(at)
  if (day === today) return `Hoje, ${time}`
  if (day === addDaysToKey(today, -1)) return `Ontem, ${time}`
  return `${formatShortDate(day, today)}, ${time}`
}

/** Índice "Neste documento" (títulos), para pular para uma seção. */
export function DocOutline({ headings, onSelect }: { headings: Heading[]; onSelect: (id: string) => void }) {
  if (headings.length < 2) return null
  const minLevel = Math.min(...headings.map((heading) => heading.level))
  return (
    <nav aria-labelledby="indice-titulo" className="px-1">
      <h2 id="indice-titulo" className="px-2 text-[11.5px] font-medium tracking-wide text-subtle-foreground uppercase">
        Neste documento
      </h2>
      <ul className="mt-2 space-y-0.5 border-l">
        {headings.map((heading) => (
          <li key={heading.id}>
            <button
              type="button"
              onClick={() => onSelect(heading.id)}
              style={{ paddingLeft: `${0.75 + (heading.level - minLevel) * 0.75}rem` }}
              className="-ml-px block w-full truncate border-l border-transparent py-1 pr-2 text-left text-[13px] text-muted-foreground transition-colors outline-none hover:border-foreground/30 hover:text-foreground focus-visible:text-foreground focus-visible:underline"
            >
              {heading.text}
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}

/** Tarefas que nasceram do checklist deste documento. */
export function DocTasksCard({ tasks, onGenerate }: { tasks: Task[]; onGenerate: (() => void) | null }) {
  if (tasks.length === 0 && !onGenerate) return null
  const done = tasks.filter(isDone).length
  const sorted = [...tasks].sort((a, b) => Number(isDone(a)) - Number(isDone(b)))

  return (
    <section aria-labelledby="tarefas-geradas" className="rounded-xl border bg-card">
      <header className="flex items-center gap-2 px-4 pt-3.5 pb-2">
        <h2 id="tarefas-geradas" className="text-sm font-semibold text-foreground">
          Tarefas geradas
        </h2>
        {tasks.length > 0 ? (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {done} de {tasks.length}
          </span>
        ) : null}
      </header>
      {tasks.length > 0 ? (
        <>
          <Progress value={(done / tasks.length) * 100} className="mx-4 h-1 w-auto" aria-label="Tarefas concluídas" />
          <div role="list" className="max-h-[340px] overflow-y-auto px-1 py-1.5">
            {sorted.map((task) => (
              <TaskRow key={task.id} task={task} />
            ))}
          </div>
        </>
      ) : (
        <p className="px-4 pb-1 text-[13px] leading-5 text-muted-foreground">
          Os itens do checklist podem virar tarefas, com responsável e prazo.
        </p>
      )}
      {onGenerate ? (
        <div className="px-3 pt-1 pb-3">
          <button
            type="button"
            onClick={onGenerate}
            className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <ListTodo className="size-4 text-muted-foreground" aria-hidden="true" />
            Gerar tarefas do checklist
          </button>
        </div>
      ) : null}
    </section>
  )
}

/** Últimas versões e o atalho para o histórico completo. */
export function DocHistoryCard({
  versions,
  today,
  onOpen,
  className,
}: {
  versions: DocVersion[]
  today: DateKey
  onOpen: () => void
  className?: string
}) {
  const { profileById } = useWorkspace()
  return (
    <section aria-labelledby="historico-titulo" className={cn("rounded-xl border bg-card", className)}>
      <header className="flex items-center gap-2 px-4 pt-3.5 pb-1">
        <h2 id="historico-titulo" className="text-sm font-semibold text-foreground">
          Histórico
        </h2>
        {versions.length > 0 ? (
          <span className="ml-auto text-xs text-muted-foreground tabular-nums">
            {versions.length} {versions.length === 1 ? "versão" : "versões"}
          </span>
        ) : null}
      </header>
      {versions.length === 0 ? (
        <p className="px-4 pb-4 text-[13px] leading-5 text-muted-foreground">
          As versões anteriores ficam guardadas aqui conforme o documento é editado.
        </p>
      ) : (
        <>
          <ul className="px-4 py-1.5">
            {versions.slice(0, 3).map((version) => {
              const author = version.saved_by ? profileById.get(version.saved_by) : undefined
              return (
                <li key={version.id} className="flex items-baseline justify-between gap-3 py-1 text-[13px]">
                  <span className="text-foreground tabular-nums">{whenLabel(version.saved_at, today)}</span>
                  <span className="truncate text-muted-foreground">{author ? firstName(author.full_name) : "—"}</span>
                </li>
              )
            })}
          </ul>
          <div className="px-3 pb-3">
            <button
              type="button"
              onClick={onOpen}
              className="inline-flex h-8 items-center gap-1.5 rounded-md px-2 text-[13px] font-medium text-foreground transition-colors outline-none hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
            >
              <History className="size-4 text-muted-foreground" aria-hidden="true" />
              Ver e restaurar versões
            </button>
          </div>
        </>
      )}
    </section>
  )
}
