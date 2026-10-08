"use client"

import { Loader2 } from "lucide-react"
import { useLayoutEffect, useRef, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import type { ThreadDay, ThreadItem } from "@/features/channels/logic"
import { cn } from "@/lib/utils"

/** Perto do fim (em px): uma mensagem nova rola o fio até ela. */
const STICK_DISTANCE = 96

/**
 * Fio rolável, por dia, do mais antigo (em cima) para o mais novo. Fica no
 * fim enquanto a pessoa está no fim; se ela subiu para ler, não pula.
 */
export function ThreadView({
  days,
  loaded,
  error,
  hasMore,
  onLoadOlder,
  empty,
  renderItem,
  scrollToEndKey,
  className,
}: {
  days: ThreadDay[]
  loaded: boolean
  error: string | null
  hasMore: boolean
  onLoadOlder: () => Promise<void>
  empty: ReactNode
  renderItem: (item: ThreadItem) => ReactNode
  /** Muda quando a própria pessoa envia: rola até o fim mesmo se ela tinha subido. */
  scrollToEndKey?: number
  className?: string
}) {
  const scroller = useRef<HTMLDivElement>(null)
  const atEnd = useRef(true)
  const [loadingOlder, setLoadingOlder] = useState(false)
  const lastDay = days[days.length - 1]
  const lastKey = lastDay?.items[lastDay.items.length - 1]?.key ?? null

  useLayoutEffect(() => {
    const element = scroller.current
    if (element && atEnd.current) element.scrollTop = element.scrollHeight
  }, [lastKey, loaded])

  useLayoutEffect(() => {
    const element = scroller.current
    if (!element || scrollToEndKey === undefined) return
    atEnd.current = true
    element.scrollTop = element.scrollHeight
  }, [scrollToEndKey])

  async function loadOlder() {
    const element = scroller.current
    const fromEnd = element ? element.scrollHeight - element.scrollTop : 0
    setLoadingOlder(true)
    await onLoadOlder()
    setLoadingOlder(false)
    // Mantém na tela a mensagem que a pessoa estava vendo.
    requestAnimationFrame(() => {
      if (element) element.scrollTop = element.scrollHeight - fromEnd
    })
  }

  return (
    <div
      ref={scroller}
      onScroll={(event) => {
        const element = event.currentTarget
        atEnd.current = element.scrollHeight - element.scrollTop - element.clientHeight < STICK_DISTANCE
      }}
      className={cn("min-h-0 flex-1 overflow-y-auto overscroll-contain", className)}
      role="log"
      aria-live="polite"
      aria-relevant="additions"
    >
      {!loaded ? (
        <p className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
          {error ? (
            error
          ) : (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              Carregando as mensagens…
            </>
          )}
        </p>
      ) : days.length === 0 ? (
        empty
      ) : (
        <div className="pb-4">
          {hasMore ? (
            <div className="flex justify-center pt-3">
              <Button type="button" variant="ghost" size="sm" className="h-7 text-xs" disabled={loadingOlder} onClick={() => void loadOlder()}>
                {loadingOlder ? "Carregando…" : "Ver mensagens anteriores"}
              </Button>
            </div>
          ) : null}
          {days.map((day) => (
            <section key={day.day} aria-label={day.label}>
              <div role="separator" className="sticky top-0 z-10 flex justify-center py-2">
                <span className="rounded-full border bg-background px-2.5 py-0.5 text-[11px] font-medium text-muted-foreground shadow-xs">
                  {day.label}
                </span>
              </div>
              <ul>{day.items.map((item) => renderItem(item))}</ul>
            </section>
          ))}
          {error ? <p className="px-4 pt-2 text-center text-xs text-warning-ink">{error}</p> : null}
        </div>
      )}
    </div>
  )
}
