import type { Metadata } from "next"
import { ClipboardList } from "lucide-react"

import { EmptyPanel } from "@/components/empty-panel"
import { PageBody, PageContainer, PageHeader } from "@/components/layout/page"
import { BriefingEditor } from "@/features/briefing/briefing-editor"
import { BriefingCentralNav } from "@/features/briefing/central-nav"
import { getBriefingForm } from "@/features/briefing/team-queries"

export const metadata: Metadata = { title: "Configuração do briefing" }

const TITLE = (
  <>
    Central de <em>briefings</em>
  </>
)

/** Central de briefings, aba Configuração: o editor de perguntas do formulário ativo. */
export default async function BriefingSettingsPage() {
  const state = await getBriefingForm()
  if (state.available && state.form) return <BriefingEditor form={state.form} title={TITLE} nav={<BriefingCentralNav />} />

  return (
    <PageContainer>
      <PageHeader title={TITLE} />
      <BriefingCentralNav />
      <PageBody width="reading">
        <EmptyPanel icon={ClipboardList} title={state.available ? "Nenhum formulário ativo" : "Briefing ainda não disponível"}>
          {state.available
            ? "O formulário do briefing não está ativo. Fale com quem cuida do banco."
            : "O banco ainda não tem o briefing de onboarding. Ele aparece aqui assim que a atualização for aplicada."}
        </EmptyPanel>
      </PageBody>
    </PageContainer>
  )
}
