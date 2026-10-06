"use client"

import { CalendarDays, ListPlus, MoreHorizontal, Pencil, SquareArrowOutUpRight, Trash2 } from "lucide-react"
import { useState } from "react"

import { DatePicker } from "@/components/date-picker"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { OwnerPicker } from "@/features/meetings/owner-picker"
import { isPendingItem, type MeetingItemsApi } from "@/features/meetings/use-meeting-items"
import { ITEM_MAX } from "@/features/meetings/validation"
import { TaskCheckbox } from "@/features/tasks/task-checkbox"
import { DueLabel, StatusDot } from "@/features/tasks/task-meta"
import { useTasks } from "@/features/tasks/tasks-provider"
import { formatShortDate } from "@/lib/dates"
import { TASK_STATUS_LABEL } from "@/lib/labels"
import type { DateKey, MeetingItem } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Prazo do combinado; depois de cumprido, sem o vermelho de "venceu". */
export function AgreementDue({
  due,
  done,
  today,
  className,
}: {
  due: DateKey
  done: boolean
  today: DateKey
  className?: string
}) {
  if (done) {
    return (
      <span className={cn("text-[13px] text-muted-foreground tabular-nums", className)}>
        Prazo {formatShortDate(due, today)}
      </span>
    )
  }
  return <DueLabel due={due} today={today} className={className} />
}

/** Combinados desta reunião: o que ficou decidido, com responsável e prazo. */
export function AgreementsCard({ api }: { api: MeetingItemsApi }) {

  return (
    <section
      aria-labelledby="combinados-titulo"
      className="overflow-hidden rounded-xl border bg-card"
    >
      <header className="flex items-center gap-2 border-b px-4 py-3.5">
        <h2 id="combinados-titulo" className="text-sm font-semibold text-foreground">
          Combinados
        </h2>
        <span className="text-[13px] text-muted-foreground tabular-nums">
          {api.agreements.length}
        </span>
      </header>

      {api.agreements.length === 0 ? (
        <p className="px-4 py-4 text-[13px] leading-5 text-muted-foreground">
          Registre aqui o que ficou decidido: quem faz, até quando. Um combinado vira
          tarefa com um clique.
        </p>
      ) : (
        <ul className="divide-y">
          {api.agreements.map((item) => (
            <AgreementRow key={item.id} item={item} api={api} />
          ))}
        </ul>
      )}

      <AgreementForm api={api} />
    </section>
  )
}

