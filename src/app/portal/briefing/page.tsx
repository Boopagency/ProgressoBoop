import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { BriefingFlow } from "@/features/briefing/briefing-flow"
import { getPortalBriefingFlow } from "@/features/briefing/portal-queries"
import { portalHref } from "@/features/portal/links"
import { pickPortalClientForBriefing, requirePortalUser } from "@/features/portal/session"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Briefing" }

/**
 * Briefing de onboarding do cliente escolhido, uma pergunta por tela. Com ele
 * liberado e não enviado, é a única tela do portal desse cliente; enviado,
 * mostra o obrigado; sem briefing liberado, volta para o início.
 */
export default async function PortalBriefingPage(props: PageProps<"/portal/briefing">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClientForBriefing(user, searchParams.cliente)
  const data = await getPortalBriefingFlow(client.id)
  const home = portalHref("/portal", client, user.clients)
  if (!data) redirect(home)
  return <BriefingFlow key={data.briefingId} data={data} homeHref={home} today={todayKey()} />
}
