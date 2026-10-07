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
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createObjective, deleteObjective, updateObjective } from "@/features/goals/actions"
import { periodShortcuts } from "@/features/goals/logic"
import { DESCRIPTION_MAX, TITLE_MAX } from "@/features/goals/validation"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate, todayKey } from "@/lib/dates"
import { TASK_AREA_LABEL, TASK_AREAS } from "@/lib/labels"
import type { DateKey, Objective, TaskArea } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface ObjectiveDialogState {
  open: boolean
  key: number
  objective?: Objective
}

const NONE = "none"
const TRIGGER = "h-9 w-full justify-between shadow-none"

export function ObjectiveDialog({
  state,
  onOpenChange,
  onCreated,
}: {
  state: ObjectiveDialogState
  onOpenChange: (open: boolean) => void
  /** Depois de criar: já abre o primeiro resultado-chave. */
  onCreated: (objective: Pick<Objective, "id" | "starts_on" | "ends_on" | "title">) => void
}) {
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent showCloseButton={false} className="top-[6%] max-h-[90svh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[10%] sm:max-w-[560px]">
        <DialogTitle className="sr-only">{state.objective ? "Editar objetivo" : "Novo objetivo"}</DialogTitle>
        <DialogDescription className="sr-only">O objetivo, o período e quem cuida dele.</DialogDescription>
        <ObjectiveForm key={state.key} objective={state.objective} onDone={() => onOpenChange(false)} onCreated={onCreated} />
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

function ObjectiveForm({
  objective,
  onDone,
  onCreated,
}: {
  objective?: Objective
  onDone: () => void
  onCreated: (objective: Pick<Objective, "id" | "starts_on" | "ends_on" | "title">) => void
}) {
  const { profiles, currentUser } = useWorkspace()
  const [today] = useState<DateKey>(() => todayKey())
  const shortcuts = periodShortcuts(today)
  const [title, setTitle] = useState(objective?.title ?? "")
  const [description, setDescription] = useState(objective?.description ?? "")
  const [area, setArea] = useState<TaskArea | null>(objective?.area ?? null)
  const [ownerId, setOwnerId] = useState<string | null>(objective ? objective.owner_id : currentUser.id)
  const [startsOn, setStartsOn] = useState<DateKey>(objective?.starts_on ?? shortcuts[1]!.starts_on)
  const [endsOn, setEndsOn] = useState<DateKey>(objective?.ends_on ?? shortcuts[1]!.ends_on)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!title.trim()) return setError("Escreva o objetivo (ex.: Crescer a receita recorrente).")
    if (endsOn < startsOn) return setError("O fim não pode ser antes do começo.")
    setError(null)
    const fields = { title, description: description || null, area, owner_id: ownerId, starts_on: startsOn, ends_on: endsOn }
    startTransition(async () => {
      if (objective) {
        const result = await updateObjective(objective.id, fields)
        if (!result.ok) return setError(result.error)
        toast.success("Objetivo salvo", { description: title.trim() })
        onDone()
        return
      }
      const result = await createObjective(fields)
      if (!result.ok) return setError(result.error)
      toast.success("Objetivo criado", { description: "Agora, os resultados-chave que medem o objetivo." })
      onDone()
      onCreated({ id: result.data.id, starts_on: startsOn, ends_on: endsOn, title: title.trim() })
    })
  }

  function remove() {
    if (!objective) return
    startTransition(async () => {
      const result = await deleteObjective(objective.id)
      if (!result.ok) toast.error(result.error)
      else {
        toast("Objetivo excluído", { description: objective.title })
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
    >
      <div className="overflow-y-auto px-5 pt-5 pb-4">
        <p className="text-xs font-medium text-muted-foreground">Objetivo</p>
        <input
          autoFocus={!objective}
          value={title}
          onChange={(event) => {
            setTitle(event.target.value)
            if (error) setError(null)
          }}
          maxLength={TITLE_MAX}
          placeholder="Ex.: Crescer a receita recorrente"
          aria-label="Objetivo"
          className="mt-1 w-full bg-transparent text-lg leading-7 font-semibold tracking-tight text-foreground outline-none placeholder:font-normal placeholder:text-subtle-foreground"
        />
        <Textarea
          value={description}
          maxLength={DESCRIPTION_MAX}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Por que importa e o que muda se der certo (opcional)"
          aria-label="Descrição"
          className="mt-3 min-h-14 resize-none text-[13px] shadow-none"
        />
        <Field label="Período" className="mt-4">
          <div className="flex flex-wrap gap-1.5">
            {shortcuts.map((shortcut) => (
              <button
                key={shortcut.label}
                type="button"
                onClick={() => {
                  setStartsOn(shortcut.starts_on)
                  setEndsOn(shortcut.ends_on)
                }}
                className={cn(
                  "h-7 rounded-full border px-2.5 text-xs transition-colors",
                  startsOn === shortcut.starts_on && endsOn === shortcut.ends_on
                    ? "border-foreground bg-foreground text-background"
                    : "text-muted-foreground hover:text-foreground"
                )}
              >
                {shortcut.label}
              </button>
            ))}
          </div>
          <div className="mt-2 grid grid-cols-2 gap-3">
            <DatePicker
              value={startsOn}
              onChange={(next) => next && setStartsOn(next)}
              today={today}
              placeholder="Começo"
              aria-label="Começo"
              icon={<CalendarDays className="size-4 text-muted-foreground" />}
              renderValue={(value) => <span>De {formatShortDate(value, today)}</span>}
              className="h-9 w-full justify-start border border-input px-3"
            />
            <DatePicker
              value={endsOn}
              onChange={(next) => next && setEndsOn(next)}
              today={today}
              placeholder="Fim"
              aria-label="Fim"
              icon={<CalendarDays className="size-4 text-muted-foreground" />}
              renderValue={(value) => <span>Até {formatShortDate(value, today)}</span>}
              className="h-9 w-full justify-start border border-input px-3"
            />
          </div>
        </Field>
        <div className="mt-4 grid grid-cols-2 gap-3">
          <Field label="Responsável">
            <Select value={ownerId ?? NONE} onValueChange={(value) => setOwnerId(value === NONE ? null : value)}>
              <SelectTrigger aria-label="Responsável" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE}>A equipe toda</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {firstName(profile.full_name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Área">
            <Select value={area ?? NONE} onValueChange={(value) => setArea(value === NONE ? null : (value as TaskArea))}>
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
        </div>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
        <div className="flex items-center gap-2">
          {objective ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Excluir objetivo"
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          ) : null}
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Salvando…" : objective ? "Salvar" : "Criar objetivo"}
          </Button>
        </div>
      </div>
      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este objetivo?</AlertDialogTitle>
            <AlertDialogDescription>“{objective?.title}” e os resultados-chave dele saem das metas. Os dados do sistema não mudam.</AlertDialogDescription>
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
