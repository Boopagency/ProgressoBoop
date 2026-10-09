import { Check, ChevronLeft } from "lucide-react"
import type { Metadata } from "next"
import Link from "next/link"
import { notFound } from "next/navigation"

import { PostChat } from "@/features/portal/post-chat"
import { portalHref } from "@/features/portal/portal-nav"
import { projectPercent, templateName, type PortalProject } from "@/features/portal/project-logic"
import {
  getPortalProjectMessages,
  getPortalProjects,
  getPortalProjectSteps,
} from "@/features/portal/project-queries"
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

  const [steps, messages] = await Promise.all([
    getPortalProjectSteps(project.id),
    getPortalProjectMessages(project.id),
  ])
  const today = todayKey()
  const percent = projectPercent(project)
  const kind = templateName(project.template)
  const nextId = steps.find((step) => step.status !== "done")?.id

  return (
    <div className="space-y-6">
      <Link
        href={portalHref("/portal/projetos", client, user.clients)}
        className="inline-flex items-center gap-1 text-[13px] text-muted-foreground hover:text-foreground"
      >
        <ChevronLeft className="size-4" />
        Projetos
      </Link>

      <div className="space-y-3">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <ProjectStatusBadge status={project.status} />
            {kind ? <span className="text-[13px] text-muted-foreground">{kind}</span> : null}
          </div>
          <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-foreground">{project.name}</h1>
          <p className="text-[13px] text-muted-foreground">
            Começou {formatShortDate(project.starts_on, today)}
            {project.due_on ? ` · prazo ${formatShortDate(project.due_on, today)}` : ""}
            {" · "}
            <ProjectTiming project={project} today={today} />
          </p>
        </div>
        <div className="flex max-w-md items-center gap-3">
          <ProjectBar percent={percent} className="flex-1" />
          <span className="text-[13px] font-medium text-foreground tabular-nums">{percent}% concluído</span>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
        <section aria-labelledby="etapas" className="space-y-2">
          <h2 id="etapas" className="text-sm font-semibold text-foreground">
            Etapas
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
                      </p>
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
    </div>
  )
}
