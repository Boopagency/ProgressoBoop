import type { Metadata } from "next"

import { clientOverdue } from "@/features/finance/logic"
import { getPortalLatestMessages } from "@/features/portal/channel-queries"
import { portalHome } from "@/features/portal/content-logic"
import { getPortalPosts } from "@/features/portal/content-queries"
import { EMPTY_PORTAL_FINANCE } from "@/features/portal/finance-logic"
import { getPortalFinance } from "@/features/portal/finance-queries"
import { HOME_MESSAGES, HOME_UPCOMING, homeProjects, pendingApprovals } from "@/features/portal/home-logic"
import { PortalHomeView } from "@/features/portal/home-view"
import { portalHref } from "@/features/portal/links"
import { getPortalProjects, getPortalStepApprovals } from "@/features/portal/project-queries"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"
import { greetingFor, todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Portal" }

/**
 * Início do portal, um painel resumido: o que espera a resposta do cliente
 * (posts e etapas), os projetos com o andamento, as últimas mensagens e os
 * próximos posts. Com pagamento em atraso (e o aviso ligado para o cliente),
 * o aviso gentil fica no topo.
 */
export default async function PortalPage(props: PageProps<"/portal">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const [posts, steps, projects, messages, finance] = await Promise.all([
    getPortalPosts(client.id),
    getPortalStepApprovals(client.id),
    getPortalProjects(client.id),
    getPortalLatestMessages(client.id, HOME_MESSAGES),
    // O aviso é um extra: se o financeiro falhar, o Início abre sem ele.
    getPortalFinance(client.id).catch(() => EMPTY_PORTAL_FINANCE),
  ])
  const today = todayKey()
  const pending = pendingApprovals(posts, steps)
  const allUpcoming = portalHome(posts, today).upcoming
  const upcoming = allUpcoming.slice(0, HOME_UPCOMING)
  const href = (path: string) => portalHref(path, client, user.clients)
  const overdue = finance.reminders
    ? clientOverdue(client.id, finance.entries, finance.recurrences, today).filter((item) => item.account === "client_revenue")
    : []

  return (
    <PortalHomeView
      greeting={greetingFor()}
      userName={user.name}
      clientName={client.name}
      pending={pending}
      projects={homeProjects(projects)}
      messages={messages}
      upcoming={upcoming}
      overdue={overdue}
      openProjects={projects.filter((project) => project.status !== "done").length}
      upcomingTotal={allUpcoming.length}
      today={today}
      href={href}
    />
  )
}
