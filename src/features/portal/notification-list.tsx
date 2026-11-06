"use client"

import { Banknote, BellRing, CheckCheck, CircleCheck, FileText, ListChecks, Megaphone, MessageCircle, type LucideIcon } from "lucide-react"
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
import { PortalEmpty } from "@/features/portal/portal-ui"
import type { PortalClient } from "@/features/portal/session"
import { addDaysToKey, todayKey, toDateKey } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const KIND_ICON: Record<PortalNotificationKind, LucideIcon> = {
  team_message: MessageCircle,
  post_review: Megaphone,
  step_approval: ListChecks,
  step_done: CircleCheck,
  file_shared: FileText,
  payment_overdue: Banknote,
}

/**
 * Avisos da conta, do mais novo para o mais antigo (em Hoje, Ontem e Antes),
 * com os não lidos marcados. Abrir um aviso o marca como lido e leva ao item (post, projeto ou
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
      <PortalEmpty icon={BellRing} title="Nenhum aviso por aqui">
        Quando a equipe responder, enviar um post ou uma etapa para você aprovar, ou concluir uma etapa, o aviso aparece
        aqui.
      </PortalEmpty>
    )
  }

  const groups = groupByDay(items, today)

  return (
    <div className="space-y-6">
      <div className="flex min-h-9 items-center gap-3">
        <p className="text-[13.5px] text-muted-foreground">
          {unread > 0 ? (
            <>
              <span className="font-semibold text-foreground tabular-nums">{unread}</span> {unread === 1 ? "aviso não lido" : "avisos não lidos"}
            </>
          ) : (
            "Tudo lido."
          )}
        </p>
        {unread > 0 ? (
          <Button type="button" variant="outline" size="sm" className="ml-auto" disabled={isPending} onClick={markAll}>
            <CheckCheck />
            Marcar todas como lidas
          </Button>
        ) : null}
      </div>

      {groups.map((group) => (
        <section key={group.label} aria-labelledby={`avisos-${group.key}`} className="space-y-2.5">
          <h2 id={`avisos-${group.key}`} className="eyebrow text-muted-foreground">
            {group.label}
          </h2>
          <ul className="overflow-hidden rounded-[1.5rem] border bg-card">
            {group.items.map((item) => {
              const Icon = KIND_ICON[item.kind]
              const text = describePortalNotification(item)
              const client = clientName(item.client_id)
              return (
                <li key={item.id} className="border-b border-border/70 last:border-b-0">
                  <Link
                    href={item.link}
                    onClick={() => open(item)}
                    className={cn(
                      "relative flex items-start gap-3.5 px-4 py-3.5 transition-colors outline-none hover:bg-muted/50 focus-visible:bg-muted/50 sm:px-5",
                      !item.read_at && "bg-glow-soft/40"
                    )}
                  >
                    {item.read_at ? null : (
                      <span aria-hidden="true" className="absolute inset-y-3 left-0 w-[3px] rounded-r-full bg-glow shadow-[0_0_10px_var(--glow)]" />
                    )}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-xl",
                        item.read_at ? "bg-muted text-muted-foreground" : "border border-glow/30 bg-glow-soft text-brand-ink"
                      )}
                    >
                      <Icon className="size-4" />
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-[14px] leading-5 text-foreground", !item.read_at && "font-medium")}>
                        {text.lead}
                        {text.subject ? <span className="font-semibold"> {text.subject}</span> : null}
                      </p>
                      {text.excerpt ? <p className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-muted-foreground">{text.excerpt}</p> : null}
                      <p className="mt-1 text-xs text-subtle-foreground">
                        {relativeTime(item.created_at, clock, today)}
                        {client ? ` · ${client}` : ""}
                      </p>
                    </div>
                    {item.read_at ? null : (
                      <span className="mt-2 size-2 shrink-0 rounded-full bg-glow shadow-[0_0_8px_var(--glow)]">
                        <span className="sr-only">Não lido</span>
                      </span>
                    )}
                  </Link>
                </li>
              )
            })}
          </ul>
        </section>
      ))}
    </div>
  )
}

/** Os avisos separados em Hoje, Ontem e Antes (já vêm do mais novo para o mais antigo). */
function groupByDay(items: PortalNotification[], today: DateKey) {
  const yesterday = addDaysToKey(today, -1)
  const groups = [
    { key: "hoje", label: "Hoje", items: [] as PortalNotification[] },
    { key: "ontem", label: "Ontem", items: [] as PortalNotification[] },
    { key: "antes", label: "Antes", items: [] as PortalNotification[] },
  ]
  for (const item of items) {
    const day = toDateKey(item.created_at)
    groups[day === today ? 0 : day === yesterday ? 1 : 2]!.items.push(item)
  }
  return groups.filter((group) => group.items.length > 0)
}
