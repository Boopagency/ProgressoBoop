import { Check, ListChecks } from "lucide-react"

import { PageBody, PageContainer } from "@/components/layout/page"
import { DeliverableList } from "@/features/deliverables/deliverable-list"
import type { Deliverable } from "@/features/deliverables/logic"
import type { PortalMessage } from "@/features/portal/content-queries"
import { PostChat } from "@/features/portal/post-chat"
import {
  projectPercent,
  stepApprovalState,
  templateName,
  type PortalProject,
  type PortalStep,
  type PortalStepApproval,
} from "@/features/portal/project-logic"
import { ClientPill, PortalEmpty } from "@/features/portal/portal-ui"
import { ProgressTrack } from "@/features/portal/projects-view"
import { StepReviewButtons } from "@/features/portal/review-panel"
import { ProjectStatusBadge, ProjectTiming } from "@/features/projects/project-meta"
import { formatShortDate, toDateKey } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface PortalProjectData {
  project: PortalProject
  clientName: string
  /** Mostra o cliente na pílula (para quem acompanha mais de um). */
  showClient: boolean
  steps: PortalStep[]
  /** As etapas deste projeto que pedem a aprovação do cliente. */
  approvals: PortalStepApproval[]
  deliverables: Map<string, Deliverable[]>
  messages: PortalMessage[]
  today: DateKey
  /** A conversa busca mensagens novas sozinha (desligado na vitrine). */
  live?: boolean
}

/**
 * Projeto aberto no portal: no painel de destaque, a situação, o modelo, as
 * datas e o andamento em número grande; embaixo, as etapas que o cliente
 * acompanha (com as entregas e a aprovação da etapa) e, ao lado, a conversa
 * do projeto. Nada de descrição, responsável ou tarefa interna.
 */
