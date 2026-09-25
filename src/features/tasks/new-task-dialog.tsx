"use client"

import { Building2, CalendarDays, Flag, Plus, Tag } from "lucide-react"
import {
  createContext,
  startTransition,
  use,
  useEffect,
  useState,
  useTransition,
  type ComponentProps,
  type ReactNode,
} from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createTask } from "@/features/tasks/actions"
import { AssigneePicker } from "@/features/tasks/assignee-picker"
import { DueDatePicker } from "@/features/tasks/due-date-picker"
import type { TaskInput } from "@/features/tasks/validation"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { todayKey } from "@/lib/dates"
import {
  TASK_AREA_LABEL,
  TASK_AREAS,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
  isTaskArea,
  isTaskPriority,
} from "@/lib/labels"
import type { DateKey, TaskArea, TaskPriority } from "@/lib/types"
import { cn } from "@/lib/utils"

type NewTaskDefaults = Partial<Pick<TaskInput, "assignee_ids" | "due_date" | "area" | "client_id">>

interface NewTaskContextValue {
  openNewTask: (defaults?: NewTaskDefaults) => void
}

const NewTaskContext = createContext<NewTaskContextValue | null>(null)

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName) ||
    target.closest("[role=dialog], [role=menu], [role=listbox]") !== null
  )
}

/** Disponibiliza "Nova tarefa" em qualquer tela (botões e atalho N). */
export function NewTaskProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<{ open: boolean; defaults: NewTaskDefaults; key: number }>({
    open: false,
    defaults: {},
    key: 0,
  })

  function openNewTask(defaults: NewTaskDefaults = {}) {
    setState((current) => ({ open: true, defaults, key: current.key + 1 }))
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "n" || event.metaKey || event.ctrlKey || event.altKey) return
      if (isTypingTarget(event.target)) return
      event.preventDefault()
      setState((current) => ({ open: true, defaults: {}, key: current.key + 1 }))
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <NewTaskContext value={{ openNewTask }}>
      {children}
      <Dialog
        open={state.open}
        onOpenChange={(open) => setState((current) => ({ ...current, open }))}
      >
        <DialogContent
          showCloseButton={false}
          className="top-[12%] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[18%] sm:max-w-[600px]"
        >
          <DialogTitle className="sr-only">Nova tarefa</DialogTitle>
          <DialogDescription className="sr-only">
            Título, responsável e prazo. Os demais campos são opcionais.
          </DialogDescription>
          <NewTaskForm
            key={state.key}
            defaults={state.defaults}
            onDone={() => setState((current) => ({ ...current, open: false }))}
          />
        </DialogContent>
      </Dialog>
    </NewTaskContext>
  )
}

export function useNewTask(): NewTaskContextValue {
  const context = use(NewTaskContext)
  if (!context) throw new Error("useNewTask precisa estar dentro de NewTaskProvider.")
  return context
}

