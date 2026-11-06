"use client"

import {
  Building2,
  CalendarDays,
  CircleDashed,
  Columns3,
  FolderKanban,
  List,
  ListChecks,
  Plus,
  SearchX,
  Table2,
  Tag,
  X,
} from "lucide-react"
import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useEffectEvent, type ReactNode } from "react"

import { EmptyPanel } from "@/components/empty-panel"
import { PageBody, PageContainer, PageHeader, PageToolbar } from "@/components/layout/page"
import { PILL_ACTIVE, PillIndicator } from "@/components/pill-indicator"
import { SegmentedControl } from "@/components/segmented-control"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { compareProjects, isOpenProject } from "@/features/projects/logic"
import { filtersFromSearchParams, filtersToQuery, viewModeFromSearchParams } from "@/features/tasks/filters"
import {
  dayContext,
  DEFAULT_FILTERS,
  filterTasks,
  firstName,
  groupTasks,
  hasActiveFilters,
  isDone,
  TASK_GROUP_LABEL,
  TASK_GROUP_ORDER,
  type DueFilter,
  type StatusFilter,
  type TaskFilters,
  type TaskViewMode,
} from "@/features/tasks/logic"
import { NewTaskButton, useNewTask } from "@/features/tasks/new-task-dialog"
import { TaskBoard } from "@/features/tasks/task-board"
import { TaskSection } from "@/features/tasks/task-section"
import { TaskTable } from "@/features/tasks/task-table"
import { useTasks } from "@/features/tasks/tasks-provider"
import { SavedViewsBar } from "@/features/views/saved-views-bar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { useViewFade } from "@/hooks/use-view-fade"
import { TASK_AREA_LABEL, TASK_AREAS } from "@/lib/labels"
import type { TaskArea } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "open", label: "Abertas" },
  { value: "todo", label: "A fazer" },
  { value: "doing", label: "Fazendo" },
  { value: "done", label: "Concluídas" },
  { value: "all", label: "Todos os status" },
]

const DUE_OPTIONS: { value: DueFilter; label: string }[] = [
  { value: "any", label: "Qualquer prazo" },
  { value: "overdue", label: "Atrasadas" },
  { value: "today", label: "Hoje" },
  { value: "week", label: "Esta semana" },
  { value: "later", label: "Depois" },
  { value: "undated", label: "Sem prazo" },
]

const AREA_OPTIONS: { value: TaskArea | "all"; label: string }[] = [
  { value: "all", label: "Todas as áreas" },
  ...TASK_AREAS.map((area) => ({ value: area, label: TASK_AREA_LABEL[area] })),
]

