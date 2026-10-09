"use client"

import {
  Bell,
  BellOff,
  BellRing,
  CheckCheck,
  CircleCheck,
  ListTodo,
  MessageCircle,
  MessageSquare,
  PencilLine,
  Volume2,
  VolumeX,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useEffectEvent, useRef, useState, useSyncExternalStore } from "react"
import { toast } from "sonner"

import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Toggle } from "@/components/ui/toggle"
import { relativeTime } from "@/features/activity/logic"
import { loadNotifications, markAllNotificationsRead, markNotificationRead } from "@/features/notifications/actions"
import {
  claimAnnouncements,
  DEFAULT_PREFS,
  getBrowserPermission,
  getPrefs,
  playChime,
  requestBrowserPermission,
  setPrefs,
  showBrowserNotification,
  soundReady,
  subscribeNotificationSettings,
  unlockSound,
  type BrowserPermission,
} from "@/features/notifications/browser"
import {
  badgeLabel,
  describeNotification,
  freshNotifications,
  notificationSentence,
  FALLBACK_POLL_MS,
  REALTIME_CHECK_MS,
  type AppNotification,
  type NotificationFeed,
  type NotificationKind,
} from "@/features/notifications/logic"
import { listenToNotifications } from "@/features/notifications/realtime"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { useIsMobile } from "@/hooks/use-mobile"
import { todayKey } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const KIND_ICON: Record<NotificationKind, LucideIcon> = {
  message: MessageSquare,
  client_message: MessageCircle,
  client_approval: CircleCheck,
  client_change_request: PencilLine,
  task_assigned: ListTodo,
}

/** Avisos do navegador mostrados de uma vez (o resto fica no sino). */
const BROWSER_BURST = 3
/** Vários sinais seguidos do Realtime viram uma consulta só. */
const SIGNAL_DEBOUNCE_MS = 250
/** De quanto em quanto tempo o relógio confere se está na hora de consultar. */
const TICK_MS = 5000

function currentTime() {
  return Date.now()
}

function serverPermission(): BrowserPermission {
  return "unsupported"
}

function serverPrefs() {
  return DEFAULT_PREFS
}

/**
 * Sino do topo: contador de não lidas, a lista dos avisos mais recentes e
 * "Marcar todas como lidas". O aviso chega na hora: o Realtime avisa que algo
 * mudou e o sino busca a lista no servidor. Com o Realtime no ar, ainda
 * confere a cada minuto; sem ele, pergunta a cada 10 segundos (também com a
 * aba em segundo plano, quando o navegador pode espaçar as consultas).
 * Aviso novo toca um som (só depois do primeiro clique na página, regra dos
 * navegadores) e, com a aba em segundo plano, mostra o aviso do navegador.
 * Os dois ligam e desligam no rodapé da lista, por navegador.
 */
