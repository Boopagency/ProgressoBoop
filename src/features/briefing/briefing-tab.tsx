import { PencilLine } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"
import { BriefingStatusPanel } from "@/features/briefing/briefing-card"
import { BriefingImmersionCard } from "@/features/briefing/briefing-immersion"
import type { BriefingIdentification } from "@/features/briefing/logic"
import { TeamBriefingAnswers } from "@/features/briefing/team-answer-editor"
import { buildBriefingView, type ImmersionMeetingOption, type TeamBriefingDetail } from "@/features/briefing/team-logic"
import type { DateKey } from "@/lib/types"

/**
 * Aba Briefing da ficha do cliente (`?aba=briefing`; os avisos do sino abrem
 * aqui) e o briefing aberto pela central (`/briefing/<cliente>`): o status no topo, as respostas por bloco (a equipe pode preencher
 * qualquer pergunta pelo cliente) e, ao lado, as notas da imersão e o atalho
 * para o editor de perguntas.
 */
export function BriefingTab({
  clientId,
  clientName,
  defaults,
  briefing,
  meetings,
  today,
  fileUrl,
  demo = false,
  editing,
}: {
  clientId: string
  clientName: string
  defaults: BriefingIdentification
  briefing: TeamBriefingDetail | null
  meetings: ImmersionMeetingOption[]
  today: DateKey
  /** Só a vitrine passa: imagens de exemplo no lugar do bucket. */
  fileUrl?: (path: string) => string
  /** Vitrine: nada vai ao servidor ao preencher. */
  demo?: boolean
  /** Vitrine: id da pergunta aberta no editor. */
  editing?: string
}) {
  const view = briefing ? buildBriefingView(briefing) : null

  return (
    <div className="space-y-6">
      <BriefingStatusPanel
        clientId={clientId}
        clientName={clientName}
        defaults={defaults}
        briefing={briefing}
        progress={view?.progress ?? null}
        today={today}
      />

      {briefing && view ? (
        <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_380px] xl:items-start xl:gap-x-8">
          <div className="min-w-0">
            <TeamBriefingAnswers
              clientId={clientId}
              sections={view.sections}
              today={today}
              fileUrl={fileUrl}
              demo={demo}
              editing={editing}
            />
          </div>
          <aside aria-label="Imersão" className="min-w-0 space-y-6 xl:sticky xl:top-20">
            <BriefingImmersionCard
              key={briefing.immersion?.updated_at ?? "nova"}
              clientId={clientId}
              immersion={briefing.immersion}
              meetings={meetings}
              today={today}
            />
            <EditorLink />
          </aside>
        </div>
      ) : (
        <EditorLink />
      )}
    </div>
  )
}

function EditorLink() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border bg-card px-5 py-4">
      <p className="text-[13px] leading-5 text-muted-foreground">
        As perguntas são as mesmas para todos os clientes. Mudar uma pergunta não mexe em briefing já enviado.
      </p>
      <Button asChild variant="outline" size="sm" className="gap-1.5 shadow-none">
        <Link href="/briefing/configuracao">
          <PencilLine className="size-3.5" />
          Editar perguntas
        </Link>
      </Button>
    </div>
  )
}
