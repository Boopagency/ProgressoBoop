import { pendingApprovals } from "@/features/portal/home-logic"
import { PortalHomeView } from "@/features/portal/home-view"
import { portalHome } from "@/features/portal/content-logic"
import { greetingFor, todayKey } from "@/lib/dates"

import {
  VITRINE_PORTAL_CLIENT,
  VITRINE_PORTAL_USER,
  vitrinePortalMessages,
  vitrinePortalPosts,
  vitrinePortalProjects,
  vitrinePortalSteps,
} from "../fixtures"
import { VitrineShell } from "../vitrine-shell"

/** O Início do portal de verdade, com dados de exemplo. */
export default function VitrinePortalPage() {
  const today = todayKey()
  const posts = vitrinePortalPosts(today)
  const projects = vitrinePortalProjects(today)
  const upcoming = portalHome(posts, today).upcoming
  return (
    <VitrineShell area="portal" active="/portal">
      <PortalHomeView
        greeting={greetingFor()}
        userName={VITRINE_PORTAL_USER.name}
        clientName={VITRINE_PORTAL_CLIENT.name}
        pending={pendingApprovals(posts, vitrinePortalSteps(today))}
        projects={projects}
        messages={vitrinePortalMessages(today)}
        upcoming={upcoming.slice(0, 5)}
        overdue={[]}
        openProjects={projects.length}
        upcomingTotal={upcoming.length}
        today={today}
        href={(path) => path}
      />
    </VitrineShell>
  )
}
