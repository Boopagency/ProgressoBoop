import type { Metadata } from "next"
import { ClipboardList } from "lucide-react"
import { notFound } from "next/navigation"

import { EmptyPanel } from "@/components/empty-panel"
import { PageBody, PageContainer, PageHeader } from "@/components/layout/page"
import { BriefingDetailView } from "@/features/briefing/briefing-detail"
import { briefingDefaults } from "@/features/briefing/central-logic"
import { immersionMeetingOptions } from "@/features/briefing/team-logic"
import { getTeamBriefing } from "@/features/briefing/team-queries"
import { getEvents } from "@/features/calendar/queries"
import { getClient } from "@/features/clients/queries"
import { getMeetingRecords } from "@/features/meetings/queries"
import { todayKey } from "@/lib/dates"
import { isUuid } from "@/lib/utils"

export async function generateMetadata(props: PageProps<"/briefing/[id]">): Promise<Metadata> {
  const { id } = await props.params
  const client = isUuid(id) ? await getClient(id) : null
  return { title: client ? `Briefing · ${client.name}` : "Briefing" }
}

/** Um briefing aberto pela central, com os mesmos componentes da aba da ficha. */
export default async function BriefingDetailPage(props: PageProps<"/briefing/[id]">) {
  const { id } = await props.params
  if (!isUuid(id)) notFound()

  const [client, briefing, events, { records }] = await Promise.all([getClient(id), getTeamBriefing(id), getEvents(), getMeetingRecords()])
  if (!client) notFound()
  const today = todayKey()

  if (!briefing.available) {
    return (
      <PageContainer>
        <PageHeader title={client.name} />
        <PageBody width="reading">
          <EmptyPanel icon={ClipboardList} title="Briefing ainda não disponível">
            O banco ainda não tem o briefing de onboarding. Ele aparece aqui assim que a atualização for aplicada.
          </EmptyPanel>
        </PageBody>
      </PageContainer>
    )
  }

  return (
    <BriefingDetailView
      client={client}
      defaults={briefingDefaults(client)}
      briefing={briefing.briefing}
      meetings={immersionMeetingOptions(client.id, events, records, today, briefing.briefing?.immersion?.meeting_id ?? null)}
      today={today}
    />
  )
}
