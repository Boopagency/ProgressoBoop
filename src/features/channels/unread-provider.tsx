"use client"

import { createContext, use, useEffect, useState, type ReactNode } from "react"

import { loadChannelTotals } from "@/features/channels/actions"
import { UNREAD_POLL_MS } from "@/features/channels/logic"

interface Totals {
  unread: number
  pending: number
}

interface UnreadContextValue extends Totals {
  /** Pergunta de novo (ex.: depois de ler um canal). */
  refresh: () => void
}

const UnreadContext = createContext<UnreadContextValue | null>(null)

/**
 * Não lidas e pedidos pendentes de todos os canais, para a barra lateral.
 * Vem do servidor com a página e é atualizado de tempos em tempos (sem
 * Realtime), com a aba visível.
 */
export function UnreadProvider({ initial, children }: { initial: Totals; children: ReactNode }) {
  const [totals, setTotals] = useState<Totals>(initial)
  const [synced, setSynced] = useState<Totals>(initial)

  // A página recarregou (ex.: depois de uma ação): vale o que o servidor mandou.
  if (initial.unread !== synced.unread || initial.pending !== synced.pending) {
    setSynced(initial)
    setTotals(initial)
  }

  function refresh() {
    void loadChannelTotals().then((result) => {
      if (result.ok) setTotals(result.data)
    })
  }

  useEffect(() => {
    const poll = () => {
      if (document.visibilityState !== "visible") return
      void loadChannelTotals().then((result) => {
        if (result.ok) setTotals(result.data)
      })
    }
    const timer = window.setInterval(poll, UNREAD_POLL_MS)
    document.addEventListener("visibilitychange", poll)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", poll)
    }
  }, [])

  return <UnreadContext value={{ ...totals, refresh }}>{children}</UnreadContext>
}

export function useUnread(): UnreadContextValue {
  return use(UnreadContext) ?? { unread: 0, pending: 0, refresh: () => {} }
}