export function NewTaskButton({
  defaults,
  className,
  ...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & { defaults?: NewTaskDefaults }) {
  const { openNewTask } = useNewTask()
  return (
    <Button onClick={() => openNewTask(defaults)} className={cn("gap-1.5", className)} {...props}>
      <Plus />
      Nova tarefa
      <kbd className="ml-1 hidden rounded border border-white/20 px-1 font-sans text-[10px] leading-4 text-primary-foreground/70 sm:inline-block">
        N
      </kbd>
    </Button>
  )
}

const NONE = "none"
const CHIP =
  "h-8 rounded-md border border-input bg-background px-2.5 text-[13px] shadow-none hover:bg-accent"

function NewTaskForm({
  defaults,
  onDone,
}: {
  defaults: NewTaskDefaults
  onDone: () => void
}) {
  const { currentUser, clients } = useWorkspace()
  const [today] = useState<DateKey>(() => todayKey())
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [assigneeIds, setAssigneeIds] = useState<string[]>(
    defaults.assignee_ids ?? [currentUser.id]
  )
  const [dueDate, setDueDate] = useState<DateKey | null>(defaults.due_date ?? null)
  const [area, setArea] = useState<TaskArea | null>(defaults.area ?? null)
  const [clientId, setClientId] = useState<string | null>(defaults.client_id ?? null)
  const [priority, setPriority] = useState<TaskPriority>("normal")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startSaving] = useTransition()

  function submit() {
    if (isPending) return
    if (!title.trim()) {
      setError("Dê um título à tarefa.")
      return
    }
    setError(null)
    startSaving(async () => {
      const result = await createTask({
        title,
        description: description || null,
        assignee_ids: assigneeIds,
        due_date: dueDate,
        area,
        client_id: clientId,
        plan_id: null,
        priority,
        status: "todo",
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      startTransition(onDone)
      toast.success("Tarefa criada", { description: title.trim() })
    })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          submit()
        }
      }}
    >
      <div className="px-5 pt-5">
        <p className="mb-3 text-xs font-medium text-muted-foreground">Nova tarefa</p>
        <input
          autoFocus
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            if (error) setError(null)
          }}
          placeholder="O que precisa ser feito?"
          aria-label="Título"
          aria-invalid={error ? true : undefined}
          maxLength={200}
          className="w-full bg-transparent text-lg leading-7 font-semibold tracking-tight text-foreground outline-none placeholder:font-normal placeholder:text-subtle-foreground"
        />
        <textarea
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Descrição (opcional)"
          aria-label="Descrição"
          rows={2}
          className="mt-1 field-sizing-content max-h-40 min-h-12 w-full resize-none bg-transparent text-sm leading-6 text-foreground outline-none placeholder:text-subtle-foreground"
        />
      </div>

      <div className="flex flex-wrap items-center gap-2 px-5 pt-2 pb-4">
        <AssigneePicker value={assigneeIds} onChange={setAssigneeIds} className={CHIP} />
        <DueDatePicker
          value={dueDate}
          onChange={setDueDate}
          today={today}
          className={CHIP}
          icon={<CalendarDays className="size-3.5 text-muted-foreground" />}
        />
        <Select
          value={area ?? NONE}
          onValueChange={(value) => setArea(isTaskArea(value) ? value : null)}
        >
          <SelectTrigger
            size="sm"
            aria-label="Área"
            className={cn(CHIP, "gap-1.5 [&>svg:last-child]:hidden")}
          >
            <Tag className="size-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={NONE} className="text-muted-foreground">
              Área
            </SelectItem>
            {TASK_AREAS.map((option) => (
              <SelectItem key={option} value={option}>
                {TASK_AREA_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={clientId ?? NONE}
          onValueChange={(value) => setClientId(value === NONE ? null : value)}
        >
          <SelectTrigger
            size="sm"
            aria-label="Cliente"
            className={cn(CHIP, "gap-1.5 [&>svg:last-child]:hidden")}
          >
            <Building2 className="size-3.5" />
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={NONE} className="text-muted-foreground">
              Cliente
            </SelectItem>
            {clients
              .filter((client) => client.active)
              .map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
        <Select
          value={priority}
          onValueChange={(value) => {
            if (isTaskPriority(value)) setPriority(value)
          }}
        >
          <SelectTrigger
            size="sm"
            aria-label="Prioridade"
            className={cn(CHIP, "gap-1.5 [&>svg:last-child]:hidden")}
          >
            <Flag className={cn("size-3.5", priority === "high" && "text-orange-600")} />
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            {TASK_PRIORITIES.map((option) => (
              <SelectItem key={option} value={option}>
                {TASK_PRIORITY_LABEL[option]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
        <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
          {error ?? (
            <>
              <kbd className="font-sans">Ctrl</kbd> + <kbd className="font-sans">Enter</kbd> para
              salvar
            </>
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Criando…" : "Criar tarefa"}
          </Button>
        </div>
      </div>
    </form>
  )
}