export function NotificationBell({ initial }: { initial: NotificationFeed }) {
  const router = useRouter()
  const isMobile = useIsMobile()
  const { clientById, currentUser } = useWorkspace()
  const userId = currentUser.id
  const [feed, setFeed] = useState(initial)
  const [synced, setSynced] = useState(initial)
  // Ids já vistos nesta aba: só o que chega depois disso é anunciado.
  const [known] = useState(() => new Set(initial.items.map((item) => item.id)))
  const request = useRef(0)
  const [open, setOpen] = useState(false)
  const [now, setNow] = useState(currentTime)
  const [today, setToday] = useState<DateKey>(() => todayKey())
  const prefs = useSyncExternalStore(subscribeNotificationSettings, getPrefs, serverPrefs)
  const permission = useSyncExternalStore(subscribeNotificationSettings, getBrowserPermission, serverPermission)

  // A página recarregou (ex.: depois de uma ação): vale o que o servidor mandou.
  if (initial !== synced) {
    setSynced(initial)
    setFeed(initial)
  }

  function clientName(item: AppNotification): string | null {
    return item.client_id ? (clientById.get(item.client_id)?.name ?? null) : null
  }

  function markRead(item: AppNotification) {
    if (item.read_at) return
    // Resposta de uma consulta que já estava a caminho chegaria desatualizada.
    request.current += 1
    const stamp = new Date().toISOString()
    setFeed((current) => {
      // Já lida aqui (ex.: clique no aviso do navegador depois de abrir pela lista).
      if (current.items.some((entry) => entry.id === item.id && entry.read_at)) return current
      return {
        items: current.items.map((entry) => (entry.id === item.id ? { ...entry, read_at: stamp } : entry)),
        unread: Math.max(0, current.unread - 1),
      }
    })
    void markNotificationRead(item.id)
  }

  function markAll() {
    request.current += 1
    const stamp = new Date().toISOString()
    setFeed((current) => ({
      items: current.items.map((entry) => (entry.read_at ? entry : { ...entry, read_at: stamp })),
      unread: 0,
    }))
    void markAllNotificationsRead().then((result) => {
      if (!result.ok) toast.error(result.error)
    })
  }

  function openFromBrowser(item: AppNotification) {
    markRead(item)
    setOpen(false)
    router.push(item.link)
  }

  function announce(items: AppNotification[]) {
    if (items.length === 0) return
    const current = getPrefs()
    const withSound = current.sound && soundReady()
    const withNotice = current.browser && getBrowserPermission() === "granted" && document.visibilityState === "hidden"
    // Esta aba não tem como anunciar: deixa para outra que tenha.
    if (!withSound && !withNotice) return
    const mine = new Set(claimAnnouncements(items.map((item) => item.id)))
    const fresh = items.filter((item) => mine.has(item.id))
    if (fresh.length === 0) return
    if (withSound) playChime()
    if (withNotice) {
      for (const item of fresh.slice(-BROWSER_BURST)) {
        const text = describeNotification(item, clientName(item))
        showBrowserNotification({
          id: item.id,
          title: notificationSentence(text),
          body: text.excerpt,
          onClick: () => openFromBrowser(item),
        })
      }
    }
  }

  const poll = useEffectEvent(async () => {
    const id = ++request.current
    const result = await loadNotifications()
    if (!result.ok || id !== request.current) return
    const fresh = freshNotifications(result.data.items, known)
    for (const item of result.data.items) known.add(item.id)
    setFeed(result.data)
    setNow(Date.now())
    announce(fresh)
  })

  useEffect(() => {
    let live = false
    let lastPoll = Date.now()
    let pending: number | undefined
    const run = () => {
      window.clearTimeout(pending)
      lastPoll = Date.now()
      void poll()
    }
    const soon = () => {
      window.clearTimeout(pending)
      pending = window.setTimeout(run, SIGNAL_DEBOUNCE_MS)
    }
    const tick = () => {
      if (Date.now() - lastPoll >= (live ? REALTIME_CHECK_MS : FALLBACK_POLL_MS)) run()
    }
    const onVisible = () => {
      if (document.visibilityState === "visible") run()
    }
    const timer = window.setInterval(tick, TICK_MS)
    document.addEventListener("visibilitychange", onVisible)
    const stop = listenToNotifications(userId, {
      onChange: soon,
      onStatus: (next) => {
        // Voltou a escutar: busca o que pode ter chegado enquanto estava fora.
        if (next && !live) soon()
        live = next
      },
    })
    return () => {
      stop()
      window.clearInterval(timer)
      window.clearTimeout(pending)
      document.removeEventListener("visibilitychange", onVisible)
    }
  }, [userId])

  // O som só pode tocar depois de um clique (ou tecla) na página.
  useEffect(() => {
    const unlock = () => {
      if (getPrefs().sound) unlockSound()
    }
    window.addEventListener("click", unlock, true)
    window.addEventListener("keydown", unlock, true)
    return () => {
      window.removeEventListener("click", unlock, true)
      window.removeEventListener("keydown", unlock, true)
    }
  }, [])

  function toggleSound(on: boolean) {
    setPrefs({ ...getPrefs(), sound: on })
    if (on) {
      unlockSound()
      playChime()
    }
  }

  async function toggleBrowser(on: boolean) {
    if (!on) {
      setPrefs({ ...getPrefs(), browser: false })
      return
    }
    const result = getBrowserPermission() === "default" ? await requestBrowserPermission() : getBrowserPermission()
    if (result === "granted") setPrefs({ ...getPrefs(), browser: true })
    else if (result === "denied") {
      toast.error("O navegador bloqueou os avisos deste site. Libere nas configurações do site e ligue de novo.")
    }
  }

  function onOpenChange(next: boolean) {
    setOpen(next)
    if (next) {
      setNow(Date.now())
      setToday(todayKey())
    }
  }

  const unread = feed.unread
  const browserOn = prefs.browser && permission === "granted"

  return (
    <Popover open={open} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={unread > 0 ? `Notificações: ${unread} ${unread === 1 ? "não lida" : "não lidas"}` : "Notificações"}
          className="relative inline-flex size-8 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:bg-accent data-[state=open]:text-foreground"
        >
          <Bell className="size-4" aria-hidden="true" />
          {unread > 0 ? (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] leading-none font-semibold text-brand-navy tabular-nums ring-2 ring-background"
            >
              {badgeLabel(unread)}
            </span>
          ) : null}
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="end"
        sideOffset={6}
        aria-label="Notificações"
        className="flex w-[min(24rem,calc(100vw-1.5rem))] flex-col p-0"
      >
        <div className="flex items-center justify-between gap-3 border-b px-3.5 py-2.5">
          <h2 className="text-sm font-semibold">Notificações</h2>
          <button
            type="button"
            onClick={markAll}
            disabled={unread === 0}
            className="inline-flex items-center gap-1 rounded-sm text-xs text-muted-foreground outline-none hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none disabled:opacity-50"
          >
            <CheckCheck className="size-3.5" aria-hidden="true" />
            Marcar todas como lidas
          </button>
        </div>
        {feed.items.length === 0 ? (
          <p className="px-4 py-10 text-center text-sm text-muted-foreground">Nenhuma notificação por enquanto.</p>
        ) : (
          <ul className="max-h-[min(28rem,60svh)] overflow-y-auto py-1">
            {feed.items.map((item) => (
              <NotificationRow
                key={item.id}
                item={item}
                clientName={clientName(item)}
                now={now}
                today={today}
                onOpen={() => {
                  markRead(item)
                  setOpen(false)
                }}
              />
            ))}
          </ul>
        )}
        <div className="flex flex-wrap items-center gap-1 border-t px-2 py-1.5">
          <Toggle
            size="sm"
            pressed={prefs.sound}
            onPressedChange={toggleSound}
            title={prefs.sound ? "Desligar o som" : "Ligar o som"}
            className="h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground data-[state=on]:text-foreground"
          >
            {prefs.sound ? <Volume2 aria-hidden="true" /> : <VolumeX aria-hidden="true" />}
            Som
          </Toggle>
          {permission !== "unsupported" && !isMobile ? (
            <Toggle
              size="sm"
              pressed={browserOn}
              onPressedChange={(on) => void toggleBrowser(on)}
              title={
                permission === "denied"
                  ? "O navegador bloqueou os avisos deste site"
                  : browserOn
                    ? "Desligar o aviso do navegador"
                    : "Avisar pelo navegador com a aba em segundo plano"
              }
              className="h-7 gap-1.5 px-2 text-xs font-normal text-muted-foreground data-[state=on]:text-foreground"
            >
              {browserOn ? <BellRing aria-hidden="true" /> : <BellOff aria-hidden="true" />}
              Aviso do navegador
            </Toggle>
          ) : null}
        </div>
      </PopoverContent>
    </Popover>
  )
}

