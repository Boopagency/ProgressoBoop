"use client"

import { Building2, ChevronDown, Clapperboard, Layers, Plus, Share2, UserRound } from "lucide-react"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useEffectEvent, useOptimistic, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { KpiTile } from "@/components/kpi-tile"
import { PageContainer, PageHeader } from "@/components/layout/page"
import { SegmentedControl } from "@/components/segmented-control"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { loadPost, updatePost } from "@/features/content/actions"
import { ContentBoard } from "@/features/content/content-board"
import { ContentCalendar } from "@/features/content/content-calendar"
import {
  contentQuery,
  EMPTY_FILTERS,
  hasActiveFilters,
  parseContentParams,
  toContentFilters,
  type ContentUrlFilters,
  type ContentUrlState,
  type ContentViewMode,
} from "@/features/content/filters"
import { filterPosts, isBlocked, isLate, postsInRange, type PostSummary } from "@/features/content/logic"
import { PostDialog, usePostDialog } from "@/features/content/post-dialog"
import { ClientMark, StageDot } from "@/features/content/post-meta"
import { UpcomingList } from "@/features/content/upcoming-list"
import { firstName } from "@/features/tasks/logic"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { useUrlTrigger } from "@/hooks/use-url-trigger"
import { weekRangeOf } from "@/lib/dates"
import {
  CONTENT_FORMAT_LABEL,
  CONTENT_FORMATS,
  CONTENT_NETWORK_LABEL,
  CONTENT_NETWORKS,
  CONTENT_STAGE_LABEL,
  CONTENT_STAGES,
} from "@/lib/labels"
import type { ContentStage } from "@/lib/types"
import { cn, isUuid } from "@/lib/utils"

const VIEW_OPTIONS: { value: ContentViewMode; label: string }[] = [
  { value: "calendar", label: "Calendário" },
  { value: "board", label: "Quadro" },
  { value: "list", label: "7 dias" },
]

/**
 * Tela Conteúdo: os posts de todos os clientes juntos, em calendário, quadro
 * por etapa ou nos próximos 7 dias. Filtros e visão ficam na URL.
 */
