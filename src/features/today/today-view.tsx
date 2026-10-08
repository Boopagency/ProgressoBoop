"use client"

import { useState } from "react"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { SegmentedControl } from "@/components/segmented-control"
import type { PendingRequest } from "@/features/channels/logic"
import { TodayRequestsCard } from "@/features/channels/today-requests-card"
import { ReviewsDueCard } from "@/features/clients/client-pulse"
import type { PostSummary } from "@/features/content/logic"
import { TodayContentCard } from "@/features/content/today-content-card"
import { FinanceAlertCard } from "@/features/finance/finance-cards"
import type { FinanceData } from "@/features/finance/management"
import { ManagementCard } from "@/features/today/management-card"
import { focusProjects, projectStats } from "@/features/projects/logic"
import {
  dayContext,
  dueWithin,
  firstName,
  groupTasks,
  isAssignedTo,
  progressOf,
  summarize,
} from "@/features/tasks/logic"
import { NewTaskButton } from "@/features/tasks/new-task-dialog"
import { TaskSection } from "@/features/tasks/task-section"
import { useTasks } from "@/features/tasks/tasks-provider"
import { Agenda } from "@/features/today/agenda"
import { DocsToReview, NextMeetingCompact, OpenAgreements } from "@/features/today/dashboard-cards"
import { TODAY_SCOPE_COOKIE, type TodayScope } from "@/features/today/constants"
import { ProgressCard } from "@/features/today/progress-card"
import { SummaryStats } from "@/features/today/summary-stats"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatLongDate } from "@/lib/dates"
import type {
  CalendarEvent,
  ClientDetail,
  ClientReview,
  Deal,
  DocSummary,
  MeetingItem,
  MeetingRecord,
} from "@/lib/types"

const SCOPE_OPTIONS = [
  { value: "mine", label: "Minhas" },
  { value: "all", label: "Todas" },
] as const

export function TodayView({
  greeting,
  events,
  clients,
  reviews,
  meetingRecords,
  meetingItems,
  docs,
  finance,
  deals,
  posts,
  requests,
  initialScope,
}: {
  greeting: string
  events: CalendarEvent[]
  clients: ClientDetail[]
  reviews: ClientReview[]
  meetingRecords: MeetingRecord[]
  meetingItems: MeetingItem[]
  docs: DocSummary[]
  finance: FinanceData
  deals: Deal[]
  posts: PostSummary[]
  requests: PendingRequest[]
  initialScope: TodayScope
}) {
  const { tasks, today, keepInPlace } = useTasks()
  const { currentUser, projects } = useWorkspace()
  const [scope, setScope] = useState<TodayScope>(initialScope)

  function changeScope(next: TodayScope) {
    setScope(next)
    document.cookie = `${TODAY_SCOPE_COOKIE}=${next}; path=/; max-age=31536000; samesite=lax`
  }

  const ctx = dayContext(today)
  const visible = scope === "mine" ? tasks.filter((task) => isAssignedTo(task, currentUser.id)) : tasks
  const groups = groupTasks(visible, ctx, keepInPlace)
  const summary = summarize(visible, ctx)
  const week = progressOf(dueWithin(visible, ctx.week))
  // Projetos em foco são da equipe: o percentual conta todas as tarefas deles.
  const focus = focusProjects(projects)
    .slice(0, 4)
    .map((project) => ({
      project,
      stats: projectStats(project.id, tasks, today),
      mine:
        scope === "mine"
          ? progressOf(tasks.filter((task) => task.project_id === project.id && isAssignedTo(task, currentUser.id)))
          : null,
    }))

  return (
    <PageContainer className="max-w-[1240px]">
      <PageHeader
        title={`${greeting}, ${firstName(currentUser.full_name)}`}
        description={formatLongDate(today)}
        actions={
          <>
            <SegmentedControl
              aria-label="Quais tarefas mostrar"
              value={scope}
              onValueChange={changeScope}
              options={SCOPE_OPTIONS}
            />
            <NewTaskButton />
          </>
        }
      />

      <SummaryStats summary={summary} className="mt-8" />

      {/*
        Celular: resumo → progresso → listas → agenda.
        Desktop: listas à esquerda; progresso e agenda na coluna da direita.
      */}
      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-8 lg:mt-10 lg:grid-cols-[minmax(0,1fr)_300px] lg:grid-rows-[auto_1fr] lg:gap-x-12 lg:gap-y-6 xl:grid-cols-[minmax(0,1fr)_320px]">
        <ProgressCard
          focus={focus}
          week={week}
          weekRange={ctx.week}
          today={today}
          className="lg:col-start-2 lg:row-start-1"
        />

        <div className="min-w-0 space-y-9 lg:col-start-1 lg:row-span-2 lg:row-start-1">
          <TaskSection
            id="atrasadas"
            title="Atrasadas"
            tone="danger"
            tasks={groups.overdue}
            emptyText="Nada atrasado."
          />
          <TaskSection
            id="hoje"
            title="Hoje"
            tone="brand"
            tasks={groups.today}
            showDue={false}
            emptyText="Nenhuma tarefa com prazo para hoje."
          />
          <TaskSection
            id="esta-semana"
            title="Esta semana"
            tasks={groups.week}
            emptyText="Nada mais previsto até domingo."
          />
          <OpenAgreements
            items={meetingItems}
            records={meetingRecords}
            events={events}
            scope={scope}
          />
        </div>

        <div className="space-y-6 lg:col-start-2 lg:row-start-2 lg:self-start">
          <NextMeetingCompact events={events} records={meetingRecords} items={meetingItems} />
          <ReviewsDueCard clients={clients} reviews={reviews} />
          <TodayContentCard posts={posts} today={today} scope={scope} />
          <TodayRequestsCard requests={requests} today={today} />
          <FinanceAlertCard entries={finance.entries} recurrences={finance.recurrences} today={today} />
          <ManagementCard finance={finance} deals={deals} today={today} />
          <DocsToReview docs={docs} scope={scope} />
          <Agenda events={events} today={today} />
        </div>
      </div>
    </PageContainer>
  )
}
