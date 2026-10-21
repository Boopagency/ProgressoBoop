"use client"

import { CheckCheck, CircleCheck, FileText, ListChecks, Megaphone, MessageCircle, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useEffect, useEffectEvent, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { relativeTime } from "@/features/activity/logic"
import {
  loadPortalNotifications,
  markAllPortalNotificationsRead,
  markPortalNotificationRead,
} from "@/features/portal/notification-actions"
import {
  describePortalNotification,
  type PortalNotification,
  type PortalNotificationKind,
} from "@/features/portal/notification-logic"
import { usePortalAlerts } from "@/features/portal/portal-alerts"
import type { PortalClient } from "@/features/portal/session"
import { todayKey } from "@/lib/dates"
import { cn } from "@/lib/utils"

const KIND_ICON: Record<PortalNotificationKind, LucideIcon> = {
  team_message: MessageCircle,
  post_review: Megaphone,
  step_approval: ListChecks,
  step_done: CircleCheck,
  file_shared: FileText,
}

/**
 * Avisos da conta, do mais novo para o mais antigo, com os não lidos
 * marcados. Abrir um aviso o marca como lido e leva ao item (post, projeto ou
 * Comunicação). A lista busca de novo quando o Realtime avisa (via o
 * contador do menu).
 */
export function PortalNotificationList({
  initial,
  clients,
  now,
}: {
  initial: PortalNotification[]
  clients: readonly PortalClient[]
  /** Hora da carga no servidor: a mesma no servidor e no navegador ("há 5 min"). */
  now: number
}) {
  const { version, refresh } = usePortalAlerts()
  const [items, setItems] = useState(initial)
  const [clock, setClock] = useState(now)
  const [isPending, startTransition] = useTransition()
  const today = todayKey(new Date(clock))
  const unread = items.filter((item) => !item.read_at).length
  const clientName = (id: string) => (clients.length > 1 ? (clients.find((item) => item.id === id)?.name ?? null) : null)

  const reload = useEffectEvent(async () => {
    const result = await loadPortalNotifications().catch(() => null)
    if (result?.ok) {
      setItems(result.data)
      setClock(Date.now())
    }
  })

  useEffect(() => {
    if (version === 0) return
    const timer = window.setTimeout(() => void reload(), 0)
    return () => window.clearTimeout(timer)
  }, [version])

  function open(item: PortalNotification) {
    if (item.read_at) return
    const stamp = new Date().toISOString()
    setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, read_at: stamp } : entry)))
    void markPortalNotificationRead(item.id).then((result) => {
      if (result.ok) refresh()
    })
  }

  function markAll() {
    startTransition(async () => {
      const result = await markAllPortalNotificationsRead()
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      const stamp = new Date().toISOString()
      setItems((current) => current.map((entry) => (entry.read_at ? entry : { ...entry, read_at: stamp })))
      refresh()
    })
  }

  if (items.length === 0) {
    return (
      <p className="rounded-xl border border-dashed px-4 py-8 text-center text-[13px] leading-5 text-muted-foreground">
        Nenhum aviso por aqui. Quando a equipe responder, enviar um post ou uma etapa para você aprovar, ou concluir
        uma etapa, o aviso aparece aqui.
      </p>
    )
  }

  return (
    <section aria-labelledby="avisos" className="overflow-hidden rounded-xl border bg-card">
      <header className="flex min-h-12 items-center gap-2 border-b px-4 py-2.5">
        <h2 id="avisos" className="flex items-center gap-2 text-sm font-semibold text-foreground">
          {unread > 0 ? (
            <>
              Não lidos <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{unread}</span>
            </>
          ) : (
            "Tudo lido"
          )}
        </h2>
        {unread > 0 ? (
          <Button type="button" variant="ghost" size="sm" className="ml-auto h-8 gap-1.5 text-[13px]" disabled={isPending} onClick={markAll}>
            <CheckCheck className="size-4" />
            Marcar todas como lidas
          </Button>
        ) : null}
      </header>
      <ul className="divide-y">
        {items.map((item) => {
          const Icon = KIND_ICON[item.kind]
          const text = describePortalNotification(item)
          const client = clientName(item.client_id)
          return (
            <li key={item.id}>
              <Link
                href={item.link}
                onClick={() => open(item)}
                className={cn(
                  "flex items-start gap-3 px-4 py-3 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50",
                  !item.read_at && "bg-brand-soft/30"
                )}
              >
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full",
                    item.read_at ? "bg-muted text-muted-foreground" : "bg-brand-soft text-brand-ink"
                  )}
                >
                  <Icon className="size-4" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[13.5px] leading-5 text-foreground", !item.read_at && "font-medium")}>
                    {text.lead}
                    {text.subject ? <span className="font-semibold"> {text.subject}</span> : null}
                  </p>
                  {text.excerpt ? <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">{text.excerpt}</p> : null}
                  <p className="mt-0.5 text-xs text-subtle-foreground">
                    {relativeTime(item.created_at, clock, today)}
                    {client ? ` · ${client}` : ""}
                  </p>
                </div>
                {item.read_at ? null : (
                  <span className="mt-2 size-2 shrink-0 rounded-full bg-brand">
                    <span className="sr-only">Não lido</span>
                  </span>
                )}
              </Link>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
