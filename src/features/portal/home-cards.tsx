import { ListChecks, MessageSquare } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { PanelCard, PanelCount } from "@/components/panel-card"
import type { PortalPost } from "@/features/portal/content-logic"
import type { PortalChannelMessage } from "@/features/portal/channel-queries"
import { messageExcerpt, messageWhen, type PendingApproval } from "@/features/portal/home-logic"
import { PostListItem, StatusBadge } from "@/features/portal/post-meta"
import { projectPercent, templateName, type PortalProject } from "@/features/portal/project-logic"
import { ProjectBar, ProjectStatusBadge } from "@/features/projects/project-meta"
import { formatShortDate, toDateKey } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/*
 * Quadros do painel (Início) do portal. Server Components: recebem os dados
 * prontos e o `href` de cada tela (com o cliente escolhido).
 */

type Href = (path: string) => string

const ROW =
  "flex items-center gap-3 rounded-lg px-2 py-2 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/40"

function SeeAll({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link href={href} className="text-[13px] font-medium text-brand-ink hover:underline">
      {children}
    </Link>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="px-4 py-5 text-[13px] leading-5 text-muted-foreground">{children}</p>
}

/** Posts e etapas que esperam a resposta do cliente. */
export function PendingCard({ items, href, today }: { items: PendingApproval[]; href: Href; today: DateKey }) {
  return (
    <PanelCard id="esperando" title={<>Esperando você {items.length > 0 ? <PanelCount value={items.length} /> : null}</>}>
      {items.length === 0 ? (
        <Empty>Nada esperando a sua aprovação agora. Quando a equipe enviar um post ou uma etapa, ela aparece aqui.</Empty>
      ) : (
        <ul className="p-1.5">
          {items.map((item) =>
            item.kind === "post" ? (
              <PostListItem key={item.id} post={item.post} href={href(`/portal/posts/${item.id}`)} today={today} />
            ) : (
              <li key={item.id}>
                <Link href={href(`/portal/projetos/${item.step.project_id}`)} className={ROW}>
                  <span className="flex aspect-[3/4] w-12 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                    <ListChecks className="size-5" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-foreground">{item.step.title}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      Etapa de {item.step.project_name}
                      {item.step.completed_at
                        ? ` · concluída ${formatShortDate(toDateKey(item.step.completed_at), today)}`
                        : ""}
                    </p>
                  </div>
                  {/* Mesma etiqueta do post "com o cliente": para o cliente, as duas pedem a mesma coisa. */}
                  <StatusBadge stage="client_review" />
                </Link>
              </li>
            )
          )}
        </ul>
      )}
    </PanelCard>
  )
}

/** Os projetos com quanto já foi feito. */
export function ProjectsCard({ projects, href }: { projects: PortalProject[]; href: Href }) {
  return (
    <PanelCard id="projetos" title="Projetos" action={projects.length > 0 ? <SeeAll href={href("/portal/projetos")}>Ver todos</SeeAll> : null}>
      {projects.length === 0 ? (
        <Empty>Nenhum projeto por aqui ainda. Quando a equipe começar um projeto para você, ele aparece aqui.</Empty>
      ) : (
        <ul className="p-1.5">
          {projects.map((project) => {
            const percent = projectPercent(project)
            const template = templateName(project.template)
            const kind = template && template !== project.name ? template : null
            return (
              <li key={project.id}>
                <Link href={href(`/portal/projetos/${project.id}`)} className="block rounded-lg px-2.5 py-2.5 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/40">
                  <div className="flex items-start gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{project.name}</p>
                      {kind ? <p className="text-xs text-muted-foreground">{kind}</p> : null}
                    </div>
                    <ProjectStatusBadge status={project.status} />
                  </div>
                  <div className="mt-2 flex items-center gap-3">
                    <ProjectBar percent={percent} className="flex-1" />
                    <span className="w-10 text-right text-[13px] font-medium text-foreground tabular-nums">{percent}%</span>
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </PanelCard>
  )
}

/**
 * As últimas mensagens com a equipe. A do post ou do projeto leva direto ao
 * chat dele; a geral, à Comunicação.
 */
export function MessagesCard({
  messages,
  href,
  today,
}: {
  messages: PortalChannelMessage[]
  href: Href
  today: DateKey
}) {
  return (
    <PanelCard id="mensagens" title="Últimas mensagens" action={<SeeAll href={href("/portal/comunicacao")}>Abrir conversa</SeeAll>}>
      {messages.length === 0 ? (
        <Empty>Nenhuma mensagem ainda. As conversas dos posts e dos projetos com a equipe aparecem aqui.</Empty>
      ) : (
        <ul className="p-1.5">
          {messages.map((message) => {
            const target = message.post
              ? { path: `/portal/posts/${message.post.id}`, label: message.post.title }
              : message.project
                ? { path: `/portal/projetos/${message.project.id}`, label: message.project.name }
                : { path: "/portal/comunicacao", label: "Comunicação" }
            const content = (
              <>
                <span
                  aria-hidden="true"
                  className={cn(
                    "mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    message.from_team ? "bg-brand-soft text-brand-ink" : "bg-muted text-muted-foreground"
                  )}
                >
                  {message.mine ? "V" : message.author_name.trim().charAt(0).toUpperCase() || "?"}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="flex items-baseline gap-2">
                    <span className="truncate text-[13px] font-medium text-foreground">
                      {message.mine ? "Você" : message.author_name}
                    </span>
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground tabular-nums">
                      {messageWhen(message.created_at, today)}
                    </span>
                  </p>
                  <p className="line-clamp-2 text-[13px] leading-5 text-muted-foreground">{messageExcerpt(message.body)}</p>
                  <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-subtle-foreground">
                    <MessageSquare className="size-3 shrink-0" aria-hidden="true" />
                    <span className="truncate">{target.label}</span>
                  </p>
                </div>
              </>
            )
            return (
              <li key={message.id}>
                <Link href={href(target.path)} className={cn(ROW, "items-start")}>
                  {content}
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </PanelCard>
  )
}

/** Os próximos posts aprovados ou programados. */
export function UpcomingCard({ posts, href, today }: { posts: PortalPost[]; href: Href; today: DateKey }) {
  return (
    <PanelCard id="proximos" title="Próximos posts" action={<SeeAll href={href("/portal/calendario")}>Calendário</SeeAll>}>
      {posts.length === 0 ? (
        <Empty>Nenhum post aprovado com data para os próximos dias.</Empty>
      ) : (
        <ul className="p-1.5">
          {posts.map((post) => (
            <PostListItem key={post.id} post={post} href={href(`/portal/posts/${post.id}`)} today={today} />
          ))}
        </ul>
      )}
    </PanelCard>
  )
}