export function ContentView({ posts }: { posts: PostSummary[] }) {
  const { today } = useTasks()
  const { currentUser, profiles, clients } = useWorkspace()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const dialog = usePostDialog()
  const [, startTransition] = useTransition()
  const [optimistic, moveOptimistic] = useOptimistic(posts, (current: PostSummary[], change: { id: string; stage: ContentStage }) =>
    current.map((post) => (post.id === change.id ? { ...post, stage: change.stage } : post))
  )

  // A URL é a fonte da verdade; cliente e pessoa desconhecidos voltam ao padrão.
  const parsed = parseContentParams(Object.fromEntries(searchParams))
  const state: ContentUrlState = {
    ...parsed,
    filters: {
      ...parsed.filters,
      clients: parsed.filters.clients.filter((id) => clients.some((client) => client.id === id)),
      person:
        parsed.filters.person === "mine" || profiles.some((profile) => profile.id === parsed.filters.person)
          ? parsed.filters.person
          : EMPTY_FILTERS.person,
    },
  }
  const { filters } = state

  function navigate(next: ContentUrlState) {
    const query = contentQuery(next)
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname)
  }

  function update(patch: Partial<ContentUrlFilters>) {
    navigate({ ...state, filters: { ...filters, ...patch } })
  }

  function openNew(publishOn?: string) {
    dialog.openNew({ client_id: filters.clients.length === 1 ? filters.clients[0] : null, publish_on: publishOn ?? null })
  }

  // ?novo=<marca> (busca geral): abre o post novo.
  useUrlTrigger(() => openNew())

  // ?post=<id> (tela Hoje, tarefa gerada): abre o post e limpa a URL.
  const postParam = searchParams.get("post")
  const openFromUrl = useEffectEvent((id: string) => {
    const found = optimistic.find((post) => post.id === id)
    if (found) dialog.openPost(found)
    else if (isUuid(id)) {
      // Fora do período carregado (publicado há muito tempo): busca o post.
      void loadPost(id).then((result) => {
        if (result.ok) dialog.openPost(result.data)
        else toast.error(result.error)
      })
    }
    const params = new URLSearchParams(window.location.search)
    params.delete("post")
    const rest = params.toString()
    window.history.replaceState(null, "", rest ? `${pathname}?${rest}` : pathname)
  })
  useEffect(() => {
    if (postParam) openFromUrl(postParam)
  }, [postParam])

  function move(id: string, stage: ContentStage) {
    const post = optimistic.find((candidate) => candidate.id === id)
    if (!post || post.stage === stage) return
    startTransition(async () => {
      moveOptimistic({ id, stage })
      const result = await updatePost(id, { stage })
      if (!result.ok) toast.error(result.error)
      else if (stage === "published") toast.success("Post publicado", { description: post.title })
    })
  }

  const visible = filterPosts(optimistic, toContentFilters(filters, currentUser.id))
  const week = postsInRange(visible, weekRangeOf(today))
  const late = visible.filter((post) => isLate(post, today))
  const awaiting = visible.filter((post) => post.stage === "client_review")
  const blocked = visible.filter((post) => post.stage !== "published" && isBlocked(post))
  const publishedThisWeek = week.filter((post) => post.stage === "published").length

  const clientOptions = clients
    .filter((client) => client.active || filters.clients.includes(client.id))
    .map((client) => ({ value: client.id, label: client.name, leading: <ClientMark clientId={client.id} size="xs" /> }))

  return (
    <PageContainer className="@container">
      <PageHeader
        title="Conteúdo"
        description="Os posts de todos os clientes: calendário, etapas e o que falta produzir"
        actions={
          <Button onClick={() => openNew()} className="gap-1.5">
            <Plus />
            Novo post
          </Button>
        }
      />

      <section aria-label="Números do conteúdo" className="mt-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <KpiTile
          label="Nesta semana"
          value={`${week.length} ${week.length === 1 ? "post" : "posts"}`}
          hint={`${publishedThisWeek} ${publishedThisWeek === 1 ? "publicado" : "publicados"}`}
          onSelect={() => navigate({ ...state, view: "calendar", calendar: "week", anchor: null })}
        />
        <KpiTile
          label="Atrasados"
          value={late.length}
          alert={late.length > 0}
          hint="a data passou e não foi programado"
          onSelect={() => navigate({ ...state, view: "list" })}
        />
        <KpiTile
          label="Aguardando cliente"
          value={awaiting.length}
          hint="para aprovar"
          onSelect={() => navigate({ ...state, view: "board" })}
        />
        <KpiTile
          label="Falta material"
          value={blocked.length}
          hint="alguma frente parada pelo cliente"
          onSelect={() => navigate({ ...state, view: "board" })}
        />
      </section>

      <div className="mt-6 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <SegmentedControl
          aria-label="Visualização"
          value={state.view}
          onValueChange={(view) => navigate({ ...state, view })}
          options={VIEW_OPTIONS}
          className="self-start"
        />
        <div className="flex flex-wrap items-center gap-2">
          <MultiFilter
            label="Clientes"
            plural="clientes"
            icon={<Building2 />}
            options={clientOptions}
            value={filters.clients}
            onChange={(next) => update({ clients: next })}
          />
          <Select value={filters.person} onValueChange={(person) => update({ person })}>
            <SelectTrigger
              size="sm"
              aria-label="Responsável"
              className={cn(
                "h-8 max-w-[200px] gap-1.5 rounded-md px-2.5 text-[13px] shadow-none [&>svg:first-child]:size-3.5",
                filters.person !== EMPTY_FILTERS.person && "border-foreground/20 bg-accent font-medium text-foreground"
              )}
            >
              <UserRound />
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="mine">Meus</SelectItem>
              {profiles
                .filter((profile) => profile.id !== currentUser.id)
                .map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {firstName(profile.full_name)}
                  </SelectItem>
                ))}
            </SelectContent>
          </Select>
          <MultiFilter
            label="Redes"
            plural="redes"
            icon={<Share2 />}
            options={CONTENT_NETWORKS.map((network) => ({ value: network, label: CONTENT_NETWORK_LABEL[network] }))}
            value={filters.networks}
            onChange={(next) => update({ networks: next })}
          />
          <MultiFilter
            label="Formatos"
            plural="formatos"
            icon={<Clapperboard />}
            options={CONTENT_FORMATS.map((format) => ({ value: format, label: CONTENT_FORMAT_LABEL[format] }))}
            value={filters.formats}
            onChange={(next) => update({ formats: next })}
          />
          <MultiFilter
            label="Etapas"
            plural="etapas"
            icon={<Layers />}
            options={CONTENT_STAGES.map((stage) => ({ value: stage, label: CONTENT_STAGE_LABEL[stage], leading: <StageDot stage={stage} /> }))}
            value={filters.stages}
            onChange={(next) => update({ stages: next })}
          />
          {hasActiveFilters(filters) ? (
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={() => update(EMPTY_FILTERS)}>
              Limpar filtros
            </Button>
          ) : null}
        </div>
      </div>

      {posts.length === 0 ? (
        <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
          <h2 className="text-sm font-semibold">Planeje aqui os posts de todos os clientes</h2>
          <p className="mt-1 max-w-md text-sm text-muted-foreground">
            Cada post tem cliente, formato, redes, data, etapa e o que falta em copy, design e vídeo. As frentes viram
            tarefas com prazo antes da publicação.
          </p>
          <Button size="sm" className="mt-5" onClick={() => openNew()}>
            Primeiro post
          </Button>
        </div>
      ) : state.view === "board" ? (
        <ContentBoard posts={visible} today={today} onOpen={dialog.openPost} onMove={move} />
      ) : state.view === "list" ? (
        <UpcomingList posts={visible} today={today} onOpen={dialog.openPost} />
      ) : (
        <ContentCalendar
          posts={visible}
          today={today}
          mode={state.calendar}
          anchor={state.anchor}
          onNavigate={(next) => navigate({ ...state, calendar: next.mode ?? state.calendar, anchor: next.anchor === undefined ? state.anchor : next.anchor })}
          onOpen={dialog.openPost}
          onCreate={(day) => openNew(day)}
        />
      )}

      <PostDialog state={dialog.state} onOpenChange={dialog.onOpenChange} />
    </PageContainer>
  )
}

