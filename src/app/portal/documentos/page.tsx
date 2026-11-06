import type { Metadata } from "next"

import { PortalDocumentsView } from "@/features/portal/documents-view"
import { getPortalFiles } from "@/features/portal/file-queries"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Documentos" }

/**
 * Documentos que a Boop enviou para o cliente (contrato, briefing, marca,
 * relatórios…), separados por tipo. O documento do aviso ("Novo documento")
 * vem destacado.
 */
export default async function PortalDocumentsPage(props: PageProps<"/portal/documentos">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const files = await getPortalFiles(client.id)

  return (
    <PortalDocumentsView
      clientName={client.name}
      files={files}
      highlighted={typeof searchParams.arquivo === "string" ? searchParams.arquivo : null}
      today={todayKey()}
    />
  )
}
