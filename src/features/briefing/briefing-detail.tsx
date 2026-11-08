import { ChevronLeft, UserRound } from "lucide-react"
import Link from "next/link"

import { PageBody, PageContainer, PageHeader, PageMeta } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import { BriefingTab } from "@/features/briefing/briefing-tab"
import type { BriefingIdentification } from "@/features/briefing/logic"
import type { ImmersionMeetingOption, TeamBriefingDetail } from "@/features/briefing/team-logic"
import { BRIEFING_STATUS_LABEL } from "@/lib/labels"
import type { DateKey } from "@/lib/types"

/**
 * Um briefing aberto pela central (`/briefing/<cliente>`), sem ir para a
 * ficha: o título, a volta para a lista, o atalho para a ficha e a mesma
 * aba Briefing da ficha (status e ações, respostas por bloco com o resumo da
 * IA e os áudios, a imersão e o preenchimento pela Boop).
 */
export function BriefingDetailView({
  client,
  defaults,
  briefing,
  meetings,
  today,
  basePath = "/briefing",
  fileUrl,
}: {
  client: { id: string; name: string; active: boolean }
  defaults: BriefingIdentification
  briefing: TeamBriefingDetail | null
  meetings: ImmersionMeetingOption[]
  today: DateKey
  /** A vitrine monta a central em outro endereço. */
  basePath?: string
  /** Só a vitrine passa: imagens de exemplo no lugar do bucket. */
  fileUrl?: (path: string) => string
}) {
  return (
    <PageContainer>
      <Link
        href={basePath}
        className="inline-flex items-center gap-1 rounded-full text-[13px] text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        <ChevronLeft className="size-3.5" aria-hidden="true" />
        Todos os briefings
      </Link>
      <PageHeader
        className="mt-3"
        title={
          <>
            Briefing de <em>{client.name}</em>
          </>
        }
        description={
          <PageMeta
            items={[
              "Briefing de onboarding",
              briefing ? BRIEFING_STATUS_LABEL[briefing.status] : "Ainda não preparado",
              client.active ? null : "Cliente inativo",
            ]}
          />
        }
        actions={
          <Button asChild variant="outline" className="gap-1.5 shadow-none">
            <Link href={`/clientes/${client.id}?aba=briefing`}>
              <UserRound />
              Abrir a ficha
            </Link>
          </Button>
        }
      />
      <PageBody>
        <BriefingTab
          clientId={client.id}
          clientName={client.name}
          defaults={defaults}
          briefing={briefing}
          meetings={meetings}
          today={today}
          fileUrl={fileUrl}
        />
      </PageBody>
    </PageContainer>
  )
}
