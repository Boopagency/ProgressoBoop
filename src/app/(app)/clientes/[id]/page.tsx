import type { Metadata } from "next"
import { notFound } from "next/navigation"

import { getEvents } from "@/features/calendar/queries"
import { ClientView } from "@/features/clients/client-view"
import { parsePeriodParam, periodOf } from "@/features/clients/logic"
import { getClient, getClientReviews } from "@/features/clients/queries"
import { getCommunications } from "@/features/communications/queries"
import { getContentIdeas } from "@/features/content/ideas-queries"
import { getContentPosts } from "@/features/content/queries"
import { getDeals } from "@/features/deals/queries"
import { getDecisions } from "@/features/decisions/queries"
import { getDocs } from "@/features/docs/queries"
import { getFinance } from "@/features/finance/queries"
import { getMeetingRecords } from "@/features/meetings/queries"
import { getClientMembers } from "@/features/portal/access-queries"
import { getTasks } from "@/features/tasks/queries"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { todayKey } from "@/lib/dates"
import { isUuid } from "@/lib/utils"

export async function generateMetadata(props: PageProps<"/clientes/[id]">): Promise<Metadata> {
  const { id } = await props.params
  const client = isUuid(id) ? await getClient(id) : null
  return { title: client?.name ?? "Cliente" }
}

export default async function ClientPage(props: PageProps<"/clientes/[id]">) {
  const { id } = await props.params
  if (!isUuid(id)) notFound()
  const searchParams = await props.searchParams

  const [client, reviews, tasks, events, { records }, docs, communications, decisions, finance, deals, posts, ideas, members] = await Promise.all([
    getClient(id),
    getClientReviews(id),
    getTasks(),
    getEvents(),
    getMeetingRecords(),
    getDocs(),
    getCommunications(id),
    getDecisions(),
    getFinance(),
    getDeals(),
    getContentPosts(id),
    getContentIdeas(id),
    getClientMembers(id),
  ])
  if (!client) notFound()

  const today = todayKey()
  const current = periodOf(today)
  const requested = parsePeriodParam(searchParams.mes)
  // Revisões são de meses que já começaram: o futuro volta para o mês atual.
  const period = requested && requested <= current ? requested : current

  return (
    <TasksProvider tasks={tasks} today={today}>
      <ClientView
        key={client.id}
        client={client}
        reviews={reviews}
        period={period}
        events={events}
        records={records}
        docs={docs.filter((doc) => doc.client_id === client.id)}
        templateDocs={docs}
        communications={communications}
        decisions={decisions.filter((decision) => decision.client_id === client.id)}
        finance={finance}
        deals={deals}
        posts={posts}
        ideas={ideas}
        members={members}
      />
    </TasksProvider>
  )
}
