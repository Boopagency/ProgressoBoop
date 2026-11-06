import type { Metadata } from "next"

import { PortalCalendarView } from "@/features/portal/calendar-view"
import { getPortalPosts } from "@/features/portal/content-queries"
import { portalHref } from "@/features/portal/links"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"
import { isDateKey, todayKey } from "@/lib/dates"
import type { DateKey } from "@/lib/types"

export const metadata: Metadata = { title: "Calendário" }

/** Mês pedido em `?mes=aaaa-mm`; sem ele (ou inválido), o mês de hoje. */
function monthAnchor(requested: unknown, today: DateKey): DateKey {
  const key = typeof requested === "string" ? `${requested}-01` : null
  return key && isDateKey(key) ? key : `${today.slice(0, 7)}-01`
}

/** Calendário do mês com os posts do cliente que já chegaram a ele. */
export default async function PortalCalendarPage(props: PageProps<"/portal/calendario">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const today = todayKey()
  const anchor = monthAnchor(searchParams.mes, today)
  const posts = await getPortalPosts(client.id)
  const href = (path: string, extra = "") => portalHref(path, client, user.clients, extra)

  return (
    <PortalCalendarView
      clientName={client.name}
      anchor={anchor}
      today={today}
      posts={posts}
      postHref={(id) => href(`/portal/posts/${id}`)}
      monthHref={(key) => href("/portal/calendario", `mes=${key.slice(0, 7)}`)}
    />
  )
}
