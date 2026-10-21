import { Check } from "lucide-react"
import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { PageBody, PageContainer, PageHeader, PageMeta } from "@/components/layout/page"
import { DeliverableList } from "@/features/deliverables/deliverable-list"
import { PostChat } from "@/features/portal/post-chat"
import { projectPercent, stepApprovalState, templateName, type PortalProject } from "@/features/portal/project-logic"
import {
  getPortalProjectMessages,
  getPortalProjects,
  getPortalProjectSteps,
  getPortalStepApprovals,
  getPortalStepDeliverables,
} from "@/features/portal/project-queries"
import { StepReviewButtons } from "@/features/portal/review-panel"
import { pickPortalClient, requirePortalUser, type PortalClient } from "@/features/portal/session"
import { ProjectBar, ProjectStatusBadge, ProjectTiming } from "@/features/projects/project-meta"
import { formatShortDate, todayKey, toDateKey } from "@/lib/dates"
import { cn, isUuid } from "@/lib/utils"

export const metadata: Metadata = { title: "Projeto" }

/** Projeto aberto no portal: andamento, as etapas que o cliente acompanha e a conversa com a equipe. */
export default async function PortalProjectPage(props: PageProps<"/portal/projetos/[id]">) {
  const [user, params, searchParams] = await Promise.all([requirePortalUser(), props.params, props.searchParams])
  if (!isUuid(params.id)) notFound()

  // O projeto costuma ser do cliente escolhido; se não for, procura nos outros da conta.
  const picked = pickPortalClient(user, searchParams.cliente)
  const ordered = [picked, ...user.clients.filter((item) => item.id !== picked.id)]
  let found: { client: PortalClient; project: PortalProject } | null = null
  for (const candidate of ordered) {
    const project = (await getPortalProjects(candidate.id)).find((item) => item.id === params.id)
    if (project) {
      found = { client: candidate, project }
      break
    }
  }
  if (!found) notFound()
  const { client, project } = found

  const [steps, messages, approvals, deliverables] = await Promise.all([
    getPortalProjectSteps(project.id),
    getPortalProjectMessages(project.id),
    getPortalStepApprovals(client.id),
    getPortalStepDeliverables(project.id),
  ])
  // As etapas deste projeto que pedem a aprovação do cliente.
  const approvalOf = new Map(approvals.filter((item) => item.project_id === project.id).map((item) => [item.id, item]))
  const awaitingCount = [...approvalOf.values()].filter((item) => item.awaiting).length
  const today = todayKey()
  const percent = projectPercent(project)
  const kind = templateName(project.template)
  const nextId = steps.find((step) => step.status !== "done")?.id

  return (
    <PageContainer>
      <PageHeader
        title={project.name}
        description={
          <PageMeta
            items={[
              <ProjectStatusBadge key="status" status={project.status} />,
              kind,
              `Começou ${formatShortDate(project.starts_on, today)}`,
              project.due_on ? `prazo ${formatShortDate(project.due_on, today)}` : null,
              <ProjectTiming key="timing" project={project} today={today} />,
              user.clients.length > 1 ? client.name : null,
            ]}
          />
        }
      />

      <PageBody>
      <div className="flex max-w-md items-center gap-3">
        <ProjectBar percent={percent} className="flex-1" />
        <span className="text-[13px] font-medium text-foreground tabular-nums">{percent}% concluído</span>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="etapas" className="space-y-2">
          <h2 id="etapas" className="flex items-center gap-2 text-sm font-semibold text-foreground">
            Etapas
            {awaitingCount > 0 ? (
              <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs font-medium text-warning-ink">
                {awaitingCount === 1 ? "1 esperando você" : `${awaitingCount} esperando você`}
              </span>
            ) : null}
          </h2>
          {steps.length === 0 ? (
            <p className="rounded-xl border border-dashed px-4 py-5 text-[13px] text-muted-foreground">
              A equipe ainda não marcou as etapas que você acompanha. Enquanto isso, o andamento acima mostra quanto
              do projeto já foi feito.
            </p>
          ) : (
            <ol className="rounded-xl border bg-card px-4 py-2">
              {steps.map((step, index) => {
                const done = step.status === "done"
                const current = step.id === nextId
                const late = !done && step.due_date !== null && step.due_date < today
                const approval = approvalOf.get(step.id)
                const state = approval ? stepApprovalState(approval, today) : null
                return (
                  <li key={step.id} className="relative flex gap-3 py-2.5">
                    {index < steps.length - 1 ? (
                      <span aria-hidden="true" className="absolute top-8 bottom-[-6px] left-[9px] w-px bg-border" />
                    ) : null}
                    <span
                      aria-hidden="true"
                      className={cn(
                        "relative mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                        done && "border-success bg-success text-white",
                        current && "border-brand bg-brand-soft",
                        !done && !current && "border-border bg-background"
                      )}
                    >
                      {done ? <Check className="size-3" strokeWidth={3} /> : null}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className={cn("text-sm leading-5 text-foreground", done && "text-muted-foreground")}>
                        {step.title}
                      </p>
                      <p className={cn("text-xs text-muted-foreground", late && "text-overdue")}>
                        {done
                          ? step.completed_at
                            ? `Concluída ${formatShortDate(toDateKey(step.completed_at), today)}`
                            : "Concluída"
                          : current
                            ? step.status === "doing"
                              ? "Em andamento"
                              : "Próxima etapa"
                            : step.status === "doing"
                              ? "Em andamento"
                              : "A fazer"}
                        {!done && step.due_date ? ` · ${late ? "previsto para " : ""}${formatShortDate(step.due_date, today)}` : ""}
                        {state?.kind === "pending" ? " · pede sua aprovação" : ""}
                      </p>
                      <DeliverableList items={deliverables.get(step.id) ?? []} className="mt-2" />
                      {state?.kind === "awaiting" ? (
                        <div className="mt-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2.5">
                          <p className="text-[13px] leading-5 text-foreground">
                            A equipe concluiu esta etapa e espera a sua aprovação. Aprove ou conte o que precisa ajustar.
                          </p>
                          <StepReviewButtons stepId={step.id} />
                        </div>
                      ) : state?.kind === "approved" || state?.kind === "changes" ? (
                        <div className="mt-1.5 text-xs leading-5">
                          <p className={state.kind === "approved" ? "text-success-ink" : "text-warning-ink"}>{state.text}</p>
                          {state.note ? (
                            <p className="mt-0.5 border-l-2 pl-2 break-words whitespace-pre-line text-muted-foreground">
                              {state.note}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </div>
                  </li>
                )
              })}
            </ol>
          )}
        </section>

        {/* Recomeça com as mensagens do servidor quando a página volta com novidade. */}
        <PostChat
          key={`${messages.length}-${messages.at(-1)?.id ?? ""}`}
          target={{ kind: "project", id: project.id }}
          initialMessages={messages}
        />
      </div>
      </PageBody>
    </PageContainer>
  )
}
