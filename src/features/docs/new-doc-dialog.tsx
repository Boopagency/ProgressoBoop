"use client"

import { Building2, FileText, Tag } from "lucide-react"
import { useRouter } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { SegmentedControl } from "@/components/segmented-control"
import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { createDoc } from "@/features/docs/actions"
import { CLIENT_TEMPLATE_ICON, DOC_KIND_ICON } from "@/features/docs/doc-meta"
import {
  CLIENT_TEMPLATES,
  clientDocTitle,
  GENERAL_TEMPLATES,
  templateById,
  type TemplateId,
} from "@/features/docs/templates"
import { TITLE_MAX } from "@/features/docs/validation"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { todayKey } from "@/lib/dates"
import { TASK_AREA_LABEL, TASK_AREAS, isTaskArea } from "@/lib/labels"
import type { TaskArea } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface NewDocDefaults {
  area?: TaskArea | null
  client_id?: string | null
  /** Modelo já escolhido (ex.: os atalhos de documento na página do cliente). */
  template?: TemplateId
}

type TemplateGroup = "general" | "client"

const GROUP_OPTIONS: { value: TemplateGroup; label: string }[] = [
  { value: "general", label: "Gerais" },
  { value: "client", label: "Do cliente" },
]

const FIRST_CLIENT_TEMPLATE: TemplateId = CLIENT_TEMPLATES[0]?.id ?? "guide"

export interface NewDocDialogState {
  open: boolean
  /** Muda a cada abertura, para o formulário começar limpo. */
  key: number
  defaults?: NewDocDefaults
}

const NONE = "none"
const CHIP =
  "h-8 rounded-md border border-input bg-background px-2.5 text-[13px] shadow-none hover:bg-accent"

