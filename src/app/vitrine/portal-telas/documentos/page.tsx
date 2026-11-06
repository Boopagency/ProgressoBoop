import { PortalDocumentsView } from "@/features/portal/documents-view"
import { todayKey } from "@/lib/dates"

import { VitrineShell } from "../../vitrine-shell"
import { CLIENT, files } from "../exemplos"

/** Os Documentos do portal, com o relatório novo destacado. */
export default function VitrineDocumentsPage() {
  const today = todayKey()
  return (
    <VitrineShell area="portal" active="/portal/documentos">
      <PortalDocumentsView clientName={CLIENT.name} files={files(today)} highlighted="f5" today={today} />
    </VitrineShell>
  )
}
