import type { Metadata } from "next"

import { PageBody, PageContainer, PageHeader } from "@/components/layout/page"
import { clientOverdue } from "@/features/finance/logic"
import { getPortalLatestMessages } from "@/features/portal/channel-queries"
import { portalHome } from "@/features/portal/content-logic"
import { getPortalPosts } from "@/features/portal/content-queries"
import { OverdueNotice } from "@/features/portal/finance-cards"
import { EMPTY_PORTAL_FINANCE } from "@/features/portal/finance-logic"
import { getPortalFinance } from "@/features/portal/finance-queries"
import { MessagesCard, PendingCard, ProjectsCard, UpcomingCard } from "@/features/portal/home-cards"
import { HOME_MESSAGES, HOME_UPCOMING, homeProjects, pendingApprovals } from "@/features/portal/home-logic"
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
  const upcoming = portalHome(posts, today).upcoming.slice(0, HOME_UPCOMING)
  const href = (path: string) => portalHref(path, client, user.clients)
  const overdue = finance.reminders
    ? clientOverdue(client.id, finance.entries, finance.recurrences, today).filter((item) => item.account === "client_revenue")
    : []

  return (
    <PageContainer>
      <PageHeader
        title={
          <>
            {greetingFor()}, <span className="text-brand-ink">{user.name}</span>
          </>
        }
        description={`${client.name} · ${
          pending.length === 0
            ? "nada esperando a sua aprovação"
            : pending.length === 1
              ? "1 item esperando a sua aprovação"
              : `${pending.length} itens esperando a sua aprovação`
        }`}
      />

      <PageBody>
        {overdue.length > 0 ? <OverdueNotice overdue={overdue} communicationHref={href("/portal/comunicacao")} /> : null}
        {/*
          Celular: esperando → projetos → mensagens → próximos.
          Computador: o que pede ação à esquerda; conversa e agenda à direita.
        */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_340px] lg:gap-x-10">
          <div className="flex min-w-0 flex-col gap-8">
            <PendingCard items={pending} href={href} today={today} />
            <ProjectsCard projects={homeProjects(projects)} href={href} />
          </div>
          <div className="flex min-w-0 flex-col gap-8">
            <MessagesCard messages={messages} href={href} today={today} />
            <UpcomingCard posts={upcoming} href={href} today={today} />
          </div>
        </div>
      </PageBody>
    </PageContainer>
  )
}
