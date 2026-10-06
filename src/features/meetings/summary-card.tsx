"use client"

import { useEffect, useRef, useState } from "react"
import { toast } from "sonner"

import { saveMeetingText } from "@/features/meetings/actions"
import { SUMMARY_MAX } from "@/features/meetings/validation"
import { cn } from "@/lib/utils"

type SaveState = "idle" | "dirty" | "saving" | "saved" | "error"

const SAVE_LABEL: Record<SaveState, string> = {
  idle: "",
  dirty: "Alterações não salvas",
  saving: "Salvando…",
  saved: "Salvo",
  error: "Não foi salvo",
}

/** Avisa antes de fechar a aba com texto ainda não salvo. */
export function useUnsavedWarning(unsaved: boolean) {
  useEffect(() => {
    if (!unsaved) return
    const warn = (event: BeforeUnloadEvent) => event.preventDefault()
    window.addEventListener("beforeunload", warn)
    return () => window.removeEventListener("beforeunload", warn)
  }, [unsaved])
}

/** Resumo livre da reunião. Salva sozinho um pouco depois de parar de digitar. */
export function SummaryCard({ meetingId, initial }: { meetingId: string; initial: string | null }) {
  const [value, setValue] = useState(initial ?? "")
  const [state, setState] = useState<SaveState>("idle")
  const saved = useRef(initial ?? "")
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useUnsavedWarning(state === "dirty" || state === "saving" || state === "error")

  function save(next: string) {
    if (timer.current) clearTimeout(timer.current)
    if (next.trim() === saved.current.trim()) {
      setState((current) => (current === "dirty" ? "saved" : current))
      return
    }
    setState("saving")
    void saveMeetingText(meetingId, "summary", next).then((result) => {
      if (result.ok) {
        saved.current = next
        setState("saved")
      } else {
        setState("error")
        toast.error(result.error)
      }
    })
  }

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    []
  )

  return (
    <section aria-labelledby="resumo-titulo" className="overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-3.5">
        <h2 id="resumo-titulo" className="text-sm font-semibold text-foreground">
          Resumo
        </h2>
        <span
          aria-live="polite"
          className={cn(
            "ml-auto text-xs text-muted-foreground",
            state === "error" && "text-destructive"
          )}
        >
          {SAVE_LABEL[state]}
        </span>
      </header>
      <textarea
        value={value}
        maxLength={SUMMARY_MAX}
        onChange={(event) => {
          const next = event.target.value
          setValue(next)
          setState("dirty")
          if (timer.current) clearTimeout(timer.current)
          timer.current = setTimeout(() => save(next), 1200)
        }}
        onBlur={() => save(value)}
        placeholder="Principais pontos, decisões e contexto (opcional)."
        aria-label="Resumo da reunião"
        className="field-sizing-content block min-h-28 w-full resize-none bg-transparent px-4 py-3 text-sm leading-6 text-foreground outline-none placeholder:text-subtle-foreground focus-visible:bg-muted/20"
      />
    </section>
  )
}
