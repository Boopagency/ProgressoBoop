"use client"

import { ChevronDown, ChevronUp, ClipboardCopy, FileText, Pencil, Search, X } from "lucide-react"
import { useEffect, useRef, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { saveMeetingText } from "@/features/meetings/actions"
import { useUnsavedWarning } from "@/features/meetings/summary-card"
import { TRANSCRIPT_MAX } from "@/features/meetings/validation"
import { countWords, findMatches } from "@/lib/text"
import { cn } from "@/lib/utils"

/** "Renatha:", "Speaker 1 (00:03:12):", "[00:03] Léo:" — quem fala, no começo da linha. */
const SPEAKER = /^(\s*(?:\[?\d{1,2}:\d{2}(?::\d{2})?\]?\s*)?[A-Za-zÀ-ÿ][\w À-ÿ.'-]{0,40}?(?:\s*\(\d{1,2}:\d{2}(?::\d{2})?\))?:)(?=\s)/

const COLLAPSED_LINES = 14

/**
 * Transcrição colada da reunião. Fica recolhida, com busca (sem acento) que
 * destaca e navega pelos trechos encontrados.
 */
export function TranscriptCard({ meetingId, initial }: { meetingId: string; initial: string | null }) {
  const [text, setText] = useState(initial ?? "")
  const [draft, setDraft] = useState(initial ?? "")
  const [editing, setEditing] = useState(!initial)
  const [isSaving, startSaving] = useTransition()

  useUnsavedWarning(editing && draft.trim() !== text.trim())

  function save() {
    const next = draft.replace(/\r\n?/g, "\n").trim()
    startSaving(async () => {
      const result = await saveMeetingText(meetingId, "transcript", next || null)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setText(next)
      setDraft(next)
      setEditing(next === "")
      toast.success(next ? "Transcrição salva" : "Transcrição removida")
    })
  }

  return (
    <section aria-labelledby="transcricao-titulo" className="overflow-hidden rounded-xl border bg-card">
      <header className="flex flex-wrap items-center gap-x-2 gap-y-1 border-b px-4 py-3.5">
        <h2 id="transcricao-titulo" className="text-sm font-semibold text-foreground">
          Transcrição
        </h2>
        {text ? (
          <span className="text-xs text-muted-foreground tabular-nums">
            {countWords(text).toLocaleString("pt-BR")} palavras
          </span>
        ) : null}
        {text && !editing ? (
          <div className="ml-auto flex items-center gap-1">
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground"
              onClick={() => {
                void navigator.clipboard.writeText(text).then(
                  () => toast.success("Transcrição copiada"),
                  () => toast.error("Não foi possível copiar.")
                )
              }}
            >
              <ClipboardCopy />
              Copiar
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-7 px-2 text-muted-foreground"
              onClick={() => {
                setDraft(text)
                setEditing(true)
              }}
            >
              <Pencil />
              Editar
            </Button>
          </div>
        ) : null}
      </header>

      {editing ? (
        <div className="p-4">
          <textarea
            autoFocus={Boolean(text)}
            value={draft}
            maxLength={TRANSCRIPT_MAX}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Cole aqui a transcrição da reunião (Ctrl+V). O texto fica guardado e dá para buscar nele depois."
            aria-label="Transcrição da reunião"
            className="block min-h-48 w-full resize-y rounded-lg border border-dashed border-input bg-muted/30 px-3 py-2.5 text-sm leading-6 text-foreground outline-none placeholder:text-subtle-foreground focus-visible:border-solid focus-visible:border-ring focus-visible:bg-background focus-visible:ring-[3px] focus-visible:ring-ring/30 sm:min-h-64"
            style={{ maxHeight: "60vh" }}
          />
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground tabular-nums">
              {draft.length > 0
                ? `${countWords(draft).toLocaleString("pt-BR")} palavras · ${draft.length.toLocaleString("pt-BR")} de ${TRANSCRIPT_MAX.toLocaleString("pt-BR")} caracteres`
                : "Funciona com o texto de qualquer ferramenta de transcrição."}
            </p>
            <div className="flex gap-2">
              {text ? (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => {
                    setDraft(text)
                    setEditing(false)
                  }}
                >
                  Cancelar
                </Button>
              ) : null}
              <Button
                size="sm"
                onClick={save}
                disabled={isSaving || draft.trim() === text.trim()}
              >
                {isSaving ? "Salvando…" : "Salvar transcrição"}
              </Button>
            </div>
          </div>
        </div>
      ) : (
        <TranscriptReader text={text} />
      )}
    </section>
  )
}

function TranscriptReader({ text }: { text: string }) {
  const [query, setQuery] = useState("")
  const [active, setActive] = useState(0)
  const [expanded, setExpanded] = useState(false)
  const activeRef = useRef<HTMLElement | null>(null)

  const lines = text.split("\n")
  const searching = query.trim().length > 0
  const lineMatches = searching ? lines.map((line) => findMatches(line, query)) : []
  const total = lineMatches.reduce((sum, matches) => sum + matches.length, 0)
  const current = total === 0 ? 0 : Math.min(active, total - 1)
  const showAll = expanded || searching
  const collapsible = lines.length > COLLAPSED_LINES

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: "center", behavior: "smooth" })
  }, [current, query])

  function step(direction: 1 | -1) {
    if (total === 0) return
    setActive((current + direction + total) % total)
  }

  // Número do primeiro trecho encontrado em cada linha (para navegar entre eles).
  const firstMatchOfLine: number[] = []
  let running = 0
  for (const matches of lineMatches) {
    firstMatchOfLine.push(running)
    running += matches.length
  }
  const visibleLines = showAll ? lines : lines.slice(0, COLLAPSED_LINES)

  return (
    <div>
      <div className="flex items-center gap-2 border-b px-4 py-2">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
          }}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault()
              step(event.shiftKey ? -1 : 1)
            }
            if (event.key === "Escape") setQuery("")
          }}
          placeholder="Buscar na transcrição…"
          aria-label="Buscar na transcrição"
          className="h-8 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-subtle-foreground [&::-webkit-search-cancel-button]:hidden"
        />
        {searching ? (
          <>
            <span className="shrink-0 text-xs text-muted-foreground tabular-nums" aria-live="polite">
              {total === 0 ? "Nada encontrado" : `${current + 1} de ${total}`}
            </span>
            <Button variant="ghost" size="icon-sm" className="size-7" aria-label="Trecho anterior" disabled={total === 0} onClick={() => step(-1)}>
              <ChevronUp />
            </Button>
            <Button variant="ghost" size="icon-sm" className="size-7" aria-label="Próximo trecho" disabled={total === 0} onClick={() => step(1)}>
              <ChevronDown />
            </Button>
            <Button variant="ghost" size="icon-sm" className="size-7" aria-label="Limpar busca" onClick={() => setQuery("")}>
              <X />
            </Button>
          </>
        ) : null}
      </div>

      <div
        className={cn(
          "relative px-4 py-3 text-sm leading-6 text-foreground",
          showAll && "max-h-[70vh] overflow-y-auto"
        )}
      >
        {visibleLines.map((line, lineIndex) => {
          const matches = lineMatches[lineIndex] ?? []
          const speaker = SPEAKER.exec(line)?.[1]
          const parts: ReactNode[] = []
          let cursor = 0
          const pushText = (start: number, end: number) => {
            if (end <= start) return
            // Nome de quem fala em destaque, sem quebrar os trechos encontrados.
            const speakerEnd = speaker ? speaker.length : 0
            if (start < speakerEnd) {
              const cut = Math.min(end, speakerEnd)
              parts.push(
                <span key={`s${start}`} className="font-medium text-foreground">
                  {line.slice(start, cut)}
                </span>
              )
              start = cut
            }
            if (end > start) parts.push(line.slice(start, end))
          }
          matches.forEach((match, matchIndex) => {
            pushText(cursor, match.start)
            const index = (firstMatchOfLine[lineIndex] ?? 0) + matchIndex
            parts.push(
              <mark
                key={`m${match.start}`}
                ref={index === current ? activeRef : undefined}
                className={cn(
                  "rounded-sm px-0.5 text-foreground",
                  index === current ? "bg-brand ring-2 ring-brand/40" : "bg-brand-sky/80"
                )}
              >
                {line.slice(match.start, match.end)}
              </mark>
            )
            cursor = match.end
          })
          pushText(cursor, line.length)
          return (
            <p key={lineIndex} className={cn("min-h-6 break-words whitespace-pre-wrap", speaker && "mt-2 first:mt-0")}>
              {parts.length > 0 ? parts : " "}
            </p>
          )
        })}
        {!showAll && collapsible ? (
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 bottom-0 h-16 bg-gradient-to-t from-card to-transparent"
          />
        ) : null}
      </div>

      {collapsible && !searching ? (
        <div className="border-t px-4 py-2">
          <Button
            variant="ghost"
            size="sm"
            className="h-7 px-2 text-muted-foreground"
            onClick={() => setExpanded((current) => !current)}
          >
            <FileText />
            {expanded ? "Recolher" : `Mostrar tudo (${lines.length.toLocaleString("pt-BR")} linhas)`}
          </Button>
        </div>
      ) : null}
    </div>
  )
}
