"use client"

import { BriefingEditor } from "@/features/briefing/briefing-editor"

import { VitrineB } from "../../admin-b/vitrine-b"
import { vbBriefingForm } from "../fixtures"

/** O editor de perguntas do briefing com o formulário de exemplo. */
export default function VitrineBriefingEditorPage() {
  return (
    <VitrineB active="/briefing">
      <BriefingEditor form={vbBriefingForm()} />
    </VitrineB>
  )
}
