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

type Decision = "approve" | "changes"

const COPY: Record<Decision, { title: string; description: string; label: string; placeholder: string; submit: string; done: string }> = {
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
      <div className="flex gap-2">
        <Button type="button" variant="outline" size="sm" onClick={() => open("changes")} className="flex-1 sm:flex-none">
          <PencilLine />
          Pedir ajuste
        </Button>
        <Button type="button" size="sm" onClick={() => open("approve")} className="flex-1 sm:flex-none">
          <Check />
          Aprovar
        </Button>
      </div>
      <DecisionDialog
        key={dialogKey}
        postId={postId}
        decision={decision}
        onOpenChange={(value) => (value ? null : setDecision(null))}
      />
    </div>
  )
}

function DecisionDialog({
  postId,
  decision,
  onOpenChange,
}: {
  postId: string
  decision: Decision | null
  onOpenChange: (open: boolean) => void
}) {
  const [note, setNote] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const copy = COPY[decision ?? "approve"]
  const needsNote = decision === "changes"

  function submit() {
    if (!decision) return
    setError(null)
    startTransition(async () => {
      const result = await reviewPortalPost(postId, { decision, note })
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
          id="resposta-post"
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
            maxLength={MESSAGE_MAX}
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
          <Button type="submit" form="resposta-post" disabled={isPending || (needsNote && !note.trim())}>
            {isPending ? "Enviando…" : copy.submit}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
