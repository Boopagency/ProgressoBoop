"use client"

import { Building2, CalendarDays } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createTasksFromDoc } from "@/features/docs/actions"
import type { ChecklistItem } from "@/features/docs/logic"
import { AssigneePicker } from "@/features/tasks/assignee-picker"
import { DueDatePicker } from "@/features/tasks/due-date-picker"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const NONE = "none"
const MAX_ITEMS = 50
const CHIP =
  "h-8 rounded-md border border-input bg-background px-2.5 text-[13px] shadow-none hover:bg-accent"

export interface GenerateTasksState {
  open: boolean
  key: number
}

/**
 * Transforma itens do checklist em tarefas (com o documento como origem).
 * Vêm marcados os itens ainda não feitos no documento.
 */
export function GenerateTasksDialog({
  state,
  onOpenChange,
  docId,
  docTitle,
  items,
  clientId,
  today,
}: {
  state: GenerateTasksState
  onOpenChange: (open: boolean) => void
  docId: string
  docTitle: string
  items: ChecklistItem[]
  clientId: string | null
  today: DateKey
}) {
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[8%] max-h-[84svh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[10%] sm:max-w-[600px]"
      >
        <DialogTitle className="px-5 pt-5 text-base font-semibold">Gerar tarefas</DialogTitle>
        <DialogDescription className="px-5 pt-1 text-[13px] text-muted-foreground">
          Cada item escolhido vira uma tarefa ligada a “{docTitle}”.
        </DialogDescription>
        <GenerateTasksForm
          key={state.key}
          docId={docId}
          items={items}
          defaultClientId={clientId}
          today={today}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function GenerateTasksForm({
  docId,
  items,
  defaultClientId,
  today,
  onDone,
}: {
  docId: string
  items: ChecklistItem[]
  defaultClientId: string | null
  today: DateKey
  onDone: () => void
}) {
  const router = useRouter()
  const { currentUser, clients } = useWorkspace()
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(items.filter((item) => !item.checked).slice(0, MAX_ITEMS).map((item) => item.id))
  )
  const [assigneeIds, setAssigneeIds] = useState<string[]>([currentUser.id])
  const [dueDate, setDueDate] = useState<DateKey | null>(null)
  const [clientId, setClientId] = useState<string | null>(defaultClientId)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const allSelected = items.length > 0 && items.every((item) => selected.has(item.id))
  const count = selected.size

  function toggle(id: string, checked: boolean) {
    setSelected((current) => {
      const next = new Set(current)
      if (checked) next.add(id)
      else next.delete(id)
      return next
    })
    setError(null)
  }

  function submit() {
    if (isPending) return
    const chosen = items.filter((item) => selected.has(item.id)).map((item) => item.text)
    if (chosen.length === 0) {
      setError("Escolha pelo menos um item.")
      return
    }
    if (chosen.length > MAX_ITEMS) {
      setError(`No máximo ${MAX_ITEMS} itens de uma vez.`)
      return
    }
    startTransition(async () => {
      const result = await createTasksFromDoc(docId, {
        items: chosen,
        assignee_ids: assigneeIds,
        due_date: dueDate,
        client_id: clientId,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onDone()
      toast.success(
        result.data.count === 1 ? "1 tarefa criada" : `${result.data.count} tarefas criadas`,
        { action: { label: "Ver tarefas", onClick: () => router.push("/tarefas") } }
      )
    })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="flex min-h-0 flex-col"
    >
      <div className="mt-4 flex items-center gap-3 border-y bg-muted/30 px-5 py-2">
        <Checkbox
          id="todos-itens"
          checked={allSelected ? true : count > 0 ? "indeterminate" : false}
          onCheckedChange={(checked) =>
            setSelected(checked === true ? new Set(items.slice(0, MAX_ITEMS).map((item) => item.id)) : new Set())
          }
        />
        <label htmlFor="todos-itens" className="text-[13px] font-medium text-foreground">
          {count === 0 ? "Nenhum item escolhido" : count === 1 ? "1 item escolhido" : `${count} itens escolhidos`}
        </label>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
        {items.map((item) => (
          <li key={item.id}>
            <label className="flex cursor-pointer items-start gap-3 rounded-md px-2 py-1.5 hover:bg-muted/50">
              <Checkbox
                checked={selected.has(item.id)}
                onCheckedChange={(checked) => toggle(item.id, checked === true)}
                className="mt-0.5"
              />
              <span className={cn("text-sm leading-5 text-foreground", item.checked && "text-muted-foreground")}>
                {item.text}
                {item.checked ? <span className="ml-1.5 text-xs text-muted-foreground">(marcado no documento)</span> : null}
              </span>
            </label>
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap items-center gap-2 border-t px-5 pt-3 pb-4">
        <AssigneePicker value={assigneeIds} onChange={setAssigneeIds} className={CHIP} />
        <DueDatePicker
          value={dueDate}
          onChange={setDueDate}
          today={today}
          className={CHIP}
          icon={<CalendarDays className="size-3.5 text-muted-foreground" />}
        />
        <Select value={clientId ?? NONE} onValueChange={(value) => setClientId(value === NONE ? null : value)}>
          <SelectTrigger size="sm" aria-label="Cliente" className={cn(CHIP, "gap-1.5 [&>svg:last-child]:hidden")}>
            <Building2 className="size-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={NONE} className="text-muted-foreground">
              Cliente
            </SelectItem>
            {clients
              .filter((client) => client.active || client.id === clientId)
              .map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
        <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
          {error ?? "Mesmo responsável e prazo para todas. Dá para ajustar cada uma depois."}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending || count === 0}>
            {isPending ? "Criando…" : count === 1 ? "Criar 1 tarefa" : `Criar ${count} tarefas`}
          </Button>
        </div>
      </div>
    </form>
  )
}