/** Filtro de vários valores (clientes, redes, formatos, etapas). */
function MultiFilter<T extends string>({
  label,
  plural,
  icon,
  options,
  value,
  onChange,
}: {
  label: string
  plural: string
  icon: ReactNode
  options: { value: T; label: string; leading?: ReactNode }[]
  value: T[]
  onChange: (value: T[]) => void
}) {
  const active = value.length > 0
  const text =
    value.length === 0
      ? label
      : value.length === 1
        ? (options.find((option) => option.value === value[0])?.label ?? label)
        : `${value.length} ${plural}`

  function toggle(option: T, checked: boolean) {
    const next = checked ? [...value, option] : value.filter((current) => current !== option)
    // Na ordem das opções, para a URL ficar estável.
    onChange(options.filter((candidate) => next.includes(candidate.value)).map((candidate) => candidate.value))
  }

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`${label}: ${active ? text : "todos"}`}
          className={cn(
            "inline-flex h-8 max-w-[220px] items-center gap-1.5 rounded-md border border-input bg-background px-2.5 text-[13px] text-foreground outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:bg-accent [&_svg]:size-3.5 [&_svg]:shrink-0 [&_svg]:text-muted-foreground",
            active && "border-foreground/20 bg-accent font-medium"
          )}
        >
          {icon}
          <span className="truncate">{text}</span>
          <ChevronDown className="opacity-60" />
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-60 p-1">
        <div className="max-h-72 overflow-y-auto">
          {options.map((option) => (
            <label
              key={option.value}
              className="flex cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-[13px] text-foreground hover:bg-accent"
            >
              <Checkbox checked={value.includes(option.value)} onCheckedChange={(state) => toggle(option.value, state === true)} />
              {option.leading}
              <span className="truncate">{option.label}</span>
            </label>
          ))}
        </div>
        {active ? (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1 w-full rounded-sm border-t px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          >
            Limpar
          </button>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
