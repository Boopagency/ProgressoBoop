import { BriefingFlow } from "@/features/briefing/briefing-flow"
import { todayKey } from "@/lib/dates"

import { VitrineShell } from "../../vitrine-shell"
import { briefingExample, isBriefingScreen } from "./exemplos"

/**
 * O briefing do portal na vitrine (`?tela=`: inicio, audio, escolha, tom,
 * cores, etapa, envio, obrigado), com dados de exemplo. Nada vai ao banco.
 */
export default async function VitrineBriefingPage(props: PageProps<"/vitrine/portal-telas/briefing">) {
  const { tela } = await props.searchParams
  const screen = isBriefingScreen(tela) ? tela : "inicio"
  const today = todayKey()
  const { data, startAt } = briefingExample(screen, today)
  return (
    <VitrineShell area="portal" active="/portal/briefing" briefingOnly={screen !== "obrigado"}>
      <BriefingFlow key={screen} data={data} homeHref="/vitrine/portal" today={today} demo startAt={startAt} />
    </VitrineShell>
  )
}
