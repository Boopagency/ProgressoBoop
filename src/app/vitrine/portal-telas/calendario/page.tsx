import { PortalCalendarView } from "@/features/portal/calendar-view"
import { todayKey } from "@/lib/dates"

import { VitrineShell } from "../../vitrine-shell"
import { CLIENT, posts } from "../exemplos"

/** O Calendário do portal de verdade, com dados de exemplo. */
export default function VitrineCalendarPage() {
  const today = todayKey()
  return (
    <VitrineShell area="portal" active="/portal/calendario">
      <PortalCalendarView
        clientName={CLIENT.name}
        anchor={`${today.slice(0, 7)}-01`}
        today={today}
        posts={posts(today)}
        postHref={() => "/vitrine/portal-telas/post"}
        monthHref={() => "#"}
      />
    </VitrineShell>
  )
}