/** "Novo documento": título, modelo, área e cliente. Abre o documento criado. */
export function NewDocDialog({
  state,
  onOpenChange,
}: {
  state: NewDocDialogState
  onOpenChange: (open: boolean) => void
}) {
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[5%] max-h-[90svh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[10%] sm:max-w-[640px]"
      >
        <DialogTitle className="sr-only">Novo documento</DialogTitle>
        <DialogDescription className="sr-only">
          Escolha um título e um modelo para começar. Área e cliente são opcionais, menos nos modelos do cliente.
        </DialogDescription>
        <NewDocForm key={state.key} defaults={state.defaults ?? {}} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function NewDocForm({ defaults, onCancel }: { defaults: NewDocDefaults; onCancel: () => void }) {
  const router = useRouter()
  const { clients, clientById } = useWorkspace()
  const [today] = useState(() => todayKey())
  // Com um cliente escolhido de antemão, os modelos do cliente vêm primeiro.
  const [template, setTemplate] = useState<TemplateId>(
    () => defaults.template ?? (defaults.client_id ? FIRST_CLIENT_TEMPLATE : "process")
  )
  const [group, setGroup] = useState<TemplateGroup>(() => (templateById(template)?.client ? "client" : "general"))
  const [area, setArea] = useState<TaskArea | null>(defaults.area ?? null)
  const [clientId, setClientId] = useState<string | null>(defaults.client_id ?? null)
  // Título sugerido nos modelos do cliente ("Estudo de persona — Cliente"),
  // trocado junto com o modelo e o cliente enquanto a pessoa não escrever o seu.
  const [title, setTitle] = useState(() => suggestedTitle(template, clientId))
  const [autoTitle, setAutoTitle] = useState(title)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const options = group === "client" ? CLIENT_TEMPLATES : GENERAL_TEMPLATES

  function suggestedTitle(templateId: TemplateId, client: string | null): string {
    const chosen = templateById(templateId)
    const name = client ? clientById.get(client)?.name : undefined
    return chosen?.client && name ? clientDocTitle(chosen, name, today) : ""
  }

  function refreshTitle(templateId: TemplateId, client: string | null) {
    if (title.trim() && title !== autoTitle) return
    const next = suggestedTitle(templateId, client)
    setTitle(next)
    setAutoTitle(next)
  }

  function chooseTemplate(next: TemplateId) {
    setTemplate(next)
    if (templateById(next)?.client && area === null) setArea("clients")
    refreshTitle(next, clientId)
    if (error) setError(null)
  }

  function chooseGroup(next: TemplateGroup) {
    setGroup(next)
    const first = (next === "client" ? CLIENT_TEMPLATES : GENERAL_TEMPLATES)[0]
    if (first && templateById(template)?.client !== (next === "client")) chooseTemplate(first.id)
  }

  function chooseClient(next: string | null) {
    setClientId(next)
    refreshTitle(template, next)
    if (error) setError(null)
  }

  function submit() {
    if (isPending) return
    if (!title.trim()) {
      setError("Dê um título ao documento.")
      return
    }
    if (templateById(template)?.client && !clientId) {
      setError("Escolha o cliente deste documento.")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await createDoc({ title, template, area, client_id: clientId })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Documento criado", { description: title.trim() })
      router.push(`/processos/${result.data.id}`)
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
      <div className="min-h-0 overflow-y-auto">
        <div className="px-5 pt-5">
          <p className="mb-3 text-xs font-medium text-muted-foreground">Novo documento</p>
          <input
            autoFocus
            value={title}
            onChange={(event) => {
              setTitle(event.target.value)
              if (error) setError(null)
            }}
            placeholder={group === "client" ? "Ex.: Estudo de persona — Cliente" : "Ex.: Como fazemos o relatório mensal"}
            aria-label="Título"
            aria-invalid={error ? true : undefined}
            maxLength={TITLE_MAX}
            className="w-full bg-transparent font-display text-lg leading-7 font-semibold tracking-tight text-foreground outline-none placeholder:font-sans placeholder:font-normal placeholder:text-subtle-foreground"
          />
        </div>

        <div className="px-5 pt-4">
          <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
            <p aria-hidden="true" className="text-xs font-medium text-muted-foreground">
              Começar com
            </p>
            <SegmentedControl aria-label="Modelos" value={group} onValueChange={chooseGroup} options={GROUP_OPTIONS} />
          </div>
          <fieldset>
            <legend className="sr-only">Começar com</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {options.map((option) => {
                const Icon = CLIENT_TEMPLATE_ICON[option.id] ?? (option.id === "blank" ? FileText : DOC_KIND_ICON[option.kind])
                const selected = template === option.id
                return (
                  <label
                    key={option.id}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40",
                      selected ? "border-brand bg-brand-soft/40" : "hover:bg-muted/60"
                    )}
                  >
                    <input
                      type="radio"
                      name="modelo"
                      value={option.id}
                      checked={selected}
                      onChange={() => chooseTemplate(option.id)}
                      className="sr-only"
                    />
                    <Icon
                      className={cn("mt-0.5 size-4 shrink-0", selected ? "text-brand-ink" : "text-muted-foreground")}
                      aria-hidden="true"
                    />
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">{option.label}</span>
                      <span className="mt-0.5 block text-xs leading-snug text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </label>
                )
              })}
            </div>
          </fieldset>
        </div>

        <div className="flex flex-wrap items-center gap-2 px-5 pt-4 pb-5">
          <Select value={area ?? NONE} onValueChange={(value) => setArea(isTaskArea(value) ? value : null)}>
            <SelectTrigger size="sm" aria-label="Área" className={cn(CHIP, "gap-1.5 [&>svg:last-child]:hidden")}>
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
          <Select value={clientId ?? NONE} onValueChange={(value) => chooseClient(value === NONE ? null : value)}>
            <SelectTrigger size="sm" aria-label="Cliente" className={cn(CHIP, "gap-1.5 [&>svg:last-child]:hidden")}>
              <Building2 className="size-3.5" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value={NONE} className="text-muted-foreground">
                {group === "client" ? "Cliente" : "Cliente (opcional)"}
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
      </div>

      <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
        <p className={cn("text-xs", error ? "text-destructive" : "text-muted-foreground")} role={error ? "alert" : undefined}>
          {error ?? "Começa como rascunho. Dá para mudar tudo depois."}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onCancel}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Criando…" : "Criar documento"}
          </Button>
        </div>
      </div>
    </form>
  )
}
