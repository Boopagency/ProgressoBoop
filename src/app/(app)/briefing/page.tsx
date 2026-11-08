import type { Metadata } from "next"
import { ClipboardList } from "lucide-react"

import { EmptyPanel } from "@/components/empty-panel"
import { PageBody, PageContainer, PageHeader } from "@/components/layout/page"
import { BriefingCentralView } from "@/features/briefing/briefing-central"
import { BriefingCentralNav } from "@/features/briefing/central-nav"
import { getBriefingCentral } from "@/features/briefing/team-queries"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Briefings" }

/** Central de briefings, aba Briefings: todos os briefings dos clientes. */
export default async function BriefingCentralPage() {
  const today = todayKey()
  const state = await getBriefingCentral(today)
  if (state.available) return <BriefingCentralView central={state.central} today={today} />

  return (
    <PageContainer>
      <PageHeader
        title={
          <>
            Central de <em>briefings</em>
          </>
        }
      />
      <BriefingCentralNav />
      <PageBody width="reading">
        <EmptyPanel icon={ClipboardList} title="Briefing ainda não disponível">
          O banco ainda não tem o briefing de onboarding. Ele aparece aqui assim que a atualização for aplicada.
        </EmptyPanel>
      </PageBody>
    </PageContainer>
  )
}
