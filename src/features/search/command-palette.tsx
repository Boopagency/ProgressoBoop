"use client"

import {
  BookOpen,
  Building2,
  CalendarPlus,
  CheckCircle2,
  Circle,
  CornerDownLeft,
  FilePlus2,
  ListTodo,
  Loader2,
  Plus,
  Presentation,
  Search,
  type LucideIcon,
} from "lucide-react"
import { usePathname, useRouter } from "next/navigation"
import {
  createContext,
  use,
  useEffect,
  useId,
  useRef,
  useState,
  useSyncExternalStore,
  type ReactNode,
} from "react"

import { NAV_ITEMS } from "@/components/layout/nav-items"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { useOpenMeeting } from "@/features/meetings/open-meeting"
import { searchEverything, type SearchResults } from "@/features/search/actions"
import { useNewTask } from "@/features/tasks/new-task-dialog"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { describeDue, formatShortDate, todayKey } from "@/lib/dates"
import { includesText } from "@/lib/text"
import { cn } from "@/lib/utils"

/*
 * Busca geral (Ctrl/⌘ + K): ações rápidas, telas e resultados de tarefas,
 * reuniões, processos e clientes. Abre de qualquer tela; no editor de
 * processos, Ctrl/⌘ + K continua criando link (use o botão "Buscar").
 */

interface PaletteContextValue {
  openPalette: () => void
}

const PaletteContext = createContext<PaletteContextValue | null>(null)

export function useCommandPalette(): PaletteContextValue {
  const context = use(PaletteContext)
  if (!context) throw new Error("useCommandPalette precisa estar dentro de CommandPaletteProvider.")
  return context
}

const subscribeNothing = () => () => {}

/** Marca nova para `?novo=` (a tela abre o diálogo uma vez por marca). */
function freshStamp(): string {
  return Date.now().toString(36)
}

/** "⌘K" no Mac, "Ctrl K" no resto. */
export function useShortcutLabel(): string {
  const mac = useSyncExternalStore(
    subscribeNothing,
    () => /Mac|iPhone|iPad/.test(navigator.platform),
    () => false
  )
  return mac ? "⌘K" : "Ctrl K"
}

export function CommandPaletteProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState({ open: false, key: 0 })

  function openPalette() {
    setState((current) => ({ open: true, key: current.key + 1 }))
  }

  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if (event.key.toLowerCase() !== "k" || !(event.metaKey || event.ctrlKey) || event.altKey || event.shiftKey) return
      // No editor de processos, Ctrl/⌘ + K é "inserir link".
      if (event.target instanceof Element && event.target.closest(".bn-editor")) return
      event.preventDefault()
      setState((current) => (current.open ? current : { open: true, key: current.key + 1 }))
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [])

  return (
    <PaletteContext value={{ openPalette }}>
      {children}
      <Dialog open={state.open} onOpenChange={(open) => setState((current) => ({ ...current, open }))}>
        <DialogContent
          showCloseButton={false}
          className="top-[8%] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[12%] sm:max-w-[640px]"
        >
          <DialogTitle className="sr-only">Buscar no portal</DialogTitle>
          <DialogDescription className="sr-only">
            Busque tarefas, reuniões, processos e clientes, ou escolha uma ação.
          </DialogDescription>
          <Palette key={state.key} onClose={() => setState((current) => ({ ...current, open: false }))} />
        </DialogContent>
      </Dialog>
    </PaletteContext>
  )
}

/** Botão "Buscar" do topo (abre a busca geral). */
export function SearchButton({ className }: { className?: string }) {
  const { openPalette } = useCommandPalette()
  const shortcut = useShortcutLabel()
  return (
    <button
      type="button"
      onClick={openPalette}
      aria-label="Buscar no portal"
      className={cn(
        "inline-flex h-8 items-center gap-2 rounded-md border border-input bg-background px-2.5 text-[13px] text-muted-foreground transition-colors outline-none hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 sm:w-56",
        className
      )}
    >
      <Search className="size-3.5 shrink-0" aria-hidden="true" />
      <span className="hidden flex-1 text-left sm:inline">Buscar…</span>
      <kbd className="hidden rounded border px-1 font-sans text-[10.5px] leading-4 text-subtle-foreground sm:inline-block">
        {shortcut}
      </kbd>
    </button>
  )
}

