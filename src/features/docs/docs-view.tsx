"use client"

import {
  Building2,
  ChevronDown,
  CircleAlert,
  FilePen,
  Library,
  Pin,
  Plus,
  Search,
  Sparkles,
  Tag,
  X,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { usePathname, useRouter, useSearchParams } from "next/navigation"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { PageContainer, PageHeader, SectionTitle } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import { createDoc } from "@/features/docs/actions"
import {
  DOC_KIND_ICON,
  DocKindTile,
  DocStatusBadge,
  Highlight,
  effectiveStatus,
  sinceLabel,
} from "@/features/docs/doc-meta"
import { compareDocs, groupByArea, matchesQuick, needsReview } from "@/features/docs/logic"
import { NewDocDialog, type NewDocDefaults, type NewDocDialogState } from "@/features/docs/new-doc-dialog"
import type { DocSearchHit } from "@/features/docs/queries"
import { SUGGESTIONS } from "@/features/docs/templates"
import { firstName } from "@/features/tasks/logic"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { useUrlTrigger } from "@/hooks/use-url-trigger"
import { DOC_KIND_LABEL, TASK_AREA_LABEL, TASK_AREAS } from "@/lib/labels"
import { foldText } from "@/lib/text"
import type { DateKey, DocSummary, TaskArea } from "@/lib/types"
import { cn, isUuid } from "@/lib/utils"

type Filter =
  | { kind: "all" }
  | { kind: "review" }
  | { kind: "drafts" }
  | { kind: "area"; area: TaskArea | null }
  | { kind: "client"; clientId: string }

const AREA_PARAM: Record<TaskArea, string> = {
  commercial: "comercial",
  finance: "financeiro",
  operations: "operacao",
  brand: "marca",
  technology: "tecnologia",
  clients: "clientes",
}
const NO_AREA = "sem-area"

function parseFilter(params: URLSearchParams): Filter {
  const view = params.get("ver")
  if (view === "revisar") return { kind: "review" }
  if (view === "rascunhos") return { kind: "drafts" }
  const area = params.get("area")
  if (area === NO_AREA) return { kind: "area", area: null }
  const found = TASK_AREAS.find((candidate) => AREA_PARAM[candidate] === area)
  if (found) return { kind: "area", area: found }
  const client = params.get("cliente")
  if (client && isUuid(client)) return { kind: "client", clientId: client }
  return { kind: "all" }
}

function filterParams(filter: Filter): [string, string] | null {
  switch (filter.kind) {
    case "review":
      return ["ver", "revisar"]
    case "drafts":
      return ["ver", "rascunhos"]
    case "area":
      return ["area", filter.area ? AREA_PARAM[filter.area] : NO_AREA]
    case "client":
      return ["cliente", filter.clientId]
    default:
      return null
  }
}

function sameFilter(a: Filter, b: Filter): boolean {
  return JSON.stringify(a) === JSON.stringify(b)
}

function applyFilter(docs: DocSummary[], filter: Filter, today: DateKey): DocSummary[] {
  switch (filter.kind) {
    case "review":
      return docs.filter((doc) => needsReview(doc, today))
    case "drafts":
      return docs.filter((doc) => doc.status === "draft")
    case "area":
      return docs.filter((doc) => doc.area === filter.area)
    case "client":
      return docs.filter((doc) => doc.client_id === filter.clientId)
    default:
      return docs
  }
}

export function DocsView({
  docs,
  query,
  hits,
  today,
}: {
  docs: DocSummary[]
  /** Busca atual (?q=). */
  query: string
  /** Documentos cujo texto bate com a busca (busca do banco), com um trecho. */
  hits: DocSearchHit[]
  today: DateKey
}) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const { clients, clientById } = useWorkspace()
  const filter = parseFilter(searchParams)
  const [draft, setDraft] = useState(query)
  const [isSearching, startSearch] = useTransition()
  const [dialog, setDialog] = useState<NewDocDialogState>({ open: false, key: 0 })
  useUrlTrigger(() => setDialog((current) => ({ open: true, key: current.key + 1 })))

  function urlWith(next: { filter?: Filter; query?: string }) {
    const params = new URLSearchParams()
    const pair = filterParams(next.filter ?? filter)
    if (pair) params.set(pair[0], pair[1])
    const nextQuery = (next.query ?? query).trim()
    if (nextQuery) params.set("q", nextQuery)
    const search = params.toString()
    return search ? `${pathname}?${search}` : pathname
  }

  function changeFilter(next: Filter) {
    window.history.replaceState(null, "", urlWith({ filter: next }))
  }

  function search(next: string) {
    startSearch(() => router.replace(urlWith({ query: next }), { scroll: false }))
  }

  function openNewDoc(defaults?: NewDocDefaults) {
    setDialog((current) => ({ open: true, key: current.key + 1, defaults }))
  }

  const searching = query.trim().length > 0
  const snippetById = new Map(hits.map((hit) => [hit.id, hit.snippet]))
  const filtered = applyFilter(docs, filter, today)
  const results = searching
    ? filtered
        .filter((doc) => matchesQuick(doc, query) || snippetById.has(doc.id))
        .sort((a, b) => Number(matchesQuick(b, query)) - Number(matchesQuick(a, query)) || compareDocs(a, b))
    : []

  const showPinned = filter.kind === "all" && !searching
  const pinned = showPinned ? docs.filter((doc) => doc.pinned).sort(compareDocs) : []
  const grouped = groupByArea(showPinned ? filtered.filter((doc) => !doc.pinned) : filtered)

  const existing = new Set(docs.map((doc) => foldText(doc.title).trim()))
  const suggestions = SUGGESTIONS.map((suggestion, index) => ({ ...suggestion, index })).filter(
    (suggestion) => !existing.has(foldText(suggestion.title))
  )
  const defaultsForFilter: NewDocDefaults =
    filter.kind === "area"
      ? { area: filter.area }
      : filter.kind === "client"
        ? { client_id: filter.clientId, area: "clients" }
        : {}

  const reviewCount = docs.filter((doc) => needsReview(doc, today)).length
  const draftCount = docs.filter((doc) => doc.status === "draft").length
  const areaCount = (area: TaskArea | null) => docs.filter((doc) => doc.area === area).length
  const clientIds = [...new Set(docs.map((doc) => doc.client_id).filter((id): id is string => id !== null))]
  const docClients = clients
    .filter((client) => clientIds.includes(client.id))
    .sort((a, b) => a.name.localeCompare(b.name, "pt-BR"))

  const navGroups: { label: string | null; items: NavEntry[] }[] = [
    {
      label: null,
      items: [
        { filter: { kind: "all" }, label: "Todos", icon: Library, count: docs.length },
        {
          filter: { kind: "review" },
          label: "Para revisar",
          icon: CircleAlert,
          count: reviewCount,
          alert: reviewCount > 0,
        },
        { filter: { kind: "drafts" }, label: "Rascunhos", icon: FilePen, count: draftCount },
      ],
    },
    {
      label: "Áreas",
      items: [
        ...TASK_AREAS.map<NavEntry>((area) => ({
          filter: { kind: "area", area },
          label: TASK_AREA_LABEL[area],
          icon: Tag,
          count: areaCount(area),
        })),
        ...(areaCount(null) > 0
          ? [{ filter: { kind: "area", area: null }, label: "Sem área", icon: Tag, count: areaCount(null) } as NavEntry]
          : []),
      ],
    },
    ...(docClients.length > 0
      ? [
          {
            label: "Clientes",
            items: docClients.map<NavEntry>((client) => ({
              filter: { kind: "client", clientId: client.id },
              label: client.name,
              icon: Building2,
              count: docs.filter((doc) => doc.client_id === client.id).length,
            })),
          },
        ]
      : []),
  ]

  const filterTitle =
    filter.kind === "review"
      ? "Para revisar"
      : filter.kind === "drafts"
        ? "Rascunhos"
        : filter.kind === "area"
          ? filter.area
            ? TASK_AREA_LABEL[filter.area]
            : "Sem área"
          : filter.kind === "client"
            ? (clientById.get(filter.clientId)?.name ?? "Cliente")
            : null

  return (
    <PageContainer className="max-w-[1180px]">
      <PageHeader
        title="Processos"
        description="Como a Boop trabalha: processos, checklists, políticas e guias, num lugar só."
        actions={
          <Button onClick={() => openNewDoc(defaultsForFilter)} className="gap-1.5">
            <Plus />
            Novo documento
          </Button>
        }
      />

      {docs.length === 0 ? (
        <EmptyLibrary suggestions={suggestions} onNew={() => openNewDoc()} />
      ) : (
        <div className="mt-8 lg:grid lg:grid-cols-[200px_minmax(0,1fr)] lg:items-start lg:gap-10">
          <FilterNav groups={navGroups} current={filter} onChange={changeFilter} />

          <div className="min-w-0">
            <form
              role="search"
              className="relative w-full sm:max-w-md"
              onSubmit={(event) => {
                event.preventDefault()
                search(draft)
              }}
            >
              <Search
                className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
                aria-hidden="true"
              />
              <input
                type="search"
                value={draft}
                onChange={(event) => {
                  setDraft(event.target.value)
                  if (event.target.value === "" && query) search("")
                }}
                placeholder="Buscar nos processos (título e texto)"
                aria-label="Buscar processos"
                className="h-9 w-full rounded-lg border border-input bg-background pr-9 pl-9 text-sm text-foreground outline-none placeholder:text-subtle-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 [&::-webkit-search-cancel-button]:hidden"
              />
              {draft ? (
                <button
                  type="button"
                  aria-label="Limpar busca"
                  onClick={() => {
                    setDraft("")
                    search("")
                  }}
                  className="absolute top-1/2 right-2 grid size-6 -translate-y-1/2 place-content-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground"
                >
                  <X className="size-3.5" />
                </button>
              ) : null}
            </form>

            <div className={cn("transition-opacity", isSearching && "opacity-60")}>
              {searching ? (
                <section aria-label="Resultados da busca" className="mt-6">
                  <p className="text-[13px] text-muted-foreground" aria-live="polite">
                    {results.length === 0
                      ? `Nada encontrado para “${query}”${filterTitle ? ` em ${filterTitle}` : ""}.`
                      : `${results.length} ${results.length === 1 ? "resultado" : "resultados"} para “${query}”${filterTitle ? ` em ${filterTitle}` : ""}`}
                  </p>
                  <ul className="mt-2 -mx-3">
                    {results.map((doc) => (
                      <DocRow
                        key={doc.id}
                        doc={doc}
                        today={today}
                        query={query}
                        snippet={snippetById.get(doc.id) ?? null}
                      />
                    ))}
                  </ul>
                </section>
              ) : (
                <>
                  {pinned.length > 0 ? (
                    <section aria-labelledby="comece-por-aqui" className="mt-8">
                      <SectionTitle id="comece-por-aqui">Comece por aqui</SectionTitle>
                      <ul className="mt-3 grid gap-3 sm:grid-cols-2">
                        {pinned.map((doc) => (
                          <PinnedCard key={doc.id} doc={doc} today={today} />
                        ))}
                      </ul>
                    </section>
                  ) : null}

                  {filterTitle ? (
                    <h2 className="mt-8 font-display text-lg font-semibold tracking-tight text-foreground">
                      {filterTitle}
                    </h2>
                  ) : null}

                  {grouped.length === 0 ? (
                    <EmptyFilter filter={filter} onNew={() => openNewDoc(defaultsForFilter)} />
                  ) : (
                    grouped.map((group) => (
                      <section key={group.area ?? NO_AREA} aria-label={group.area ? TASK_AREA_LABEL[group.area] : "Sem área"} className="mt-8">
                        {filter.kind === "area" ? null : (
                          <SectionTitle count={group.docs.length}>
                            {group.area ? TASK_AREA_LABEL[group.area] : "Sem área"}
                          </SectionTitle>
                        )}
                        <ul className="mt-2 -mx-3">
                          {group.docs.map((doc) => (
                            <DocRow key={doc.id} doc={doc} today={today} />
                          ))}
                        </ul>
                      </section>
                    ))
                  )}

                  {filter.kind === "all" && suggestions.length > 0 ? (
                    <SuggestionsSection suggestions={suggestions} startOpen={docs.length < 4} />
                  ) : null}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      <NewDocDialog state={dialog} onOpenChange={(open) => setDialog((current) => ({ ...current, open }))} />
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Filtros                                                             */
/* ------------------------------------------------------------------ */

interface NavEntry {
  filter: Filter
  label: string
  icon: LucideIcon
  count: number
  alert?: boolean
}

function FilterNav({
  groups,
  current,
  onChange,
}: {
  groups: { label: string | null; items: NavEntry[] }[]
  current: Filter
  onChange: (filter: Filter) => void
}) {
  return (
    <nav aria-label="Filtrar documentos" className="mb-6 lg:sticky lg:top-6 lg:mb-0">
      {/* Celular e tablet: uma fileira de opções que rola para o lado. */}
      <div className="-mx-4 flex gap-1.5 overflow-x-auto px-4 pb-1 sm:-mx-6 sm:px-6 lg:hidden">
        {groups
          .flatMap((group) => group.items)
          .filter((item) => item.count > 0 || item.filter.kind === "all")
          .map((item) => {
            const active = sameFilter(item.filter, current)
            return (
              <button
                key={item.label}
                type="button"
                aria-pressed={active}
                onClick={() => onChange(item.filter)}
                className={cn(
                  "inline-flex h-8 shrink-0 items-center gap-1.5 rounded-full border px-3 text-[13px] whitespace-nowrap transition-colors",
                  active
                    ? "border-foreground/15 bg-accent font-medium text-foreground"
                    : "bg-background text-muted-foreground hover:text-foreground"
                )}
              >
                {item.alert ? <span aria-hidden="true" className="size-1.5 rounded-full bg-warning" /> : null}
                {item.label}
                <span className="text-xs text-muted-foreground tabular-nums">{item.count}</span>
              </button>
            )
          })}
      </div>

      {/* Telas grandes: lista na lateral. */}
      <div className="hidden space-y-5 lg:block">
        {groups.map((group, groupIndex) => (
          <div key={group.label ?? groupIndex}>
            {group.label ? (
              <p className="mb-1 px-2 text-[11.5px] font-medium tracking-wide text-subtle-foreground uppercase">
                {group.label}
              </p>
            ) : null}
            <ul className="space-y-0.5">
              {group.items.map((item) => {
                const active = sameFilter(item.filter, current)
                const Icon = item.icon
                return (
                  <li key={item.label}>
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => onChange(item.filter)}
                      className={cn(
                        "flex h-8 w-full items-center gap-2.5 rounded-md px-2 text-left text-[13.5px] transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        active
                          ? "bg-accent font-medium text-foreground"
                          : "text-sidebar-foreground hover:bg-accent/70 hover:text-foreground",
                        item.count === 0 && !active && "text-subtle-foreground"
                      )}
                    >
                      <Icon
                        className={cn(
                          "size-4 shrink-0",
                          active ? "text-brand-ink" : item.alert ? "text-warning" : "text-muted-foreground"
                        )}
                        aria-hidden="true"
                      />
                      <span className="min-w-0 flex-1 truncate">{item.label}</span>
                      <span className="text-xs text-muted-foreground tabular-nums">{item.count}</span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        ))}
      </div>
    </nav>
  )
}

/* ------------------------------------------------------------------ */
/* Linhas e cartões                                                    */
/* ------------------------------------------------------------------ */

function DocRow({
  doc,
  today,
  query,
  snippet,
}: {
  doc: DocSummary
  today: DateKey
  query?: string
  snippet?: string | null
}) {
  const { profiles, clientById } = useWorkspace()
  const ownerIndex = profiles.findIndex((profile) => profile.id === doc.owner_id)
  const owner = ownerIndex >= 0 ? profiles[ownerIndex] : undefined
  const status = effectiveStatus(doc, today)
  const clientName = doc.client_id ? clientById.get(doc.client_id)?.name : undefined
  const secondary = query && snippet ? snippet : doc.summary

  return (
    <li>
      <Link
        href={`/processos/${doc.id}`}
        className="flex w-full items-start gap-3 rounded-lg px-3 py-2.5 transition-colors outline-none hover:bg-muted/60 focus-visible:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <DocKindTile kind={doc.kind} className="mt-0.5" />
        <span className="min-w-0 flex-1">
          <span className="flex min-w-0 items-center gap-2">
            <span className="truncate text-sm font-medium text-foreground">
              {query ? <Highlight text={doc.title} query={query} /> : doc.title}
            </span>
            {doc.pinned ? <Pin className="size-3.5 shrink-0 text-muted-foreground" aria-label="Fixado" /> : null}
            {status !== "active" ? <DocStatusBadge doc={doc} today={today} /> : null}
          </span>
          {secondary ? (
            <span className="mt-0.5 line-clamp-2 text-[13px] leading-5 text-muted-foreground sm:line-clamp-1">
              {query ? <Highlight text={secondary} query={query} /> : secondary}
            </span>
          ) : null}
          <span className="mt-1 flex flex-wrap items-center gap-x-1.5 text-xs text-subtle-foreground sm:hidden">
            {DOC_KIND_LABEL[doc.kind]}
            {clientName ? <> · {clientName}</> : null}
            {owner ? <> · {firstName(owner.full_name)}</> : null}
          </span>
        </span>
        <span className="mt-0.5 hidden shrink-0 items-center gap-3 text-xs text-muted-foreground sm:flex">
          {clientName ? (
            <span className="inline-flex max-w-36 items-center gap-1 truncate">
              <Building2 className="size-3.5 shrink-0" aria-hidden="true" />
              <span className="truncate">{clientName}</span>
            </span>
          ) : null}
          <span className="min-w-28 text-right whitespace-nowrap tabular-nums">
            Editado {sinceLabel(doc.content_updated_at, today)}
          </span>
          {owner ? (
            <PersonAvatar
              name={owner.full_name}
              avatarUrl={owner.avatar_url}
              colorIndex={ownerIndex}
              size="sm"
              className="size-6 [&_[data-slot=avatar-fallback]]:text-[10px]"
            />
          ) : (
            <span className="size-6" aria-hidden="true" />
          )}
        </span>
      </Link>
    </li>
  )
}

function PinnedCard({ doc, today }: { doc: DocSummary; today: DateKey }) {
  const Icon = DOC_KIND_ICON[doc.kind]
  return (
    <li>
      <Link
        href={`/processos/${doc.id}`}
        className="group relative flex h-full flex-col rounded-xl border bg-card px-4 py-3.5 transition-colors outline-none hover:border-foreground/15 hover:bg-muted/30 focus-visible:ring-[3px] focus-visible:ring-ring/40"
      >
        <span className="flex items-center gap-2 text-xs text-muted-foreground">
          <Icon className="size-3.5" aria-hidden="true" />
          {DOC_KIND_LABEL[doc.kind]}
          {doc.area ? <> · {TASK_AREA_LABEL[doc.area]}</> : null}
          {effectiveStatus(doc, today) !== "active" ? (
            <DocStatusBadge doc={doc} today={today} className="ml-auto" />
          ) : null}
        </span>
        <span className="mt-2 font-display text-[15px] leading-6 font-semibold tracking-tight text-foreground">
          {doc.title}
        </span>
        {doc.summary ? (
          <span className="mt-1 line-clamp-2 text-[13px] leading-5 text-muted-foreground">{doc.summary}</span>
        ) : null}
      </Link>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Vazios e sugestões                                                  */
/* ------------------------------------------------------------------ */

type IndexedSuggestion = (typeof SUGGESTIONS)[number] & { index: number }

function useCreateFromSuggestion() {
  const router = useRouter()
  const [pendingIndex, setPendingIndex] = useState<number | null>(null)
  const [, startTransition] = useTransition()

  function create(suggestion: IndexedSuggestion) {
    if (pendingIndex !== null) return
    setPendingIndex(suggestion.index)
    startTransition(async () => {
      const result = await createDoc({ title: suggestion.title, suggestion: suggestion.index })
      if (!result.ok) {
        setPendingIndex(null)
        toast.error(result.error)
        return
      }
      toast.success("Documento criado", { description: suggestion.title })
      router.push(`/processos/${result.data.id}`)
    })
  }

  return { create, pendingIndex }
}

function EmptyLibrary({ suggestions, onNew }: { suggestions: IndexedSuggestion[]; onNew: () => void }) {
  const { create, pendingIndex } = useCreateFromSuggestion()
  return (
    <section aria-labelledby="comecar" className="mt-8">
      <div className="relative overflow-hidden rounded-xl border bg-card px-5 py-6 pl-6 sm:px-7">
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-1 bg-brand" />
        <h2 id="comecar" className="font-display text-xl leading-7 font-semibold tracking-tight text-foreground">
          A documentação da Boop começa aqui
        </h2>
        <p className="mt-1.5 max-w-2xl text-sm leading-6 text-muted-foreground">
          Cada processo escrito uma vez vira referência para sempre: quem entra aprende sozinho, ninguém
          depende da memória de ninguém, e um checklist vira tarefas com um clique. Comece por uma sugestão
          abaixo (já vem com estrutura) ou crie do zero.
        </p>
        <Button onClick={onNew} variant="outline" className="mt-4 gap-1.5 shadow-none">
          <Plus />
          Criar do zero
        </Button>
      </div>

      <SectionTitle className="mt-10">Sugestões para começar</SectionTitle>
      <ul className="mt-3 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {suggestions.map((suggestion) => {
          const Icon = DOC_KIND_ICON[suggestion.kind]
          return (
            <li key={suggestion.index} className="flex flex-col rounded-xl border bg-card px-4 py-3.5">
              <span className="flex items-center gap-2 text-xs text-muted-foreground">
                <Icon className="size-3.5" aria-hidden="true" />
                {DOC_KIND_LABEL[suggestion.kind]} · {TASK_AREA_LABEL[suggestion.area]}
                {suggestion.pinned ? (
                  <span className="ml-auto inline-flex items-center gap-1 text-brand-ink">
                    <Sparkles className="size-3" aria-hidden="true" />
                    Comece por este
                  </span>
                ) : null}
              </span>
              <span className="mt-2 text-sm font-semibold text-foreground">{suggestion.title}</span>
              <span className="mt-1 flex-1 text-[13px] leading-5 text-muted-foreground">{suggestion.summary}</span>
              <Button
                variant="outline"
                size="sm"
                onClick={() => create(suggestion)}
                disabled={pendingIndex !== null}
                className="mt-3 w-fit gap-1.5 shadow-none"
              >
                <Plus />
                {pendingIndex === suggestion.index ? "Criando…" : "Criar"}
              </Button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function SuggestionsSection({ suggestions, startOpen }: { suggestions: IndexedSuggestion[]; startOpen: boolean }) {
  const [open, setOpen] = useState(startOpen)
  const { create, pendingIndex } = useCreateFromSuggestion()
  return (
    <section aria-labelledby="sugestoes" className="mt-12 border-t pt-6">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
        className="flex items-center gap-2 rounded-md text-sm font-semibold text-foreground outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <Sparkles className="size-4 text-brand-ink" aria-hidden="true" />
        <span id="sugestoes">Sugestões para documentar</span>
        <span className="text-[13px] font-normal text-muted-foreground tabular-nums">{suggestions.length}</span>
        <ChevronDown className={cn("size-4 text-muted-foreground transition-transform", open && "rotate-180")} />
      </button>
      {open ? (
        <ul className="mt-2 -mx-3">
          {suggestions.map((suggestion) => {
            const Icon = DOC_KIND_ICON[suggestion.kind]
            return (
              <li key={suggestion.index} className="flex items-center gap-3 rounded-lg px-3 py-2">
                <span
                  aria-hidden="true"
                  className="grid size-8 shrink-0 place-content-center rounded-lg border border-dashed text-subtle-foreground"
                >
                  <Icon className="size-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm text-foreground">{suggestion.title}</span>
                  <span className="block truncate text-[13px] text-muted-foreground">{suggestion.summary}</span>
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => create(suggestion)}
                  disabled={pendingIndex !== null}
                  className="shrink-0 gap-1"
                >
                  <Plus />
                  {pendingIndex === suggestion.index ? "Criando…" : "Criar"}
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}
    </section>
  )
}

function EmptyFilter({ filter, onNew }: { filter: Filter; onNew: () => void }) {
  const message =
    filter.kind === "review"
      ? "Nada para revisar. Tudo em dia."
      : filter.kind === "drafts"
        ? "Nenhum rascunho."
        : "Nenhum documento aqui ainda."
  return (
    <div className="mt-6 rounded-xl border border-dashed px-6 py-10 text-center">
      <p className="text-sm font-medium text-foreground">{message}</p>
      {filter.kind === "area" || filter.kind === "client" ? (
        <Button onClick={onNew} variant="outline" size="sm" className="mt-4 gap-1.5 shadow-none">
          <Plus />
          Novo documento
        </Button>
      ) : null}
    </div>
  )
}