function AgreementRow({ item, api }: { item: MeetingItem; api: MeetingItemsApi }) {
  const { tasks, today, toggleDone, openTask } = useTasks()
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(item.content)
  const task = item.task_id ? tasks.find((candidate) => candidate.id === item.task_id) : undefined
  const done = task ? task.status === "done" : item.done
  const pending = isPendingItem(item)

  function commit() {
    const next = draft.trim()
    setEditing(false)
    if (!next) {
      setDraft(item.content)
      return
    }
    if (next !== item.content) api.update(item.id, { content: next })
  }

  return (
    <li className="group/item flex items-start gap-3 px-4 py-3">
      <TaskCheckbox
        checked={done}
        disabled={pending}
        onCheckedChange={() => (task ? toggleDone(task) : api.update(item.id, { done: !item.done }))}
        aria-label={done ? `Reabrir "${item.content}"` : `Marcar "${item.content}" como cumprido`}
        className="mt-[1px]"
      />
      <div className="min-w-0 flex-1">
        {editing ? (
          <textarea
            autoFocus
            value={draft}
            maxLength={ITEM_MAX}
            rows={1}
            aria-label="Texto do combinado"
            onChange={(event) => setDraft(event.target.value)}
            onBlur={commit}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault()
                event.currentTarget.blur()
              }
              if (event.key === "Escape") {
                setDraft(item.content)
                setEditing(false)
              }
            }}
            className="field-sizing-content w-full resize-none rounded-md bg-muted/60 px-2 py-1 text-sm leading-5 text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/30"
          />
        ) : (
          <p
            className={cn(
              "text-sm leading-5 break-words whitespace-pre-line text-foreground",
              done && "text-muted-foreground line-through decoration-muted-foreground/50"
            )}
          >
            {item.content}
          </p>
        )}

        <div className="mt-1 -ml-1.5 flex flex-wrap items-center gap-x-0.5 gap-y-1">
          <OwnerPicker
            value={item.owner_id}
            onChange={(owner) => api.update(item.id, { owner_id: owner })}
            disabled={pending}
            className="h-6 px-1.5"
          />
          <DatePicker
            value={item.due_date}
            onChange={(due) => api.update(item.id, { due_date: due })}
            today={today}
            placeholder="Prazo"
            clearLabel="Remover prazo"
            aria-label="Prazo do combinado"
            icon={item.due_date ? null : <CalendarDays className="size-3.5 text-muted-foreground" />}
            renderValue={(due) => <AgreementDue due={due} done={done} today={today} />}
            className="h-6 px-1.5 text-[13px] text-muted-foreground"
          />
          {task ? (
            <button
              type="button"
              onClick={() => openTask(task.id)}
              className="inline-flex h-6 items-center gap-1.5 rounded-md px-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <StatusDot status={task.status} className="size-1.5" />
              Tarefa · {TASK_STATUS_LABEL[task.status]}
            </button>
          ) : !pending ? (
            <button
              type="button"
              onClick={() => api.toTask(item)}
              className="inline-flex h-6 items-center gap-1 rounded-md px-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-brand-ink"
            >
              <ListPlus className="size-3.5" aria-hidden="true" />
              Virar tarefa
            </button>
          ) : null}
        </div>
      </div>

      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={pending}>
          <Button
            variant="ghost"
            size="icon-sm"
            aria-label="Mais ações do combinado"
            className="-my-1 -mr-2 size-7 text-muted-foreground md:opacity-0 md:group-hover/item:opacity-100 md:focus-visible:opacity-100 md:data-[state=open]:opacity-100"
          >
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          {task ? (
            <DropdownMenuItem onSelect={() => openTask(task.id)}>
              <SquareArrowOutUpRight />
              Abrir tarefa
            </DropdownMenuItem>
          ) : (
            <DropdownMenuItem onSelect={() => api.toTask(item)}>
              <ListPlus />
              Virar tarefa
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => {
              setDraft(item.content)
              setEditing(true)
            }}
          >
            <Pencil />
            Editar texto
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => api.remove(item)}>
            <Trash2 />
            Excluir combinado
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </li>
  )
}

function AgreementForm({ api }: { api: MeetingItemsApi }) {
  const { today } = useTasks()
  const [content, setContent] = useState("")
  const [owner, setOwner] = useState<string | null>(null)
  const [due, setDue] = useState<DateKey | null>(null)

  function submit() {
    const text = content.trim()
    if (!text) return
    setContent("")
    setOwner(null)
    setDue(null)
    api.add({ kind: "agreement", content: text, owner_id: owner, due_date: due }, () => {
      setContent(text)
      setOwner(owner)
      setDue(due)
    })
  }

  return (
    <form
      className="border-t bg-muted/30 px-4 py-3"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <textarea
        value={content}
        onChange={(event) => setContent(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && !event.shiftKey) {
            event.preventDefault()
            submit()
          }
        }}
        rows={1}
        maxLength={ITEM_MAX}
        placeholder="O que ficou combinado?"
        aria-label="Novo combinado"
        className="field-sizing-content max-h-40 min-h-9 w-full resize-none rounded-md border border-input bg-background px-3 py-2 text-sm leading-5 text-foreground outline-none placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40"
      />
      <div className="mt-2 flex flex-wrap items-center gap-1">
        <OwnerPicker value={owner} onChange={setOwner} className="h-7 px-2" />
        <DatePicker
          value={due}
          onChange={setDue}
          today={today}
          placeholder="Prazo"
          clearLabel="Remover prazo"
          aria-label="Prazo do novo combinado"
          icon={<CalendarDays className="size-3.5 text-muted-foreground" />}
          renderValue={(value) => <DueLabel due={value} today={today} />}
          className="h-7 px-2 text-[13px] text-muted-foreground"
        />
        <Button
          type="submit"
          size="sm"
          variant="outline"
          disabled={!content.trim()}
          className="ml-auto h-7 shadow-none"
        >
          Adicionar
        </Button>
      </div>
    </form>
  )
}
