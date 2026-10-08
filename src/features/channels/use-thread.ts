"use client"

import { useEffect, useEffectEvent, useRef, useState } from "react"

import { mergeMessages, THREAD_POLL_MS, type ThreadData, type ThreadMessage } from "@/features/channels/logic"
import type { ActionResult } from "@/lib/types"

interface ThreadState {
  /** Página mais recente (null enquanto carrega pela primeira vez). */
  latest: ThreadMessage[] | null
  /** Páginas anteriores carregadas com "Ver anteriores". */
  older: ThreadMessage[]
  pending: ThreadMessage[]
  hasMore: boolean
  error: string | null
}

const EMPTY: ThreadState = { latest: null, older: [], pending: [], hasMore: false, error: null }

/**
 * Fio de mensagens que se atualiza sozinho: busca a página mais recente ao
 * abrir, a cada poucos segundos com a aba visível e ao voltar para a aba. O
 * app não usa Supabase no navegador; cada busca é uma Server Action com a
 * sessão da pessoa. `key` troca o fio (outro canal ou post).
 */
export function useThread(
  key: string | null,
  load: (before?: string) => Promise<ActionResult<ThreadData>>
) {
  const [state, setState] = useState<ThreadState>(EMPTY)
  const [loadedKey, setLoadedKey] = useState<string | null>(key)
  // Pedido de busca imediata (depois de enviar, editar ou marcar).
  const [tick, setTick] = useState(0)
  const inFlight = useRef(0)
  const sequence = useRef(0)
  const currentKey = useRef(key)

  // Outro canal: começa vazio (ajuste durante a renderização, sem efeito).
  if (loadedKey !== key) {
    setLoadedKey(key)
    setState(EMPTY)
  }

  // Cada busca tem um número; só a mais nova vale (uma resposta atrasada não
  // apaga uma mais recente).
  const fetchLatest = useEffectEvent(async (fromTimer: boolean) => {
    if (!key || (fromTimer && inFlight.current > 0)) return
    const mine = ++sequence.current
    inFlight.current += 1
    try {
      const result = await load()
      if (mine !== sequence.current || currentKey.current !== key) return
      if (!result.ok) {
        setState((current) => ({ ...current, error: result.error }))
        return
      }
      setState((current) => ({
        latest: result.data.messages,
        older: current.older,
        pending: result.data.pending,
        hasMore: current.older.length > 0 ? current.hasMore : result.data.hasMore,
        error: null,
      }))
    } catch {
      if (mine === sequence.current && currentKey.current === key) {
        setState((current) => ({ ...current, error: "Sem conexão. Tentando de novo…" }))
      }
    } finally {
      inFlight.current -= 1
    }
  })

  useEffect(() => {
    currentKey.current = key
    if (!key) return
    const first = window.setTimeout(() => void fetchLatest(false), 0)
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchLatest(true)
    }, THREAD_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchLatest(true)
    }
    document.addEventListener("visibilitychange", onVisible)
    window.addEventListener("focus", onVisible)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
      window.removeEventListener("focus", onVisible)
    }
  }, [key, tick])

  function refresh() {
    setTick((value) => value + 1)
  }

  async function loadOlder() {
    const all = mergeMessages(state.older, state.latest ?? [])
    const oldest = all[0]
    if (!oldest || !key) return
    const requested = key
    const result = await load(oldest.created_at)
    if (currentKey.current !== requested) return
    if (!result.ok) {
      setState((current) => ({ ...current, error: result.error }))
      return
    }
    setState((current) => ({
      ...current,
      older: mergeMessages(result.data.messages, current.older),
      hasMore: result.data.hasMore,
    }))
  }

  /** Mensagem que acabou de ser enviada aparece antes da próxima busca. */
  function addLocal(message: ThreadMessage) {
    setState((current) => ({
      ...current,
      latest: mergeMessages(current.latest ?? [], [message]),
      pending: message.kind === "change_request" && !message.resolved_at ? [...current.pending, message] : current.pending,
    }))
  }

  /** Mensagem apagada sai na hora (inclusive das páginas anteriores). */
  function removeLocal(id: string) {
    setState((current) => ({
      ...current,
      latest: current.latest?.filter((message) => message.id !== id) ?? null,
      older: current.older.filter((message) => message.id !== id),
      pending: current.pending.filter((message) => message.id !== id),
    }))
  }

  return {
    messages: state.latest === null ? null : mergeMessages(state.older, state.latest),
    pending: state.pending,
    hasMore: state.hasMore,
    error: state.error,
    refresh,
    loadOlder,
    addLocal,
    removeLocal,
  }
}
