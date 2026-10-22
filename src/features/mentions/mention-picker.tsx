"use client"

import { Loader2 } from "lucide-react"
import { useEffect, useRef, useState, type KeyboardEvent, type RefObject } from "react"

import { activeMentionQuery, applyMentions, mentionLabel, type Mention, type MentionOption } from "@/features/mentions/logic"
import { MENTION_ICON } from "@/features/mentions/mention-text"
import { cn } from "@/lib/utils"

/** Busca das menções: recebe o que a pessoa digitou depois do "@" (pode ser vazio). */
export type MentionSearch = (query: string) => Promise<MentionOption[]>

const DEBOUNCE_MS = 160

/**
 * Menções no campo de escrever. Ao digitar "@" ou "/" (no começo ou depois de
 * um espaço) abre a lista; escolher um item escreve "@Título" no campo e, ao
 * enviar, `encode` troca esse texto pela marca da menção.
 */
export function useMentions({
  search,
  field,
  body,
  setBody,
}: {
  search: MentionSearch | undefined
  field: RefObject<HTMLTextAreaElement | null>
  body: string
  setBody: (value: string) => void
}) {
  const [trigger, setTrigger] = useState<{ start: number; query: string } | null>(null)
  const [dismissed, setDismissed] = useState<number | null>(null)
  const [results, setResults] = useState<{ query: string; options: MentionOption[] } | null>(null)
  const [active, setActive] = useState(0)
  const picked = useRef<Mention[]>([])
  const request = useRef(0)
  // A busca vem de fora (às vezes recriada a cada render): a lista só busca de novo quando o texto muda.
  const searchRef = useRef(search)
  useEffect(() => {
    searchRef.current = search
  })

  const open = Boolean(search && trigger && trigger.start !== dismissed)
  const query = trigger?.query ?? ""

  useEffect(() => {
    if (!open) return
    const id = ++request.current
    const timer = window.setTimeout(() => {
      const run = searchRef.current
      if (!run) return
      void run(query)
        .then((options) => {
          if (id === request.current) setResults({ query, options })
        })
        .catch(() => {
          if (id === request.current) setResults({ query, options: [] })
        })
    }, DEBOUNCE_MS)
    return () => window.clearTimeout(timer)
  }, [open, query])

  /** Confere se o cursor está numa menção sendo digitada (depois de cada mudança ou clique). */
  function sync(text: string, caret: number | null) {
    if (!search) return
    const next = caret === null ? null : activeMentionQuery(text.slice(0, caret))
    setTrigger((current) => {
      if (current && next && current.start === next.start && current.query === next.query) return current
      return next
    })
    if (!next || next.start !== trigger?.start) setActive(0)
    if (dismissed !== null && next?.start !== dismissed) setDismissed(null)
  }

  const options = results && results.query === query ? results.options : null
  const activeIndex = options && options.length > 0 ? Math.min(active, options.length - 1) : -1

  function pick(option: MentionOption) {
    const input = field.current
    if (!trigger || !input) return
    const caret = input.selectionStart ?? body.length
    const visible = `@${mentionLabel(option.label)} `
    const next = body.slice(0, trigger.start) + visible + body.slice(caret)
    picked.current = [...picked.current, { kind: option.kind, id: option.id, label: option.label }]
    setBody(next)
    setTrigger(null)
    setResults(null)
    const position = trigger.start + visible.length
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(position, position)
    })
  }

  /** Teclas da lista (setas, Enter, Tab, Esc). Devolve true quando a tecla foi usada. */
  function onKeyDown(event: KeyboardEvent<HTMLTextAreaElement>): boolean {
    if (!open || !trigger) return false
    if (event.key === "Escape") {
      event.preventDefault()
      setDismissed(trigger.start)
      return true
    }
    if (!options || options.length === 0) return false
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      event.preventDefault()
      const delta = event.key === "ArrowDown" ? 1 : -1
      setActive((activeIndex + delta + options.length) % options.length)
      return true
    }
    if ((event.key === "Enter" || event.key === "Tab") && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault()
      const option = options[activeIndex]
      if (option) pick(option)
      return true
    }
    return false
  }

  /** Começa uma menção pelo botão: escreve o "@" onde está o cursor. */
  function start() {
    const input = field.current
    if (!input) return
    const caret = input.selectionStart ?? body.length
    const before = body.slice(0, caret)
    const insert = before && !/\s$/.test(before) ? " @" : "@"
    const next = before + insert + body.slice(caret)
    setBody(next)
    const position = caret + insert.length
    setTrigger({ start: position - 1, query: "" })
    setDismissed(null)
    requestAnimationFrame(() => {
      input.focus()
      input.setSelectionRange(position, position)
    })
  }

  return {
    enabled: Boolean(search),
    open,
    query,
    options,
    activeIndex,
    setActive,
    pick,
    sync,
    onKeyDown,
    start,
    close: () => setTrigger(null),
    /** O texto para enviar, com as marcas das menções escolhidas. */
    encode: (text: string) => applyMentions(text, picked.current),
    /** Depois de enviar: esquece as menções escolhidas. */
    reset: () => {
      picked.current = []
    },
  }
}

