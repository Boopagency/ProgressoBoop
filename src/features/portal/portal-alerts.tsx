"use client"

import { useSearchParams } from "next/navigation"
import { createContext, use, useEffect, useEffectEvent, useState, type ReactNode } from "react"

import { listenToNotifications } from "@/features/notifications/realtime"
import { selectedClient } from "@/features/portal/links"
import { getPortalRealtimeToken, loadPortalCounts } from "@/features/portal/notification-actions"
import { PORTAL_COUNTS_POLL_MS, type PortalCounts } from "@/features/portal/notification-logic"
import type { PortalClient } from "@/features/portal/session"
import { syncAppBadge } from "@/features/push/browser"

/*
 * Contagens do menu do portal: as mensagens não lidas do cliente escolhido
 * (Comunicação) e os avisos não lidos da conta (Notificações). O navegador
 * escuta os próprios avisos pelo Realtime (o mesmo `listenToNotifications`
 * do sino da equipe, na tabela `client_notifications`) e, ao receber o sinal,
 * pergunta as contagens ao servidor; sem o Realtime, pergunta a cada 30
 * segundos com a aba visível. `version` muda a cada sinal, para a tela de
 * Notificações buscar a lista de novo.
 */

interface PortalAlerts {
  counts: PortalCounts
  version: number
  /** Pergunta as contagens de novo (depois de ler o canal ou marcar avisos). */
  refresh: () => void
}

const PortalAlertsContext = createContext<PortalAlerts | null>(null)

export function PortalAlertsProvider({
  userId,
  clients,
  initial,
  children,
}: {
  userId: string
  clients: readonly PortalClient[]
  initial: PortalCounts
  children: ReactNode
}) {
  const searchParams = useSearchParams()
  const clientId = selectedClient(clients, searchParams.get("cliente"))?.id ?? null
  const [counts, setCounts] = useState(initial)
  const [version, setVersion] = useState(0)
  const [tick, setTick] = useState(0)

  const fetchCounts = useEffectEvent(async () => {
    if (!clientId) return
    const result = await loadPortalCounts(clientId).catch(() => null)
    if (result?.ok) setCounts(result.data)
  })

  // Ao abrir, ao trocar de cliente, a cada pedido e de tempos em tempos.
  useEffect(() => {
    const first = window.setTimeout(() => void fetchCounts(), 0)
    const timer = window.setInterval(() => {
      if (document.visibilityState === "visible") void fetchCounts()
    }, PORTAL_COUNTS_POLL_MS)
    const onVisible = () => {
      if (document.visibilityState === "visible") void fetchCounts()
    }
    document.addEventListener("visibilitychange", onVisible)
    return () => {
      window.clearTimeout(first)
      window.clearInterval(timer)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [clientId, tick])

  const onSignal = useEffectEvent(() => {
    setVersion((value) => value + 1)
    void fetchCounts()
  })

  useEffect(() => {
    let timer: number | undefined
    return listenToNotifications(
      userId,
      {
        // Vários sinais seguidos viram uma consulta só.
        onChange: () => {
          window.clearTimeout(timer)
          timer = window.setTimeout(() => onSignal(), 250)
        },
        onStatus: () => {},
      },
      { table: "client_notifications", getToken: getPortalRealtimeToken }
    )
  }, [userId])

  // O número no ícone do app instalado acompanha os avisos não lidos.
  useEffect(() => {
    syncAppBadge(counts.notifications)
  }, [counts.notifications])

  return (
    <PortalAlertsContext value={{ counts, version, refresh: () => setTick((value) => value + 1) }}>
      {children}
    </PortalAlertsContext>
  )
}

export function usePortalAlerts(): PortalAlerts {
  const context = use(PortalAlertsContext)
  if (!context) throw new Error("usePortalAlerts precisa do PortalAlertsProvider.")
  return context
}
