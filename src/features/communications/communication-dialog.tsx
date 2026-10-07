"use client"

import { CalendarDays, ListPlus, Trash2 } from "lucide-react"
import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { DatePicker } from "@/components/date-picker"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  createCommunication,
  createTaskFromCommunication,
  deleteCommunication,
  updateCommunication,
} from "@/features/communications/actions"
import { DETAILS_MAX, SUMMARY_MAX } from "@/features/communications/validation"
import { ProjectSelect } from "@/features/projects/project-meta"
import { AssigneePicker } from "@/features/tasks/assignee-picker"
import { DueDatePicker } from "@/features/tasks/due-date-picker"
import { StatusDot } from "@/features/tasks/task-meta"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate } from "@/lib/dates"
import {
  COMMUNICATION_CHANNEL_LABEL,
  COMMUNICATION_CHANNELS,
  COMMUNICATION_KIND_LABEL,
  COMMUNICATION_KINDS,
  isCommunicationChannel,
} from "@/lib/labels"
import type { Communication, CommunicationChannel, CommunicationKind, DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface CommunicationDialogState {
  open: boolean
  key: number
  communication?: Communication
  defaults?: { client_id?: string; project_id?: string | null; kind?: CommunicationKind }
}

const NONE = "none"
const TRIGGER = "h-9 w-full justify-between shadow-none"

export function CommunicationDialog({
  state,
  onOpenChange,
}: {
  state: CommunicationDialogState
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[5%] max-h-[92svh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[9%] sm:max-w-[600px]"
      >
        <DialogTitle className="sr-only">{state.communication ? "Comunicação" : "Registrar comunicação"}</DialogTitle>
        <DialogDescription className="sr-only">Com quem, por onde, o que foi falado e se vira tarefa.</DialogDescription>
        <CommunicationForm
          key={state.key}
          communication={state.communication}
          defaults={state.defaults}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, children, className }: { label: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <p className="text-xs font-medium text-muted-foreground">{label}</p>
      {children}
    </div>
  )
}

function CommunicationForm({
  communication,
  defaults,
  onDone,
}: {
  communication?: Communication
  defaults?: CommunicationDialogState["defaults"]
  onDone: () => void
}) {
  const { clients, currentUser, projectById } = useWorkspace()
  const { tasks, today, openTask } = useTasks()
  const [clientId, setClientId] = useState<string | null>(communication?.client_id ?? defaults?.client_id ?? null)
  const [projectId, setProjectId] = useState<string | null>(communication ? communication.project_id : (defaults?.project_id ?? null))
  const [kind, setKind] = useState<CommunicationKind>(communication?.kind ?? defaults?.kind ?? "update")
  const [channel, setChannel] = useState<CommunicationChannel>(communication?.channel ?? "whatsapp")
  const [summary, setSummary] = useState(communication?.summary ?? "")
  const [details, setDetails] = useState(communication?.details ?? "")
  const [occurredOn, setOccurredOn] = useState<DateKey>(communication?.occurred_on ?? today)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [taskOpen, setTaskOpen] = useState(false)
  const [taskTitle, setTaskTitle] = useState(communication?.summary ?? "")
  const [taskAssignees, setTaskAssignees] = useState<string[]>([currentUser.id])
  const [taskDue, setTaskDue] = useState<DateKey | null>(null)
  const [isPending, startTransition] = useTransition()
  const linkedTasks = communication ? tasks.filter((task) => task.communication_id === communication.id) : []
  const activeClients = clients.filter((client) => client.active || client.id === clientId)

  function submit() {
    if (!clientId) {
      setError("Escolha o cliente.")
      return
    }
    if (!summary.trim()) {
      setError("Resuma o que foi falado.")
      return
    }
    setError(null)
    const input = {
      client_id: clientId,
      project_id: projectId,
      kind,
      channel,
      summary,
      details: details || null,
      occurred_on: occurredOn,
    }
    startTransition(async () => {
      const result = communication
        ? await updateCommunication(communication.id, input)
        : await createCommunication(input)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(communication ? "Comunicação salva" : "Comunicação registrada", { description: summary.trim() })
      onDone()
    })
  }

  function createTask() {
    if (!communication) return
    startTransition(async () => {
      const result = await createTaskFromCommunication(communication.id, {
        title: taskTitle,
        assignee_ids: taskAssignees,
        due_date: taskDue,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Tarefa criada", { description: taskTitle.trim() })
      setTaskOpen(false)
    })
  }

  function remove() {
    if (!communication) return
    startTransition(async () => {
      const result = await deleteCommunication(communication.id)
      if (!result.ok) toast.error(result.error)
      else {
        toast("Comunicação excluída", { description: communication.summary })
        onDone()
      }
    })
  }

  return (
    <form
      className="flex max-h-[92svh] flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey) && !taskOpen) {
          event.preventDefault()
          submit()
        }
      }}
    >
      <div className="overflow-y-auto px-5 pt-5 pb-4">
        <p className="mb-3 text-xs font-medium text-muted-foreground">
          {communication ? "Comunicação com o cliente" : "Registrar comunicação"}
        </p>
        <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Tipo">
          {COMMUNICATION_KINDS.map((option) => (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={kind === option}
              onClick={() => setKind(option)}
              className={cn(
                "h-7 rounded-full border px-3 text-[13px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                kind === option ? "border-foreground/25 bg-accent font-medium text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            >
              {COMMUNICATION_KIND_LABEL[option]}
            </button>
          ))}
        </div>
        <textarea
          autoFocus={!communication}
          value={summary}
          onChange={(event) => {
            setSummary(event.target.value)
            if (error) setError(null)
          }}
          rows={2}
          maxLength={SUMMARY_MAX}
          placeholder={
            kind === "request"
              ? "O que o cliente pediu? (ex.: trocar a foto da home)"
              : kind === "approval"
                ? "O que foi aprovado? (ex.: layout da home, versão 2)"
                : "O que foi falado?"
          }
          aria-label="Resumo"
          className="mt-3 field-sizing-content w-full resize-none bg-transparent text-[17px] leading-7 font-semibold tracking-tight text-foreground outline-none placeholder:font-normal placeholder:text-subtle-foreground"
        />
        <Textarea
          value={details}
          onChange={(event) => setDetails(event.target.value)}
          maxLength={DETAILS_MAX}
          placeholder="Detalhes, mensagem colada, link do e-mail… (opcional)"
          aria-label="Detalhes"
          className="mt-2 min-h-16 resize-none text-[13px] shadow-none"
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Cliente">
            <Select value={clientId ?? NONE} onValueChange={(value) => setClientId(value === NONE ? null : value)}>
              <SelectTrigger aria-label="Cliente" className={TRIGGER}>
                <SelectValue placeholder="Escolha o cliente" />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {activeClients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Projeto">
            <ProjectSelect
              value={projectId}
              clientId={clientId}
              onChange={(next) => {
                setProjectId(next)
                const project = next ? projectById.get(next) : undefined
                if (project?.client_id && !clientId) setClientId(project.client_id)
              }}
              placeholder="Nenhum"
              size="default"
              className={TRIGGER}
            />
          </Field>
          <Field label="Canal">
            <Select
              value={channel}
              onValueChange={(value) => {
                if (isCommunicationChannel(value)) setChannel(value)
              }}
            >
              <SelectTrigger aria-label="Canal" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {COMMUNICATION_CHANNELS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {COMMUNICATION_CHANNEL_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Quando">
            <DatePicker
              value={occurredOn}
              onChange={(next) => next && setOccurredOn(next)}
              today={today}
              placeholder="Data"
              aria-label="Quando"
              icon={<CalendarDays className="size-4 text-muted-foreground" />}
              renderValue={(value) => <span>{formatShortDate(value, today)}</span>}
              className="h-9 w-full justify-start border border-input px-3"
            />
          </Field>
        </div>

        {communication ? (
          <div className="mt-5 rounded-lg border bg-muted/30 p-3">
            <div className="flex items-center gap-2">
              <p className="text-[13px] font-medium text-foreground">Tarefas</p>
              {!taskOpen ? (
                <Button type="button" variant="ghost" size="sm" className="ml-auto h-7 gap-1 px-2 text-xs" onClick={() => setTaskOpen(true)}>
                  <ListPlus className="size-3.5" />
                  Virar tarefa
                </Button>
              ) : null}
            </div>
            {linkedTasks.length > 0 ? (
              <ul className="mt-1.5 space-y-1">
                {linkedTasks.map((task) => (
                  <li key={task.id}>
                    <button
                      type="button"
                      onClick={() => openTask(task.id)}
                      className="flex w-full items-center gap-2 rounded px-1 py-0.5 text-left text-[13px] text-foreground hover:bg-muted"
                    >
                      <StatusDot status={task.status} />
                      <span className={cn("truncate", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : !taskOpen ? (
              <p className="mt-1 text-xs text-muted-foreground">Pedido do cliente? Transforme em tarefa com prazo e responsável.</p>
            ) : null}
            {taskOpen ? (
              <div className="mt-2 space-y-2">
                <input
                  autoFocus
                  value={taskTitle}
                  onChange={(event) => setTaskTitle(event.target.value)}
                  maxLength={200}
                  aria-label="Título da tarefa"
                  className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
                />
                <div className="flex flex-wrap items-center gap-2">
                  <AssigneePicker value={taskAssignees} onChange={setTaskAssignees} className="h-8 rounded-md border border-input bg-background px-2.5 text-[13px]" />
                  <DueDatePicker value={taskDue} onChange={setTaskDue} today={today} className="h-8 rounded-md border border-input bg-background px-2.5 text-[13px]" />
                  <div className="ml-auto flex gap-1.5">
                    <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => setTaskOpen(false)}>
                      Cancelar
                    </Button>
                    <Button type="button" size="sm" className="h-8" disabled={isPending || !taskTitle.trim()} onClick={createTask}>
                      Criar tarefa
                    </Button>
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
        {communication ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Excluir comunicação"
            onClick={() => setConfirmDelete(true)}
            disabled={isPending}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </Button>
        ) : null}
        <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground", communication && "mr-auto")} role={error ? "alert" : undefined}>
          {error ?? (communication ? "" : "Fica no histórico do cliente.")}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Salvando…" : communication ? "Salvar" : "Registrar"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta comunicação?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela sai do histórico do cliente. Tarefas criadas a partir dela continuam.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}