export type MentionsState = ReturnType<typeof useMentions>

/** A lista de sugestões, acima do campo. */
export function MentionList({ mentions, className }: { mentions: MentionsState; className?: string }) {
  const listRef = useRef<HTMLUListElement>(null)
  const { options, activeIndex, query } = mentions

  useEffect(() => {
    listRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView({ block: "nearest" })
  }, [activeIndex])

  if (!mentions.open) return null

  return (
    <div
      className={cn(
        "absolute right-0 bottom-full left-0 z-30 mb-2 overflow-hidden rounded-xl border bg-popover text-popover-foreground shadow-lg",
        className
      )}
    >
      <p className="border-b px-3 py-1.5 text-[11px] text-muted-foreground">
        {query ? (
          <>
            Mencionar <span className="font-medium text-foreground">“{query}”</span>
          </>
        ) : (
          "Mencionar um post, reunião ou outro item: digite para buscar"
        )}
      </p>
      {options === null ? (
        <p className="flex items-center gap-2 px-3 py-3 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          Buscando…
        </p>
      ) : options.length === 0 ? (
        <p className="px-3 py-3 text-xs text-muted-foreground">
          {query.length === 1 ? "Digite mais uma letra para buscar." : "Nada encontrado. Esc fecha."}
        </p>
      ) : (
        <ul ref={listRef} role="listbox" aria-label="Itens para mencionar" className="max-h-64 overflow-y-auto overscroll-contain py-1">
          {options.map((option, index) => {
            const Icon = MENTION_ICON[option.kind]
            const header = index === 0 || options[index - 1]!.group !== option.group ? option.group : null
            return (
              <li key={`${option.kind}-${option.id}`} role="presentation">
                {header ? <p className="px-3 pt-2 pb-1 text-[10.5px] font-semibold tracking-wide text-subtle-foreground uppercase">{header}</p> : null}
                <button
                  type="button"
                  role="option"
                  aria-selected={index === activeIndex}
                  // Tocar na opção não tira o cursor do campo.
                  onMouseDown={(event) => event.preventDefault()}
                  onMouseEnter={() => mentions.setActive(index)}
                  onClick={() => mentions.pick(option)}
                  className={cn(
                    "flex w-full items-center gap-2.5 px-3 py-1.5 text-left outline-none",
                    index === activeIndex ? "bg-muted" : "hover:bg-muted/60"
                  )}
                >
                  <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] text-foreground">{option.label}</span>
                    {option.detail ? <span className="block truncate text-[11.5px] text-muted-foreground">{option.detail}</span> : null}
                  </span>
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
