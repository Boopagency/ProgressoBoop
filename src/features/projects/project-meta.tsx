"use client"

import { FolderKanban, Pin } from "lucide-react"

import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { compareProjects, isOpenProject, projectTiming, type TimingTone } from "@/features/projects/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { PROJECT_STATUS_LABEL } from "@/lib/labels"
import type { DateKey, Project, ProjectStatus } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_STYLE: Record<ProjectStatus, string> = {
  planned: "border-border bg-background text-muted-foreground",
  active: "border-brand/25 bg-brand-soft/60 text-brand-ink",
  paused: "border-amber-600/15 bg-amber-50 text-amber-800",
  done: "border-success/20 bg-success/10 text-success",
  canceled: "border-dashed border-border bg-background text-subtle-foreground",
}

export function ProjectStatusBadge({ status, className }: { status: ProjectStatus; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-5 shrink-0 items-center rounded-full border px-2 text-[11.5px] font-medium whitespace-nowrap",
        STATUS_STYLE[status],
        className
      )}
    >
      {PROJECT_STATUS_LABEL[status]}
    </span>
  )
}

const TIMING_TONE: Record<TimingTone, string> = {
  late: "font-medium text-overdue",
  soon: "text-foreground",
  normal: "text-muted-foreground",
  muted: "text-subtle-foreground",
}

export function ProjectTiming({
  project,
  today,
  className,
}: {
  project: Pick<Project, "status" | "due_on" | "completed_at">
  today: DateKey
  className?: string
}) {
  const { label, tone } = projectTiming(project, today)
  return <span className={cn("text-[13px] tabular-nums", TIMING_TONE[tone], className)}>{label}</span>
}

/** Barra fina de progresso (cor da marca; verde quando completo). */
export function ProjectBar({ percent, className }: { percent: number; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={cn("block h-1.5 w-full overflow-hidden rounded-full bg-muted", className)}
    >
      <span
        className={cn("block h-full rounded-full transition-[width]", percent >= 100 ? "bg-success" : "bg-brand")}
        style={{ width: `${Math.min(100, Math.max(0, percent))}%` }}
      />
    </span>
  )
}

/** Nome do cliente do projeto, ou "Interno" (projeto da própria Boop). */
export function useProjectClientName(): (project: Pick<Project, "client_id">) => string {
  const { clientById } = useWorkspace()
  return (project) => (project.client_id ? (clientById.get(project.client_id)?.name ?? "Cliente") : "Interno")
}

const NONE = "none"

/**
 * Escolha de projeto: os abertos, agrupados por cliente (internos primeiro).
 * O projeto atual aparece mesmo se já estiver concluído.
 */
export function ProjectSelect({
  value,
  onChange,
  clientId,
  className,
  placeholder = "Sem projeto",
  ariaLabel = "Projeto",
  showIcon = false,
  size = "sm",
}: {
  value: string | null
  onChange: (projectId: string | null) => void
  /** Mostra primeiro os projetos deste cliente. */
  clientId?: string | null
  className?: string
  placeholder?: string
  ariaLabel?: string
  showIcon?: boolean
  /** "default" nos formulários (mesma altura dos outros campos). */
  size?: "sm" | "default"
}) {
  const { projects, clients } = useWorkspace()
  const available = projects
    .filter((project) => isOpenProject(project) || project.id === value)
    .sort(compareProjects)
  const groups: { label: string; projects: Project[] }[] = []
  const add = (label: string, list: Project[]) => {
    if (list.length > 0) groups.push({ label, projects: list })
  }
  if (clientId) add("Deste cliente", available.filter((project) => project.client_id === clientId))
  add("Internos", available.filter((project) => project.client_id === null))
  for (const client of clients) {
    if (client.id === clientId) continue
    add(client.name, available.filter((project) => project.client_id === client.id))
  }

  return (
    <Select value={value ?? NONE} onValueChange={(next) => onChange(next === NONE ? null : next)}>
      <SelectTrigger size={size} aria-label={ariaLabel} className={className}>
        {showIcon ? <FolderKanban className="size-3.5" /> : null}
        <SelectValue placeholder={placeholder} />
      </SelectTrigger>
      <SelectContent position="popper" align="start" className="max-h-80">
        <SelectItem value={NONE} className="text-muted-foreground">
          {placeholder}
        </SelectItem>
        {groups.map((group) => (
          <SelectGroup key={group.label}>
            <SelectLabel className="text-[11px] tracking-wide uppercase">{group.label}</SelectLabel>
            {group.projects.map((project) => (
              <SelectItem key={project.id} value={project.id}>
                {project.pinned ? <Pin className="size-3 text-brand-ink" aria-hidden="true" /> : null}
                {project.name}
              </SelectItem>
            ))}
          </SelectGroup>
        ))}
      </SelectContent>
    </Select>
  )
}
