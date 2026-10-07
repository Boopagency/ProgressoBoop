"use client"

import { CalendarDays } from "lucide-react"
import { useRouter } from "next/navigation"
import { useId, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { DatePicker } from "@/components/date-picker"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { createProject, updateProject } from "@/features/projects/actions"
import { compareProjects } from "@/features/projects/logic"
import { PROJECT_TEMPLATES, templateByKey } from "@/features/projects/templates"
import { DESCRIPTION_MAX, NAME_MAX, type ProjectSource } from "@/features/projects/validation"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { addDaysToKey, formatShortDate, todayKey } from "@/lib/dates"
import { PROJECT_STATUS_LABEL, PROJECT_STATUSES, isProjectStatus } from "@/lib/labels"
import type { DateKey, DocSummary, Project, ProjectStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface ProjectDialogState {
  open: boolean
  key: number
  /** Projeto em edição; ausente para criar um novo. */
  project?: Project
  /** Valores iniciais de um projeto novo (ex.: o cliente da página). */
  defaults?: { client_id?: string | null; source?: ProjectSource }
}

const NONE = "none"
const INTERNAL = "internal"

export function ProjectDialog({
  state,
  onOpenChange,
  docs = [],
}: {
  state: ProjectDialogState
  onOpenChange: (open: boolean) => void
  /** Processos com checklist que podem servir de modelo. */
  docs?: DocSummary[]
}) {
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[4%] max-h-[92svh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[7%] sm:max-w-[640px]"
      >
        <DialogTitle className="sr-only">{state.project ? "Editar projeto" : "Novo projeto"}</DialogTitle>
        <DialogDescription className="sr-only">
          Nome, cliente, responsável, datas e de onde vêm as tarefas iniciais.
        </DialogDescription>
        <ProjectForm
          key={state.key}
          project={state.project}
          defaults={state.defaults}
          docs={docs}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function sourceValue(source: ProjectSource): string {
  if (source.type === "blank") return "blank"
  if (source.type === "template") return `template:${source.key}`
  return `${source.type}:${source.id}`
}

function parseSourceValue(value: string): ProjectSource {
  const [type, id] = value.split(":")
  if (type === "template" && id) return { type: "template", key: id }
  if ((type === "project" || type === "doc") && id) return { type, id }
  return { type: "blank" }
}

const TRIGGER = "h-9 w-full justify-between shadow-none"

function ProjectForm({
  project,
  defaults,
  docs,
  onDone,
}: {
  project?: Project
  defaults?: ProjectDialogState["defaults"]
  docs: DocSummary[]
  onDone: () => void
}) {
  const router = useRouter()
  const ids = useId()
  const { profiles, clients, projects, currentUser, profileById } = useWorkspace()
  const [today] = useState<DateKey>(() => todayKey())
  const editing = Boolean(project)
  const [name, setName] = useState(project?.name ?? "")
  const [clientId, setClientId] = useState<string | null>(project ? project.client_id : (defaults?.client_id ?? null))
  const [ownerId, setOwnerId] = useState<string | null>(project ? project.owner_id : currentUser.id)
  const [status, setStatus] = useState<ProjectStatus>(project?.status ?? "active")
  const [startsOn, setStartsOn] = useState<DateKey>(project?.starts_on ?? today)
  const [dueOn, setDueOn] = useState<DateKey | null>(project?.due_on ?? null)
  const [dueTouched, setDueTouched] = useState(editing)
  const [pinned, setPinned] = useState(project?.pinned ?? false)
  const [description, setDescription] = useState(project?.description ?? "")
  const [source, setSource] = useState<ProjectSource>(defaults?.source ?? { type: "blank" })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const template = source.type === "template" ? templateByKey(source.key) : undefined
  const sourceProject = source.type === "project" ? projects.find((candidate) => candidate.id === source.id) : undefined
  const checklistDocs = docs.filter((doc) => doc.kind === "checklist" || doc.kind === "process")
  const selectableClients = clients.filter((client) => client.active || client.id === clientId)
  const owner = ownerId ? profileById.get(ownerId) : undefined

  function chooseSource(value: string) {
    const next = parseSourceValue(value)
    setSource(next)
    const nextTemplate = next.type === "template" ? templateByKey(next.key) : undefined
    // O modelo sugere o prazo (enquanto a pessoa não escolheu um).
    if (nextTemplate && !dueTouched) setDueOn(addDaysToKey(startsOn, nextTemplate.durationDays))
    if (nextTemplate && !name.trim()) {
      const client = clientId ? clients.find((candidate) => candidate.id === clientId) : undefined
      setName(client ? `${nextTemplate.name} — ${client.name}` : nextTemplate.name)
    }
  }

  function changeStart(next: DateKey | null) {
    if (!next) return
    if (template && !dueTouched) setDueOn(addDaysToKey(next, template.durationDays))
    setStartsOn(next)
  }

  function submit() {
    if (isPending) return
    if (!name.trim()) {
      setError("Dê um nome ao projeto.")
      return
    }
    if (dueOn && dueOn < startsOn) {
      setError("O prazo não pode ser antes do começo.")
      return
    }
    setError(null)
    const input = {
      name,
      client_id: clientId,
      owner_id: ownerId,
      status,
      description: description || null,
      starts_on: startsOn,
      due_on: dueOn,
      pinned,
    }
    startTransition(async () => {
      if (project) {
        const result = await updateProject(project.id, input)
        if (!result.ok) {
          setError(result.error)
          return
        }
        toast.success("Projeto salvo", { description: name.trim() })
        onDone()
        return
      }
      const result = await createProject(input, source)
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Projeto criado", {
        description:
          result.data.tasks > 0
            ? `${result.data.tasks} ${result.data.tasks === 1 ? "tarefa criada" : "tarefas criadas"}${owner ? ` para ${firstName(owner.full_name)}` : ""}.`
            : name.trim(),
      })
      onDone()
      router.push(`/projetos/${result.data.id}`)
    })
  }

  const seedCount = template ? template.tasks.length : null

  return (
    <form
      className="flex max-h-[92svh] flex-col"
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
        <p className="mb-3 text-xs font-medium text-muted-foreground">{editing ? "Editar projeto" : "Novo projeto"}</p>
        <input
          autoFocus
          value={name}
          onChange={(event) => {
            setName(event.target.value)
            if (error) setError(null)
          }}
          placeholder="Nome do projeto (ex.: Site novo da Velmont)"
          aria-label="Nome do projeto"
          maxLength={NAME_MAX}
          className="w-full bg-transparent text-lg leading-7 font-semibold tracking-tight text-foreground outline-none placeholder:font-normal placeholder:text-subtle-foreground"
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Cliente">
            <Select value={clientId ?? INTERNAL} onValueChange={(value) => setClientId(value === INTERNAL ? null : value)}>
              <SelectTrigger aria-label="Cliente" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={INTERNAL}>Interno (da própria Boop)</SelectItem>
                {selectableClients.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Responsável">
            <Select value={ownerId ?? NONE} onValueChange={(value) => setOwnerId(value === NONE ? null : value)}>
              <SelectTrigger aria-label="Responsável" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE}>Ninguém em especial</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {profile.full_name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Começa em">
            <DatePicker
              value={startsOn}
              onChange={changeStart}
              today={today}
              placeholder="Escolher"
              aria-label="Começa em"
              icon={<CalendarDays className="size-4 text-muted-foreground" />}
              renderValue={(value) => <span>{formatShortDate(value, today)}</span>}
              className="h-9 w-full justify-start border border-input px-3"
            />
          </Field>
          <Field label="Prazo de entrega">
            <DatePicker
              value={dueOn}
              onChange={(next) => {
                setDueOn(next)
                setDueTouched(true)
              }}
              today={today}
              placeholder="Sem prazo"
              clearLabel="Sem prazo"
              aria-label="Prazo de entrega"
              icon={<CalendarDays className="size-4 text-muted-foreground" />}
              renderValue={(value) => <span>{formatShortDate(value, today)}</span>}
              className="h-9 w-full justify-start border border-input px-3"
            />
          </Field>
          <Field label="Status">
            <Select
              value={status}
              onValueChange={(value) => {
                if (isProjectStatus(value)) setStatus(value)
              }}
            >
              <SelectTrigger aria-label="Status" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {PROJECT_STATUSES.filter((option) => editing || option === "planned" || option === "active").map((option) => (
                  <SelectItem key={option} value={option}>
                    {PROJECT_STATUS_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <label className="flex items-center gap-2 self-end pb-2 text-[13px] text-foreground">
            <Checkbox checked={pinned} onCheckedChange={(checked) => setPinned(checked === true)} />
            Em foco na tela Hoje e na weekly
          </label>
        </div>

        {!editing ? (
          <Field label="Tarefas iniciais" className="mt-4" htmlFor={`${ids}-source`}>
            <Select value={sourceValue(source)} onValueChange={chooseSource}>
              <SelectTrigger id={`${ids}-source`} aria-label="Tarefas iniciais" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start" className="max-h-80">
                <SelectItem value="blank">Começar sem tarefas</SelectItem>
                <SelectGroup>
                  <SelectLabel className="text-[11px] tracking-wide uppercase">Modelos da Boop</SelectLabel>
                  {PROJECT_TEMPLATES.map((option) => (
                    <SelectItem key={option.key} value={`template:${option.key}`}>
                      {option.name} · {option.tasks.length} tarefas
                    </SelectItem>
                  ))}
                </SelectGroup>
                {projects.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel className="text-[11px] tracking-wide uppercase">Repetir um projeto</SelectLabel>
                    {[...projects].sort(compareProjects).map((candidate) => (
                      <SelectItem key={candidate.id} value={`project:${candidate.id}`}>
                        {candidate.name}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
                {checklistDocs.length > 0 ? (
                  <SelectGroup>
                    <SelectLabel className="text-[11px] tracking-wide uppercase">Checklist de um processo</SelectLabel>
                    {checklistDocs.map((doc) => (
                      <SelectItem key={doc.id} value={`doc:${doc.id}`}>
                        {doc.title}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                ) : null}
              </SelectContent>
            </Select>
            <p className="text-xs leading-5 text-muted-foreground">
              {template
                ? `${template.description} ${seedCount} tarefas com prazos a partir do começo${owner ? `, para ${firstName(owner.full_name)}` : ""}.`
                : sourceProject
                  ? `Copia as tarefas de “${sourceProject.name}”, com os prazos na mesma distância do começo.`
                  : source.type === "doc"
                    ? "Cada item do checklist vira uma tarefa (sem prazo). Edite o processo para mudar o modelo."
                    : "Dá para criar as tarefas depois, dentro do projeto."}
            </p>
          </Field>
        ) : null}

        <Field label="Sobre o projeto" htmlFor={`${ids}-description`} className="mt-4">
          <Textarea
            id={`${ids}-description`}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            maxLength={DESCRIPTION_MAX}
            placeholder="Objetivo, escopo, combinados com o cliente, links…"
            className="min-h-20 resize-none text-[13px] shadow-none"
          />
        </Field>
      </div>

      <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
        <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
          {error ?? (
            <>
              <kbd className="font-sans">Ctrl</kbd> + <kbd className="font-sans">Enter</kbd> para salvar
            </>
          )}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Salvando…" : editing ? "Salvar" : "Criar projeto"}
          </Button>
        </div>
      </div>
    </form>
  )
}
