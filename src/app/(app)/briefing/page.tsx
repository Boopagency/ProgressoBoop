import type { Metadata } from "next"
import { ClipboardList } from "lucide-react"

import { EmptyPanel } from "@/components/empty-panel"
import { PageBody, PageContainer, PageHeader } from "@/components/layout/page"
import { BriefingEditor } from "@/features/briefing/briefing-editor"
import { getBriefingForm } from "@/features/briefing/team-queries"

export const metadata: Metadata = { title: "Briefing" }

/** Editor de perguntas do briefing de onboarding (o formulário ativo). */
export default async function BriefingPage() {
  const state = await getBriefingForm()
  if (state.available && state.form) return <BriefingEditor form={state.form} />

  return (
    <PageContainer>
      <PageHeader
        title={
          <>
            Perguntas do <em>briefing</em>
          </>
        }
      />
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