function NotificationRow({
  item,
  clientName,
  now,
  today,
  onOpen,
}: {
  item: AppNotification
  clientName: string | null
  now: number
  today: DateKey
  onOpen: () => void
}) {
  const text = describeNotification(item, clientName)
  const Icon = KIND_ICON[item.kind]
  const unread = !item.read_at
  return (
    <li>
      <Link
        href={item.link}
        onClick={onOpen}
        className="flex gap-3 px-3.5 py-2.5 transition-colors outline-none hover:bg-accent/60 focus-visible:bg-accent"
      >
        <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-muted text-muted-foreground">
          <Icon className="size-3.5" aria-hidden="true" />
        </span>
        <span className="min-w-0 flex-1">
          <span className={cn("block text-[13px] leading-snug break-words", unread ? "text-foreground" : "text-muted-foreground")}>
            <span className="font-semibold">{text.actor}</span> {text.action}
            {text.subject ? <span className="font-medium"> {text.subject}</span> : null}
          </span>
          {text.excerpt ? (
            <span className="mt-0.5 line-clamp-2 block text-xs break-words text-muted-foreground">{text.excerpt}</span>
          ) : null}
          <span className="mt-1 block text-[11px] text-subtle-foreground">{relativeTime(item.created_at, now, today)}</span>
        </span>
        {unread ? <span className="mt-1.5 size-2 shrink-0 rounded-full bg-brand" role="img" aria-label="Não lida" /> : null}
      </Link>
    </li>
  )
}
