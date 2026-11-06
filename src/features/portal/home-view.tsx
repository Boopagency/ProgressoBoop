import { ArrowUpRight, Asterisk } from "lucide-react"
import Link from "next/link"

import { PageBody, PageContainer } from "@/components/layout/page"
import { HeroEyebrow, HeroPanel } from "@/components/hero-panel"
import { StatGrid } from "@/components/stat-grid"
import { Button } from "@/components/ui/button"
import type { FinanceItem } from "@/features/finance/logic"
import type { PortalChannelMessage } from "@/features/portal/channel-queries"
import type { PortalPost } from "@/features/portal/content-logic"
import { OverdueNotice } from "@/features/portal/finance-cards"
import { MessagesCard, PendingCard, ProjectsCard, UpcomingCard } from "@/features/portal/home-cards"
import type { PendingApproval } from "@/features/portal/home-logic"
import type { PortalProject } from "@/features/portal/project-logic"
import type { DateKey } from "@/lib/types"

type Href = (path: string) => string

/** O que o Início mostra; a página busca os dados e a vitrine passa exemplos. */
export interface PortalHomeData {
  greeting: string
  userName: string
  clientName: string
  pending: PendingApproval[]
  projects: PortalProject[]
  messages: PortalChannelMessage[]
  upcoming: PortalPost[]
  overdue: FinanceItem[]
  /** Os números do destaque contam tudo, não só o que cabe nos quadros. */
  openProjects: number
  upcomingTotal: number
  today: DateKey
  href: Href
}

function pendingText(count: number): string {
  if (count === 0) return "nada esperando a sua aprovação"
  return count === 1 ? "1 item esperando a sua aprovação" : `${count} itens esperando a sua aprovação`
}

/**
 * Início do portal, um painel resumido. No topo, o painel de destaque: o
 * cliente em pílula, a saudação grande (o nome na serifada itálica), o que
 * espera a aprovação e os números do momento; a seta leva ao que espera o
 * cliente. Embaixo, os quadros: o que pede ação à esquerda; conversa e
 * agenda à direita. Com pagamento em atraso (e o aviso ligado para o
 * cliente), o aviso gentil fica logo abaixo do destaque.
 */
export function PortalHomeView({
  greeting,
  userName,
  clientName,
  pending,
  projects,
  messages,
  upcoming,
  overdue,
  openProjects,
  upcomingTotal,
  today,
  href,
}: PortalHomeData) {
  return (
    <PageContainer>
      <HeroPanel aria-labelledby="portal-titulo" light="aurora" className="sm:px-9 sm:pt-8 sm:pb-9">
        <div className="flex items-start justify-between gap-4">
          <HeroEyebrow>{clientName}</HeroEyebrow>
          <Asterisk aria-hidden="true" className="size-8 text-foreground/80" strokeWidth={1.5} />
        </div>

        <h1
          id="portal-titulo"
          className="mt-10 max-w-3xl font-display text-[40px] leading-[1.02] font-medium tracking-[-0.045em] text-foreground sm:mt-14 sm:text-[64px] lg:text-[76px]"
        >
          {greeting},{" "}
          <em className="emphasis pr-[0.05em] text-[1.14em] leading-none text-gradient-brand">{userName}</em>
        </h1>

        <div className="mt-5 flex items-center justify-between gap-6">
          <p className="max-w-md text-[15px] leading-6 text-muted-foreground first-letter:uppercase sm:text-base">
            {pendingText(pending.length)}
          </p>
          <Button asChild variant="outline" size="circle" className="max-sm:hidden">
            <Link href={pending.length > 0 ? "#esperando" : href("/portal/projetos")} aria-label={pending.length > 0 ? "Ver o que espera você" : "Ver projetos"}>
              <ArrowUpRight />
            </Link>
          </Button>
        </div>

        <StatGrid
          variant="line"
          size="lg"
          className="mt-8 sm:mt-12"
          items={[
            { label: "Esperando você", value: pending.length, href: "#esperando" },
            { label: "Projetos", value: openProjects, href: "#projetos" },
            { label: "Próximos posts", value: upcomingTotal, href: "#proximos" },
          ]}
        />
      </HeroPanel>

      <PageBody className="mt-8">
        {overdue.length > 0 ? <OverdueNotice overdue={overdue} communicationHref={href("/portal/comunicacao")} /> : null}
        {/*
          Celular: esperando → projetos → mensagens → próximos.
          Computador: o que pede ação à esquerda; conversa e agenda à direita.
        */}
        <div className="grid grid-cols-[minmax(0,1fr)] gap-8 lg:grid-cols-[minmax(0,1fr)_360px] lg:gap-x-8">
          <div className="flex min-w-0 flex-col gap-8">
            <PendingCard items={pending} href={href} today={today} />
            <ProjectsCard projects={projects} href={href} />
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
