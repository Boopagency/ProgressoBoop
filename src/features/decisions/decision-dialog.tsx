"use client"

import { CalendarDays, Trash2 } from "lucide-react"
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
import { createDecision, deleteDecision, updateDecision } from "@/features/decisions/actions"
import { CONTEXT_MAX, TITLE_MAX, type DecisionInput } from "@/features/decisions/validation"
import { ProjectSelect } from "@/features/projects/project-meta"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate, todayKey } from "@/lib/dates"
import { DECISION_STATUS_LABEL, TASK_AREA_LABEL, TASK_AREAS, isTaskArea } from "@/lib/labels"
import type { DateKey, Decision } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface DecisionDialogState {
  open: boolean
  key: number
  decision?: Decision
  /** Origem de uma decisão nova (reunião, projeto, cliente). */
  defaults?: Partial<Pick<DecisionInput, "client_id" | "project_id" | "meeting_id" | "area">>
}

const NONE = "none"
const TRIGGER = "h-9 w-full justify-between shadow-none"

export function DecisionDialog({
  state,
  onOpenChange,
}: {
  state: DecisionDialogState
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[6%] max-h-[90svh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[10%] sm:max-w-[600px]"
      >
        <DialogTitle className="sr-only">{state.decision ? "Editar decisão" : "Nova decisão"}</DialogTitle>
        <DialogDescription className="sr-only">O que foi decidido, por quê e de onde veio.</DialogDescription>
        <DecisionForm
          key={state.key}
          decision={state.decision}
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

function DecisionForm({
  decision,
  defaults,
  onDone,
}: {
  decision?: Decision
  defaults?: DecisionDialogState["defaults"]
  onDone: () => void
}) {
  const { clients } = useWorkspace()
  const [today] = useState<DateKey>(() => todayKey())
  const [title, setTitle] = useState(decision?.title ?? "")
  const [context, setContext] = useState(decision?.context ?? "")
  const [decidedOn, setDecidedOn] = useState<DateKey>(decision?.decided_on ?? today)
  const [area, setArea] = useState(decision ? decision.area : (defaults?.area ?? null))
  const [clientId, setClientId] = useState(decision ? decision.client_id : (defaults?.client_id ?? null))
  const [projectId, setProjectId] = useState(decision ? decision.project_id : (defaults?.project_id ?? null))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()
  const meetingId = decision ? decision.meeting_id : (defaults?.meeting_id ?? null)

  function submit() {
    if (!title.trim()) {
      setError("Escreva o que foi decidido.")
      return
    }
    setError(null)
    const input = {
      title,
      context: context || null,
      decided_on: decidedOn,
      area,
      client_id: clientId,
      project_id: projectId,
      meeting_id: meetingId,
    }
    startTransition(async () => {
      const result = decision
        ? await updateDecision(decision.id, input)
        : await createDecision({ ...input, status: "active" })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(decision ? "Decisão salva" : "Decisão registrada", { description: title.trim() })
      onDone()
    })
  }

  function toggleStatus() {
    if (!decision) return
    const status = decision.status === "active" ? "revoked" : "active"
    startTransition(async () => {
      const result = await updateDecision(decision.id, { status })
      if (!result.ok) toast.error(result.error)
      else {
        toast.success(status === "revoked" ? "Decisão revogada" : "Decisão de volta em vigor", { description: decision.title })
        onDone()
      }
    })
  }

  function remove() {
    if (!decision) return
    startTransition(async () => {
      const result = await deleteDecision(decision.id)
      if (!result.ok) toast.error(result.error)
      else {
        toast("Decisão excluída", { description: decision.title })
        onDone()
      }
    })
  }

  return (
    <form
      className="flex max-h-[90svh] flex-col"
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
      <div className="overflow-y-auto px-5 pt-5 pb-4">
        <p className="mb-3 flex items-center gap-2 text-xs font-medium text-muted-foreground">
          {decision ? "Decisão" : "Nova decisão"}
          {decision?.status === "revoked" ? (
            <span className="rounded-full border border-dashed px-2 text-[11px]">{DECISION_STATUS_LABEL.revoked}</span>
          ) : null}
        </p>
        <textarea
          autoFocus
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            if (error) setError(null)
          }}
          rows={2}
          maxLength={TITLE_MAX}
          placeholder="O que ficou decidido? (ex.: Fee mínimo de R$ 2.500 para novos clientes)"
          aria-label="Decisão"
          className="field-sizing-content w-full resize-none bg-transparent text-lg leading-7 font-semibold tracking-tight text-foreground outline-none placeholder:font-normal placeholder:text-subtle-foreground"
        />
        <Textarea
          value={context}
          onChange={(event) => setContext(event.target.value)}
          maxLength={CONTEXT_MAX}
          placeholder="Por quê? Alternativas descartadas, números, quem participou… (opcional)"
          aria-label="Contexto"
          className="mt-2 min-h-20 resize-none text-[13px] shadow-none"
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Decidida em">
            <DatePicker
              value={decidedOn}
              onChange={(next) => next && setDecidedOn(next)}
              today={today}
              placeholder="Data"
              aria-label="Decidida em"
              icon={<CalendarDays className="size-4 text-muted-foreground" />}
              renderValue={(value) => <span>{formatShortDate(value, today)}</span>}
              className="h-9 w-full justify-start border border-input px-3"
            />
          </Field>
          <Field label="Área">
            <Select value={area ?? NONE} onValueChange={(value) => setArea(isTaskArea(value) ? value : null)}>
              <SelectTrigger aria-label="Área" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE}>Geral</SelectItem>
                {TASK_AREAS.map((option) => (
                  <SelectItem key={option} value={option}>
                    {TASK_AREA_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Cliente">
            <Select value={clientId ?? NONE} onValueChange={(value) => setClientId(value === NONE ? null : value)}>
              <SelectTrigger aria-label="Cliente" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE}>Nenhum (vale para a Boop)</SelectItem>
                {clients
                  .filter((client) => client.active || client.id === clientId)
                  .map((client) => (
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
              onChange={setProjectId}
              placeholder="Nenhum"
              size="default"
              className={TRIGGER}
            />
          </Field>
        </div>
        {meetingId ? <p className="mt-3 text-xs text-muted-foreground">Registrada numa reunião.</p> : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
        {decision ? (
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={toggleStatus} disabled={isPending}>
              {decision.status === "active" ? "Revogar" : "Voltar a valer"}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Excluir decisão"
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          </div>
        ) : (
          <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
            {error ?? "Combinado é tarefa com dono; decisão é o que passa a valer."}
          </p>
        )}
        <div className="ml-auto flex shrink-0 gap-2">
          {decision && error ? <p className="self-center text-xs text-destructive" role="alert">{error}</p> : null}
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Salvando…" : decision ? "Salvar" : "Registrar"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta decisão?</AlertDialogTitle>
            <AlertDialogDescription>
              Para registrar que ela deixou de valer, use “Revogar”: assim o histórico continua. Excluir apaga de vez.
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