const VIEW_OPTIONS: { value: TaskViewMode; label: string; icon: ReactNode }[] = [
  { value: "list", label: "Lista", icon: <List /> },
  { value: "table", label: "Tabela", icon: <Table2 /> },
  { value: "board", label: "Quadro", icon: <Columns3 /> },
]

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function TasksView() {
  const { tasks, today, keepInPlace, openTask } = useTasks()
  const { currentUser, profiles, clients, projects } = useWorkspace()
  const { openNewTask } = useNewTask()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // ?tarefa=<id> (busca geral): abre o painel da tarefa e limpa a URL.
  const taskParam = searchParams.get("tarefa")
  const openFromUrl = useEffectEvent((id: string) => {
    if (tasks.some((task) => task.id === id)) openTask(id)
    const params = new URLSearchParams(window.location.search)
    params.delete("tarefa")
    const rest = params.toString()
    window.history.replaceState(null, "", rest ? `${pathname}?${rest}` : pathname)
  })
  useEffect(() => {
    if (taskParam) openFromUrl(taskParam)
  }, [taskParam])

  // A URL é a fonte da verdade dos filtros; valores desconhecidos voltam ao padrão.
  const params = Object.fromEntries(searchParams)
  const parsed = filtersFromSearchParams(params)
  const view = viewModeFromSearchParams(params)
  const bodyRef = useViewFade(`${view}:${parsed.person}`)
  const filters: TaskFilters = {
    ...parsed,
    person:
      parsed.person === "mine" || profiles.some((profile) => profile.id === parsed.person)
        ? parsed.person
        : DEFAULT_FILTERS.person,
    client: clients.some((client) => client.id === parsed.client) ? parsed.client : DEFAULT_FILTERS.client,
    project:
      parsed.project === "none" || projects.some((project) => project.id === parsed.project)
        ? parsed.project
        : DEFAULT_FILTERS.project,
  }
  const query = filtersToQuery(filters, view)

  function navigate(next: string) {
    window.history.replaceState(null, "", next ? `${pathname}?${next}` : pathname)
  }

  function update(patch: Partial<TaskFilters>, nextView: TaskViewMode = view) {
    navigate(filtersToQuery({ ...filters, ...patch }, nextView))
  }

  function clearFilters() {
    update({
      status: DEFAULT_FILTERS.status,
      area: DEFAULT_FILTERS.area,
      client: DEFAULT_FILTERS.client,
      project: DEFAULT_FILTERS.project,
      due: DEFAULT_FILTERS.due,
    })
  }

  const ctx = dayContext(today)
  // O quadro mostra todos os status (as colunas são o status).
  const visible = filterTasks(tasks, filters, ctx, currentUser.id, keepInPlace, { ignoreStatus: view === "board" })
  const groups = groupTasks(visible, ctx, keepInPlace)
  const openCount = visible.filter((task) => !isDone(task)).length
  const overdueCount = groups.overdue.filter((task) => !isDone(task)).length
  const sections = TASK_GROUP_ORDER.filter((key) => groups[key].length > 0)

  const selectedPerson = profiles.find((profile) => profile.id === filters.person)
  const selectedProject = projects.find((project) => project.id === filters.project)
  const newTaskDefaults = {
    ...(selectedPerson ? { assignee_ids: [selectedPerson.id] } : {}),
    ...(selectedProject ? { project_id: selectedProject.id, client_id: selectedProject.client_id } : {}),
  }
  const personOptions = [
    { value: "all", label: "Todas" },
    { value: "mine", label: "Minhas" },
    ...profiles.map((profile) => ({ value: profile.id, label: firstName(profile.full_name) })),
  ]
  const clientOptions = [
    { value: "all", label: "Todos os clientes" },
    ...clients.map((client) => ({ value: client.id, label: client.name })),
  ]
  const projectOptions = [
    { value: "all", label: "Todos os projetos" },
    { value: "none", label: "Sem projeto" },
    ...projects
      .filter((project) => isOpenProject(project) || project.id === filters.project)
      .sort(compareProjects)
      .map((project) => ({ value: project.id, label: project.name })),
  ]

  const summary = [
    countLabel(openCount, "aberta", "abertas"),
    overdueCount > 0 ? countLabel(overdueCount, "atrasada", "atrasadas") : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const filtered = hasActiveFilters(filters) || filters.person !== DEFAULT_FILTERS.person
  const isEmpty = view === "list" ? sections.length === 0 : visible.length === 0

  // Contadores do painel: as abertas de cada prazo, com os outros filtros (pessoa, projeto, cliente e área).
  const pulseGroups = groupTasks(
    filterTasks(tasks, { ...filters, status: "open", due: "any" }, ctx, currentUser.id),
    ctx
  )
  const pulse: { due: DueFilter; label: string; count: number; alert?: boolean }[] = [
    { due: "overdue", label: "Atrasadas", count: pulseGroups.overdue.length, alert: pulseGroups.overdue.length > 0 },
    { due: "today", label: "Hoje", count: pulseGroups.today.length },
    { due: "week", label: "Esta semana", count: pulseGroups.week.length },
    { due: "later", label: "Depois", count: pulseGroups.later.length },
    { due: "undated", label: "Sem prazo", count: pulseGroups.undated.length },
  ]
  const title =
    filters.person === "mine" ? (
      <>
        Minhas <em>tarefas</em>
      </>
    ) : selectedPerson ? (
      <>
        Tarefas de <em>{firstName(selectedPerson.full_name)}</em>
      </>
    ) : (
      <>
        Todas as <em>tarefas</em>
      </>
    )

  return (
    <PageContainer>
      <PageHeader title={title} description={summary} actions={<NewTaskButton defaults={newTaskDefaults} />} />

      <TaskPulse
        items={pulse}
        active={filters.due}
        onSelect={(due) => update({ due: filters.due === due ? DEFAULT_FILTERS.due : due, ...(filters.status === "done" ? { status: DEFAULT_FILTERS.status } : {}) })}
      />

      <PageToolbar className="flex-col items-stretch gap-y-3">
        <div className="flex items-center gap-2">
          <div className="-ml-4 flex min-w-0 flex-1 items-center overflow-x-auto pl-4 pb-0.5 sm:ml-0 sm:pl-0">
            <SegmentedControl
              aria-label="Pessoa"
              value={filters.person}
              onValueChange={(person) => update({ person })}
              options={personOptions}
            />
          </div>
          <ViewSwitch value={view} onChange={(next) => update({}, next)} />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {view !== "board" ? (
            <FilterSelect
              ariaLabel="Status"
              icon={<CircleDashed />}
              value={filters.status}
              defaultValue={DEFAULT_FILTERS.status}
              options={STATUS_OPTIONS}
              onChange={(status) => update({ status })}
            />
          ) : null}
          <FilterSelect
            ariaLabel="Projeto"
            icon={<FolderKanban />}
            value={filters.project}
            defaultValue={DEFAULT_FILTERS.project}
            options={projectOptions}
            onChange={(project) => update({ project })}
          />
          <FilterSelect
            ariaLabel="Cliente"
            icon={<Building2 />}
            value={filters.client}
            defaultValue={DEFAULT_FILTERS.client}
            options={clientOptions}
            onChange={(client) => update({ client })}
          />
          <FilterSelect
            ariaLabel="Área"
            icon={<Tag />}
            value={filters.area}
            defaultValue={DEFAULT_FILTERS.area}
            options={AREA_OPTIONS}
            onChange={(area) => update({ area })}
          />
          <FilterSelect
            ariaLabel="Prazo"
            icon={<CalendarDays />}
            value={filters.due}
            defaultValue={DEFAULT_FILTERS.due}
            options={DUE_OPTIONS}
            onChange={(due) => update({ due })}
          />
          {hasActiveFilters(filters) ? (
            <Button variant="ghost" size="sm" className="gap-1 text-muted-foreground" onClick={clearFilters}>
              <X className="size-3.5" />
              Limpar filtros
            </Button>
          ) : null}
          <SavedViewsBar query={query} onApply={navigate} className="basis-full 2xl:ml-auto 2xl:basis-auto" />
        </div>
      </PageToolbar>

      <PageBody ref={bodyRef}>
        {isEmpty ? (
          <EmptyState
            filtered={filtered}
            onClear={() => update({ ...DEFAULT_FILTERS })}
            onCreate={() => openNewTask(newTaskDefaults)}
          />
        ) : view === "table" ? (
          <TaskTable tasks={visible} />
        ) : view === "board" ? (
          <TaskBoard tasks={visible} />
        ) : (
          sections.map((key) => (
            <TaskSection
              key={key}
              id={key}
              title={TASK_GROUP_LABEL[key]}
              tone={key === "overdue" ? "danger" : "default"}
              tasks={groups[key]}
              showDue={key !== "today"}
            />
          ))
        )}
      </PageBody>
    </PageContainer>
  )
}

/** Lista, Tabela ou Quadro (ícones; o nome aparece para leitores de tela). */
function ViewSwitch({ value, onChange }: { value: TaskViewMode; onChange: (view: TaskViewMode) => void }) {
  return (
    <div role="radiogroup" aria-label="Modo de exibição" className="group/pill relative flex shrink-0 rounded-full border border-glass-edge bg-card p-1 shadow-[inset_0_1px_0_var(--glass-highlight)]">
      <PillIndicator selector="[aria-checked=true]" active={value} />
      {VIEW_OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          role="radio"
          aria-checked={value === option.value}
          title={option.label}
          onClick={() => onChange(option.value)}
          className={cn(
            "relative inline-flex h-8 items-center gap-1.5 rounded-full px-3 text-[13px] font-medium text-muted-foreground outline-none transition-colors hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 [&_svg]:size-3.5",
            value === option.value && PILL_ACTIVE
          )}
        >
          {option.icon}
          <span className="hidden sm:inline">{option.label}</span>
          <span className="sr-only sm:hidden">{option.label}</span>
        </button>
      ))}
    </div>
  )
}

