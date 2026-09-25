"use client"

import { Building2, CalendarDays, CircleDashed, ListChecks, Tag } from "lucide-react"
import { usePathname, useSearchParams } from "next/navigation"
import type { ReactNode } from "react"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { SegmentedControl } from "@/components/segmented-control"
import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { filtersFromSearchParams, filtersToQuery } from "@/features/tasks/filters"
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
} from "@/features/tasks/logic"
import { NewTaskButton, useNewTask } from "@/features/tasks/new-task-dialog"
import { TaskSection } from "@/features/tasks/task-section"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
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

function countLabel(count: number, singular: string, plural: string): string {
  return `${count} ${count === 1 ? singular : plural}`
}

export function TasksView() {
  const { tasks, today, keepInPlace } = useTasks()
  const { currentUser, profiles, clients } = useWorkspace()
  const { openNewTask } = useNewTask()
  const pathname = usePathname()
  const searchParams = useSearchParams()

  // A URL é a fonte da verdade dos filtros; valores desconhecidos voltam ao padrão.
  const parsed = filtersFromSearchParams(Object.fromEntries(searchParams))
  const filters: TaskFilters = {
    ...parsed,
    person:
      parsed.person === "mine" || profiles.some((profile) => profile.id === parsed.person)
        ? parsed.person
        : DEFAULT_FILTERS.person,
    client: clients.some((client) => client.id === parsed.client)
      ? parsed.client
      : DEFAULT_FILTERS.client,
  }

  function update(patch: Partial<TaskFilters>) {
    const query = filtersToQuery({ ...filters, ...patch })
    window.history.replaceState(null, "", query ? `${pathname}?${query}` : pathname)
  }

  function clearFilters() {
    update({
      status: DEFAULT_FILTERS.status,
      area: DEFAULT_FILTERS.area,
      client: DEFAULT_FILTERS.client,
      due: DEFAULT_FILTERS.due,
    })
  }

  const ctx = dayContext(today)
  const visible = filterTasks(tasks, filters, ctx, currentUser.id, keepInPlace)
  const groups = groupTasks(visible, ctx, keepInPlace)
  const openCount = visible.filter((task) => !isDone(task)).length
  const overdueCount = groups.overdue.filter((task) => !isDone(task)).length
  const sections = TASK_GROUP_ORDER.filter((key) => groups[key].length > 0)

  const selectedPerson = profiles.find((profile) => profile.id === filters.person)
  const personOptions = [
    { value: "all", label: "Todas" },
    { value: "mine", label: "Minhas" },
    ...profiles.map((profile) => ({ value: profile.id, label: firstName(profile.full_name) })),
  ]
  const clientOptions = [
    { value: "all", label: "Todos os clientes" },
    ...clients.map((client) => ({ value: client.id, label: client.name })),
  ]

  const summary = [
    countLabel(openCount, "aberta", "abertas"),
    overdueCount > 0 ? countLabel(overdueCount, "atrasada", "atrasadas") : null,
  ]
    .filter(Boolean)
    .join(" · ")

  return (
    <PageContainer className="max-w-[1240px]">
      <PageHeader
        title="Tarefas"
        description={summary}
        actions={
          <NewTaskButton
            defaults={selectedPerson ? { assignee_ids: [selectedPerson.id] } : undefined}
          />
        }
      />

      <div className="mt-7 flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="-mx-4 overflow-x-auto px-4 pb-0.5 sm:mx-0 sm:px-0">
          <SegmentedControl
            aria-label="Pessoa"
            value={filters.person}
            onValueChange={(person) => update({ person })}
            options={personOptions}
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            ariaLabel="Status"
            icon={<CircleDashed />}
            value={filters.status}
            defaultValue={DEFAULT_FILTERS.status}
            options={STATUS_OPTIONS}
            onChange={(status) => update({ status })}
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
            ariaLabel="Cliente"
            icon={<Building2 />}
            value={filters.client}
            defaultValue={DEFAULT_FILTERS.client}
            options={clientOptions}
            onChange={(client) => update({ client })}
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
            <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={clearFilters}>
              Limpar filtros
            </Button>
          ) : null}
        </div>
      </div>

      {sections.length > 0 ? (
        <div className="mt-8 space-y-9">
          {sections.map((key) => (
            <TaskSection
              key={key}
              id={key}
              title={TASK_GROUP_LABEL[key]}
              tone={key === "overdue" ? "danger" : "default"}
              tasks={groups[key]}
              showDue={key !== "today"}
            />
          ))}
        </div>
      ) : (
        <EmptyState
          filtered={hasActiveFilters(filters) || filters.person !== DEFAULT_FILTERS.person}
          onClear={() => update({ ...DEFAULT_FILTERS })}
          onCreate={() =>
            openNewTask(selectedPerson ? { assignee_ids: [selectedPerson.id] } : undefined)
          }
        />
      )}
    </PageContainer>
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
          "h-8 gap-1.5 rounded-md px-2.5 text-[13px] shadow-none [&>svg:first-child]:size-3.5",
          active && "border-foreground/20 bg-accent font-medium text-foreground"
        )}
      >
        {icon}
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper" align="start">
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
    <div className="mt-8 flex flex-col items-center rounded-xl border border-dashed px-6 py-16 text-center">
      <div className="flex size-10 items-center justify-center rounded-full bg-muted">
        <ListChecks className="size-5 text-muted-foreground" />
      </div>
      <h2 className="mt-4 text-sm font-semibold">
        {filtered ? "Nenhuma tarefa com esses filtros" : "Nenhuma tarefa aberta"}
      </h2>
      <p className="mt-1 max-w-xs text-sm text-muted-foreground">
        {filtered
          ? "Ajuste ou limpe os filtros para ver mais tarefas."
          : "Tudo em dia. Crie uma tarefa quando surgir algo novo."}
      </p>
      <div className="mt-5 flex gap-2">
        {filtered ? (
          <Button variant="outline" size="sm" onClick={onClear}>
            Limpar filtros
          </Button>
        ) : null}
        <Button size="sm" onClick={onCreate}>
          Nova tarefa
        </Button>
      </div>
    </div>
  )
}