export function PortalProjectView({
  project,
  clientName,
  showClient,
  steps,
  approvals,
  deliverables,
  messages,
  today,
  live = true,
}: PortalProjectData) {
  const approvalOf = new Map(approvals.map((item) => [item.id, item]))
  const awaitingCount = approvals.filter((item) => item.awaiting).length
  const percent = projectPercent(project)
  const kind = templateName(project.template)
  const nextId = steps.find((step) => step.status !== "done")?.id
  const doneSteps = steps.filter((step) => step.status === "done").length

  return (
    <PageContainer>
      <section
        aria-labelledby="projeto-titulo"
        className="relative isolate overflow-hidden rounded-[2rem] glass-panel px-5 pt-5 pb-6 sm:px-9 sm:pt-7 sm:pb-8"
      >
        <span aria-hidden="true" className="pointer-events-none absolute -right-24 -bottom-32 -z-10 size-96 rounded-full bg-glow/20 blur-3xl" />
        <div className="flex flex-wrap items-center gap-2">
          {showClient ? <ClientPill name={clientName} /> : null}
          {kind ? <ClientPill name={kind} /> : null}
          <ProjectStatusBadge status={project.status} className="h-7 px-3 text-xs" />
        </div>

        <div className="mt-6 flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="min-w-0">
            <h1
              id="projeto-titulo"
              className="font-display text-[32px] leading-[1.06] font-medium tracking-[-0.04em] break-words text-foreground sm:text-[46px]"
            >
              {project.name}
            </h1>
            <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13.5px] text-muted-foreground">
              <span>Começou {formatShortDate(project.starts_on, today)}</span>
              {project.due_on ? (
                <>
                  <span aria-hidden="true">·</span>
                  <span>prazo {formatShortDate(project.due_on, today)}</span>
                </>
              ) : null}
              <span aria-hidden="true">·</span>
              <ProjectTiming project={project} today={today} />
            </p>
          </div>
          <p className="flex shrink-0 items-baseline gap-1">
            <span className="display-number text-[84px] leading-[0.8] text-foreground sm:text-[112px]">{percent}</span>
            <span className="display-number text-[34px] text-muted-foreground">%</span>
            <span className="ml-2 text-sm text-muted-foreground">concluído</span>
          </p>
        </div>

        <ProgressTrack percent={percent} className="mt-6 h-2" />

        {steps.length > 0 ? (
          <div className="mt-6 grid grid-cols-2 gap-x-6 sm:flex sm:gap-10">
            <div className="border-t border-foreground/15 pt-2.5">
              <p className="eyebrow text-muted-foreground">Etapas feitas</p>
              <p className="mt-2 display-number text-[40px] leading-[0.85] text-foreground">
                {doneSteps}
                <span className="ml-1.5 font-sans text-sm not-italic text-muted-foreground">de {steps.length}</span>
              </p>
            </div>
            <a
              href="#etapas"
              className="border-t border-foreground/15 pt-2.5 outline-none transition-colors hover:border-glow focus-visible:ring-[3px] focus-visible:ring-ring/40"
            >
              <p className="eyebrow text-muted-foreground">Esperando você</p>
              <p className="mt-2 display-number text-[40px] leading-[0.85] text-foreground">{awaitingCount}</p>
            </a>
          </div>
        ) : null}
      </section>

      <PageBody className="mt-8">
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-10">
          <section aria-labelledby="etapas" className="min-w-0 space-y-3">
            <h2 id="etapas" className="flex min-h-7 items-center gap-2 eyebrow text-muted-foreground">
              Etapas
              {awaitingCount > 0 ? (
                <span className="rounded-full border border-warning/35 bg-warning/12 px-2 py-0.5 text-[11px] font-medium tracking-normal text-warning-ink normal-case">
                  {awaitingCount === 1 ? "1 esperando você" : `${awaitingCount} esperando você`}
                </span>
              ) : null}
            </h2>
            {steps.length === 0 ? (
              <PortalEmpty icon={ListChecks} title="As etapas aparecem aqui">
                A equipe ainda não marcou as etapas que você acompanha. Enquanto isso, o andamento acima mostra quanto do
                projeto já foi feito.
              </PortalEmpty>
            ) : (
              <ol className="rounded-[1.75rem] border bg-card px-5 py-3 sm:px-6">
                {steps.map((step, index) => {
                  const done = step.status === "done"
                  const current = step.id === nextId
                  const late = !done && step.due_date !== null && step.due_date < today
                  const approval = approvalOf.get(step.id)
                  const state = approval ? stepApprovalState(approval, today) : null
                  return (
                    <li key={step.id} className="relative flex gap-4 py-3.5">
                      {index < steps.length - 1 ? (
                        <span
                          aria-hidden="true"
                          className={cn("absolute top-11 bottom-[-10px] left-[13px] w-px", done ? "bg-success/40" : "bg-border")}
                        />
                      ) : null}
                      <span
                        aria-hidden="true"
                        className={cn(
                          "relative mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full border-2",
                          done && "border-success bg-success text-white",
                          current && "border-glow bg-glow-soft shadow-[0_0_16px_var(--glow-soft)]",
                          !done && !current && "border-border bg-background"
                        )}
                      >
                        {done ? (
                          <Check className="size-3.5" strokeWidth={3} />
                        ) : current ? (
                          <span className="size-2 rounded-full bg-glow motion-safe:animate-pulse" />
                        ) : null}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className={cn("text-[15px] leading-6 font-medium text-foreground", done && "font-normal text-muted-foreground")}>
                          {step.title}
                        </p>
                        <p className={cn("text-xs text-muted-foreground", current && "text-brand-ink", late && "text-overdue")}>
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
                        <DeliverableList items={deliverables.get(step.id) ?? []} className="mt-3" />
                        {state?.kind === "awaiting" ? (
                          <div className="mt-3 rounded-2xl border border-warning/35 bg-warning/10 px-4 py-3.5">
                            <p className="text-[13.5px] leading-5 text-foreground">
                              A equipe concluiu esta etapa e espera a sua aprovação. Aprove ou conte o que precisa ajustar.
                            </p>
                            <StepReviewButtons stepId={step.id} />
                          </div>
                        ) : state?.kind === "approved" || state?.kind === "changes" ? (
                          <div className="mt-2 text-xs leading-5">
                            <p className={cn("font-medium", state.kind === "approved" ? "text-success-ink" : "text-warning-ink")}>
                              {state.text}
                            </p>
                            {state.note ? (
                              <p className="mt-1 border-l-2 pl-2.5 break-words whitespace-pre-line text-muted-foreground">
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

          {/* A conversa acompanha a rolagem no computador. Recomeça com as mensagens do servidor quando a página volta com novidade. */}
          <div className="min-w-0 md:sticky md:top-6 md:self-start">
            <PostChat
              key={`${messages.length}-${messages.at(-1)?.id ?? ""}`}
              target={{ kind: "project", id: project.id }}
              initialMessages={messages}
              live={live}
              className="md:h-[min(640px,calc(100svh-7rem))]"
            />
          </div>
        </div>
      </PageBody>
    </PageContainer>
  )
}
