import type { Metadata } from "next"
import { redirect } from "next/navigation"

import { getPortalBriefing } from "@/features/briefing/portal-queries"
import { PortalBriefingWelcome } from "@/features/briefing/portal-welcome"
import { portalHref } from "@/features/portal/links"
import { pickPortalClientForBriefing, requirePortalUser } from "@/features/portal/session"

export const metadata: Metadata = { title: "Briefing" }

/**
 * Briefing de onboarding do cliente escolhido. Com ele liberado e não
 * enviado, é a única tela do portal desse cliente; sem briefing liberado,
 * volta para o início.
 */
export default async function PortalBriefingPage(props: PageProps<"/portal/briefing">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClientForBriefing(user, searchParams.cliente)
  const briefing = await getPortalBriefing(client.id)
  const home = portalHref("/portal", client, user.clients)
  if (!briefing) redirect(home)
  return <PortalBriefingWelcome clientName={client.name} briefing={briefing} homeHref={home} />
}
