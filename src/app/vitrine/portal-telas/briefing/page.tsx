import { todayKey } from "@/lib/dates"

import { isVitrineBrand, VITRINE_BRANDS } from "../../briefing-preencher/marcas"
import { VitrineShell } from "../../vitrine-shell"
import { BriefingDemo } from "./briefing-demo"
import { briefingExample, isBriefingScreen } from "./exemplos"

/**
 * O briefing do portal na vitrine (`?tela=`: inicio, audio, escolha, tom,
 * cores, etapa, envio, obrigado, boop, boop-etapa), com dados de exemplo.
 * Nas telas "boop", `?marca=velmont|barbara`. Nada vai ao banco.
 */
export default async function VitrineBriefingPage(props: PageProps<"/vitrine/portal-telas/briefing">) {
  const { tela, marca } = await props.searchParams
  const screen = isBriefingScreen(tela) ? tela : "inicio"
  const brand = isVitrineBrand(marca) ? marca : "velmont"
  const today = todayKey()
  const { data, startAt } = briefingExample(screen, today, brand)
  return (
    <VitrineShell
      area="portal"
      active="/portal/briefing"
      briefingOnly={screen !== "obrigado"}
      clientName={screen.startsWith("boop") ? VITRINE_BRANDS[brand].name : undefined}
    >
      <BriefingDemo key={`${screen}-${brand}`} data={data} today={today} startAt={startAt} />
    </VitrineShell>
  )
}