function FilterSelect<T extends string>({
  ariaLabel,
  icon,
  value,
  defaultValue,
  options,
  onChange,
}: {
  ariaLabel: string
  icon: ReactNode
  value: T
  defaultValue: T
  options: { value: T; label: string }[]
  onChange: (value: T) => void
}) {
  const active = value !== defaultValue
  return (
    <Select
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next)
        if (option) onChange(option.value)
      }}
    >
      <SelectTrigger
        size="sm"
        aria-label={ariaLabel}
        className={cn(
          "h-8 max-w-[220px] gap-1.5 rounded-full border-glass-edge bg-card px-3 text-[13px] shadow-[inset_0_1px_0_var(--glass-highlight)] transition-[border-color,background-color,box-shadow] hover:border-foreground/20 [&>svg:first-child]:size-3.5 [&_[data-slot=select-value]]:truncate",
          active &&
            "border-glow/50 bg-glow-soft font-medium text-foreground shadow-[inset_0_1px_0_var(--glass-highlight),0_0_0_3px_var(--glow-soft)] hover:border-glow/70 [&>svg:first-child]:text-brand-ink"
        )}
      >
        {icon}
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-h-80">
        {options.map((option) => (
          <SelectItem key={option.value} value={option.value}>
            {option.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

function EmptyState({
  filtered,
  onClear,
  onCreate,
}: {
  filtered: boolean
  onClear: () => void
  onCreate: () => void
}) {
  return (
    <EmptyPanel
      icon={filtered ? SearchX : ListChecks}
      title={
        filtered ? (
          <>
            Nenhuma tarefa com <em className="emphasis pr-[0.04em] text-[1.12em] text-brand-ink">esses</em> filtros
          </>
        ) : (
          <>
            Tudo em <em className="emphasis pr-[0.04em] text-[1.12em] text-brand-ink">dia</em>
          </>
        )
      }
      action={
        <>
          {filtered ? (
            <Button variant="outline" onClick={onClear}>
              Limpar filtros
            </Button>
          ) : null}
          <Button onClick={onCreate} className="gap-1.5">
            <Plus />
            Nova tarefa
          </Button>
        </>
      }
    >
      {filtered
        ? "Ajuste ou limpe os filtros para ver mais tarefas."
        : "Nenhuma tarefa aberta. Crie uma quando surgir algo novo (atalho N)."}
    </EmptyPanel>
  )
}

/**
 * Painel de destaque da tela: as abertas por prazo, com o número grande.
 * Cada número filtra a lista por aquele prazo (clicar de novo tira o filtro).
 */
function TaskPulse({
  items,
  active,
  onSelect,
}: {
  items: { due: DueFilter; label: string; count: number; alert?: boolean }[]
  active: DueFilter
  onSelect: (due: DueFilter) => void
}) {
  return (
    <section aria-label="Abertas por prazo" className="relative isolate mt-5 overflow-hidden rounded-[1.75rem] glass-panel p-1.5">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -top-24 right-[12%] -z-10 h-48 w-96 rounded-full bg-glow-soft blur-3xl"
      />
      <div className="grid grid-cols-2 gap-1 sm:grid-cols-5">
        {items.map((item, index) => {
          const selected = active === item.due
          return (
            <button
              key={item.due}
              type="button"
              aria-pressed={selected}
              onClick={() => onSelect(item.due)}
              className={cn(
                "group/pulse relative flex flex-col items-start rounded-[1.35rem] px-4 pt-2.5 pb-3 text-left outline-none transition-[background-color,box-shadow] duration-150 hover:bg-foreground/[0.04] focus-visible:ring-[3px] focus-visible:ring-ring/40",
                index === items.length - 1 && "max-sm:col-span-2",
                selected && "bg-glow-soft shadow-[inset_0_0_0_1px_rgb(61_126_255/0.45)] hover:bg-glow-soft"
              )}
            >
              <span className="flex items-center gap-1.5 eyebrow text-muted-foreground">
                {item.alert ? (
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-overdue shadow-[0_0_8px_var(--overdue)]" />
                ) : selected ? (
                  <span aria-hidden="true" className="size-1.5 rounded-full bg-glow shadow-[0_0_8px_var(--glow)]" />
                ) : null}
                {item.label}
              </span>
              <span
                className={cn(
                  "mt-1 display-number text-[36px] leading-[0.9] sm:text-[42px]",
                  item.alert ? "text-overdue" : item.count === 0 ? "text-subtle-foreground" : "text-foreground"
                )}
              >
                {item.count}
              </span>
            </button>
          )
        })}
      </div>
    </section>
  )
}