interface Item {
  id: string
  group: string
  label: string
  detail?: string | null
  icon: LucideIcon
  iconClassName?: string
  run: () => void
}

function Palette({ onClose }: { onClose: () => void }) {
  const router = useRouter()
  const pathname = usePathname()
  const listId = useId()
  const { openNewTask } = useNewTask()
  const { clientById } = useWorkspace()
  const { open: openMeeting } = useOpenMeeting()
  const [today] = useState(() => todayKey())
  const [query, setQuery] = useState("")
  const [results, setResults] = useState<{ query: string; data: SearchResults } | null>(null)
  const [loading, setLoading] = useState(false)
  const [active, setActive] = useState(0)
  const requestRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const listRef = useRef<HTMLDivElement>(null)

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    },
    []
  )

  function go(href: string) {
    onClose()
    router.push(href)
  }

  function search(next: string) {
    if (timerRef.current) clearTimeout(timerRef.current)
    const trimmed = next.trim()
    if (trimmed.length < 2) {
      setLoading(false)
      setResults(null)
      return
    }
    setLoading(true)
    timerRef.current = setTimeout(() => {
      const request = ++requestRef.current
      void searchEverything(trimmed)
        .then((data) => {
          if (request !== requestRef.current) return
          setResults({ query: trimmed, data })
          setLoading(false)
        })
        .catch(() => {
          if (request === requestRef.current) setLoading(false)
        })
    }, 220)
  }

  const actions: Item[] = [
    { id: "new-task", group: "Ações", label: "Nova tarefa", icon: Plus, run: () => { onClose(); openNewTask() } },
    { id: "new-meeting", group: "Ações", label: "Nova reunião", icon: CalendarPlus, run: () => go(`/reunioes?novo=${freshStamp()}`) },
    { id: "new-doc", group: "Ações", label: "Novo documento (processo, checklist, política ou guia)", icon: FilePlus2, run: () => go(`/processos?novo=${freshStamp()}`) },
    { id: "new-client", group: "Ações", label: "Novo cliente", icon: Building2, run: () => go(`/clientes?novo=${freshStamp()}`) },
  ]
  const pages: Item[] = NAV_ITEMS.map((item) => ({
    id: `page-${item.href}`,
    group: "Ir para",
    label: item.title,
    detail: pathname === item.href ? "Você está aqui" : null,
    icon: item.icon,
    run: () => go(item.href),
  }))

  const trimmed = query.trim()
  const staticItems = trimmed ? [...actions, ...pages].filter((item) => includesText(item.label, trimmed)) : [...actions, ...pages]
  const data = results && results.query === trimmed ? results.data : null
  const dynamicItems: Item[] = data
    ? [
        ...data.tasks.map<Item>((task) => {
          const done = task.status === "done"
          const client = task.client_id ? clientById.get(task.client_id)?.name : undefined
          const due = done ? "Concluída" : task.due_date ? describeDue(task.due_date, today).label : null
          return {
            id: `task-${task.id}`,
            group: "Tarefas",
            label: task.title,
            detail: [client, due].filter(Boolean).join(" · ") || null,
            icon: done ? CheckCircle2 : Circle,
            iconClassName: done ? "text-success" : undefined,
            run: () => go(`/tarefas?tarefa=${task.id}`),
          }
        }),
        ...data.meetings.map<Item>((meeting) => ({
          id: `meeting-${meeting.key}`,
          group: "Reuniões",
          label: meeting.title,
          detail: [formatShortDate(meeting.date, today), meeting.detail].filter(Boolean).join(" · "),
          icon: Presentation,
          run: () => {
            if (meeting.recordId) {
              go(`/reunioes/${meeting.recordId}`)
            } else {
              onClose()
              openMeeting(meeting.eventId, meeting.date)
            }
          },
        })),
        ...data.docs.map<Item>((doc) => ({
          id: `doc-${doc.id}`,
          group: "Processos",
          label: doc.title,
          detail: doc.detail,
          icon: BookOpen,
          run: () => go(`/processos/${doc.id}`),
        })),
        ...data.clients.map<Item>((client) => ({
          id: `client-${client.id}`,
          group: "Clientes",
          label: client.name,
          detail: client.active ? null : "Inativo",
          icon: Building2,
          run: () => go(`/clientes/${client.id}`),
        })),
      ]
    : []
  // Com busca, os resultados vêm antes das ações e telas.
  const items = trimmed ? [...dynamicItems, ...staticItems] : staticItems
  const activeIndex = items.length === 0 ? -1 : Math.min(active, items.length - 1)
  const activeItem = activeIndex >= 0 ? items[activeIndex] : undefined

  function move(delta: number) {
    if (items.length === 0) return
    const next = (activeIndex + delta + items.length) % items.length
    setActive(next)
    listRef.current
      ?.querySelector(`[data-index="${next}"]`)
      ?.scrollIntoView({ block: "nearest" })
  }

  const nothing = trimmed.length >= 2 && !loading && data !== null && items.length === 0

  return (
    <div>
      <div className="flex items-center gap-2 border-b px-4">
        <Search className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          autoFocus
          value={query}
          onChange={(event) => {
            setQuery(event.target.value)
            setActive(0)
            search(event.target.value)
          }}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown") {
              event.preventDefault()
              move(1)
            } else if (event.key === "ArrowUp") {
              event.preventDefault()
              move(-1)
            } else if (event.key === "Enter") {
              event.preventDefault()
              activeItem?.run()
            }
          }}
          placeholder="Buscar tarefas, reuniões, processos e clientes…"
          role="combobox"
          aria-expanded="true"
          aria-controls={listId}
          aria-activedescendant={activeItem ? `${listId}-${activeItem.id}` : undefined}
          aria-label="Buscar no portal"
          className="h-12 min-w-0 flex-1 bg-transparent text-[15px] text-foreground outline-none placeholder:text-subtle-foreground"
        />
        {loading ? <Loader2 className="size-4 shrink-0 animate-spin text-muted-foreground" aria-label="Buscando" /> : null}
      </div>

      <div ref={listRef} id={listId} role="listbox" aria-label="Resultados" className="max-h-[min(60svh,460px)] overflow-y-auto p-1.5">
        {nothing ? (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">Nada encontrado para “{trimmed}”.</p>
        ) : null}
        {items.map((item, index) => {
          const showGroup = index === 0 || items[index - 1]!.group !== item.group
          const Icon = item.icon
          return (
            <div key={item.id}>
              {showGroup ? (
                <p className="px-2.5 pt-2.5 pb-1 text-[11.5px] font-medium tracking-wide text-subtle-foreground uppercase" aria-hidden="true">
                  {item.group}
                </p>
              ) : null}
              <div
                id={`${listId}-${item.id}`}
                role="option"
                aria-selected={index === activeIndex}
                data-index={index}
                onMouseMove={() => {
                  if (index !== activeIndex) setActive(index)
                }}
                onClick={() => item.run()}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-md px-2.5 py-2",
                  index === activeIndex ? "bg-accent" : ""
                )}
              >
                <Icon className={cn("size-4 shrink-0 text-muted-foreground", item.iconClassName)} aria-hidden="true" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{item.label}</span>
                  {item.detail ? (
                    <span className="block truncate text-xs text-muted-foreground">{item.detail}</span>
                  ) : null}
                </span>
                {index === activeIndex ? (
                  <CornerDownLeft className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
                ) : null}
              </div>
            </div>
          )
        })}
      </div>

      <div className="flex items-center gap-4 border-t bg-muted/40 px-4 py-2 text-[11.5px] text-muted-foreground">
        <span>
          <kbd className="font-sans">↑</kbd> <kbd className="font-sans">↓</kbd> navegar
        </span>
        <span>
          <kbd className="font-sans">Enter</kbd> abrir
        </span>
        <span>
          <kbd className="font-sans">Esc</kbd> fechar
        </span>
        <span className="ml-auto hidden items-center gap-1 sm:flex">
          <ListTodo className="size-3" aria-hidden="true" />
          tarefas, reuniões, processos e clientes
        </span>
      </div>
    </div>
  )
}
