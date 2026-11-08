"use client"

import { BriefingEditor } from "@/features/briefing/briefing-editor"
import { BriefingCentralNav } from "@/features/briefing/central-nav"

import { VitrineB } from "../../admin-b/vitrine-b"
import { vbBriefingForm } from "../../briefing-equipe/fixtures"

/** A central de briefings, aba Configuração: o editor de perguntas de exemplo. */
export default function VitrineBriefingCentralSettingsPage() {
  return (
    <VitrineB active="/briefing">
      <BriefingEditor
        form={vbBriefingForm()}
        title={
          <>
            Central de <em>briefings</em>
          </>
        }
        nav={<BriefingCentralNav basePath="/vitrine/briefing-central" />}
      />
    </VitrineB>
  )
}
