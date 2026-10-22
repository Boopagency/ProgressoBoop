"use client"

import { Check, PencilLine } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
import { reviewPortalPost } from "@/features/portal/content-actions"
import { MESSAGE_MAX } from "@/features/portal/content-logic"
import { reviewPortalStep } from "@/features/portal/project-actions"
import type { ActionResult } from "@/lib/types"
import { cn } from "@/lib/utils"

type Decision = "approve" | "changes"

interface DecisionCopy {
  title: string
  description: string
  label: string
  placeholder: string
  submit: string
  done: string
}

const COPY: Record<Decision, DecisionCopy> = {
  approve: {
    title: "Aprovar este post?",
    description: "A equipe segue com a publicação na data combinada.",
    label: "Comentário (opcional)",
    placeholder: "Ex.: Ficou ótimo!",
    submit: "Aprovar",
    done: "Post aprovado. Obrigado!",
  },
  changes: {
    title: "Pedir ajuste",
    description: "Conte o que precisa mudar. O pedido vai para a equipe e o post volta para você depois do ajuste.",
    label: "O que mudar",
    placeholder: "Ex.: Trocar a foto do segundo slide e deixar o título maior.",
    submit: "Enviar pedido",
    done: "Pedido enviado para a equipe.",
  },
}

const STEP_COPY: Record<Decision, DecisionCopy> = {
  approve: {
    title: "Aprovar esta etapa?",
    description: "A equipe segue para as próximas etapas do projeto.",
    label: "Comentário (opcional)",
    placeholder: "Ex.: Perfeito, pode seguir!",
    submit: "Aprovar",
    done: "Etapa aprovada. Obrigado!",
  },
  changes: {
    title: "Pedir ajustes",
    description: "Conte o que precisa mudar. A equipe faz os ajustes e a etapa volta para você aprovar.",
    label: "O que ajustar",
    placeholder: "Ex.: Trocar a foto do topo e aumentar o texto do botão.",
    submit: "Enviar pedido",
    done: "Pedido enviado para a equipe.",
  },
}

/** Tamanho máximo da nota da etapa (o banco confere o mesmo). */
const STEP_NOTE_MAX = 4000

/** Resposta do cliente a um post "com o cliente": aprovar ou pedir ajuste (com o que mudar). */
export function ReviewPanel({ postId }: { postId: string }) {
  const [decision, setDecision] = useState<Decision | null>(null)
  const [dialogKey, setDialogKey] = useState(0)

  function open(next: Decision) {
    setDialogKey((key) => key + 1)
    setDecision(next)
  }

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 sm:flex-row sm:items-center">
      <p className="flex-1 text-[13px] leading-5 text-foreground">
        Este post está esperando a sua resposta. Aprove ou conte o que precisa mudar.
      </p>
      {/* No celular, os botões ficam numa barra fixa embaixo, como num app. */}
      <div
        className={cn(
          "flex gap-2",
          "max-md:fixed max-md:inset-x-0 max-md:bottom-[var(--app-bottom-bar,0px)] max-md:z-30 max-md:border-t max-md:bg-background/95 max-md:px-4 max-md:pt-3 max-md:pb-[max(0.75rem,env(safe-area-inset-bottom))] max-md:backdrop-blur"
        )}
      >
        <Button type="button" variant="outline" size="sm" onClick={() => open("changes")} className="flex-1 max-md:h-11 md:flex-none">
          <PencilLine />
          Pedir ajuste
        </Button>
        <Button type="button" size="sm" onClick={() => open("approve")} className="flex-1 max-md:h-11 md:flex-none">
          <Check />
          Aprovar
        </Button>
      </div>
      <DecisionDialog
        key={dialogKey}
        copy={COPY}
        maxLength={MESSAGE_MAX}
        onSubmit={(next, note) => reviewPortalPost(postId, { decision: next, note })}
        decision={decision}
        onOpenChange={(value) => (value ? null : setDecision(null))}
      />
    </div>
  )
}

/**
 * Resposta do cliente a uma etapa do projeto que espera a aprovação dele:
 * os botões ficam na própria etapa, e o diálogo é o mesmo do post.
 */
export function StepReviewButtons({ stepId }: { stepId: string }) {
  const [decision, setDecision] = useState<Decision | null>(null)
  const [dialogKey, setDialogKey] = useState(0)

  function open(next: Decision) {
    setDialogKey((key) => key + 1)
    setDecision(next)
  }

  return (
    <div className="mt-2 flex flex-wrap gap-2">
      <Button type="button" size="sm" onClick={() => open("approve")} className="h-8">
        <Check />
        Aprovar
      </Button>
      <Button type="button" variant="outline" size="sm" onClick={() => open("changes")} className="h-8">
        <PencilLine />
        Pedir ajustes
      </Button>
      <DecisionDialog
        key={dialogKey}
        copy={STEP_COPY}
        maxLength={STEP_NOTE_MAX}
        onSubmit={(next, note) => reviewPortalStep(stepId, { decision: next, note })}
        decision={decision}
        onOpenChange={(value) => (value ? null : setDecision(null))}
      />
    </div>
  )
}

function DecisionDialog({
  copy: copies,
  maxLength,
  onSubmit,
  decision,
  onOpenChange,
}: {
  copy: Record<Decision, DecisionCopy>
  maxLength: number
  onSubmit: (decision: Decision, note: string) => Promise<ActionResult>
  decision: Decision | null
  onOpenChange: (open: boolean) => void
}) {
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const copy = copies[decision ?? "approve"]
  const needsNote = decision === "changes"

  function submit() {
    if (!decision) return
    setError(null)
    startTransition(async () => {
      const result = await onSubmit(decision, note)
      if (!result.ok) {
        setError(result.error)
        return
      }
      onOpenChange(false)
      toast.success(copy.done)
    })
  }

  return (
    <Dialog open={decision !== null} onOpenChange={(value) => (isPending ? null : onOpenChange(value))}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{copy.title}</DialogTitle>
          <DialogDescription>{copy.description}</DialogDescription>
        </DialogHeader>
        <form
          id="resposta-cliente"
          className="space-y-1.5"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Label htmlFor="resposta-nota">{copy.label}</Label>
          <Textarea
            id="resposta-nota"
            value={note}
            onChange={(event) => setNote(event.target.value)}
            placeholder={copy.placeholder}
            maxLength={maxLength}
            rows={needsNote ? 5 : 3}
            autoFocus={needsNote}
            required={needsNote}
            aria-invalid={error ? true : undefined}
          />
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="resposta-cliente" disabled={isPending || (needsNote && !note.trim())}>
            {isPending ? "Enviando…" : copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
