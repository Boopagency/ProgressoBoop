import { Download, ExternalLink } from "lucide-react"
import type { Metadata } from "next"

import { PageBody, PageContainer, PageHeader } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import { FileKindTile } from "@/features/client-files/file-icon"
import { clientFileHref, formatFileSize, opensInBrowser } from "@/features/client-files/logic"
import { getPortalFiles } from "@/features/portal/file-queries"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"
import { formatShortDate, toDateKey, todayKey } from "@/lib/dates"
import { CLIENT_FILE_CATEGORIES, CLIENT_FILE_CATEGORY_LABEL } from "@/lib/labels"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Documentos" }

/**
 * Documentos que a Boop enviou para o cliente (contrato, briefing, marca,
 * relatórios…), separados por tipo. Abrir mostra no navegador quando dá (PDF,
 * imagem, vídeo); baixar traz o arquivo com o nome original. O documento do
 * aviso ("Novo documento") vem destacado.
 */
export default async function PortalDocumentsPage(props: PageProps<"/portal/documentos">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const files = await getPortalFiles(client.id)
  const highlighted = typeof searchParams.arquivo === "string" ? searchParams.arquivo : null
  const today = todayKey()
  const groups = CLIENT_FILE_CATEGORIES.map((category) => ({
    category,
    files: files.filter((file) => file.category === category),
  })).filter((group) => group.files.length > 0)

  return (
    <PageContainer>
      <PageHeader title="Documentos" description={client.name} />

      <PageBody width="reading">
        {files.length === 0 ? (
          <p className="rounded-xl border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">
            Nenhum documento por aqui ainda. Quando a equipe enviar o contrato, o briefing, o manual da marca ou um
            relatório, ele aparece aqui para você ver e baixar.
          </p>
        ) : (
          groups.map((group) => (
            <section key={group.category} aria-labelledby={`documentos-${group.category}`} className="space-y-3">
              <h2 id={`documentos-${group.category}`} className="text-sm font-semibold text-foreground">
                {CLIENT_FILE_CATEGORY_LABEL[group.category]}
              </h2>
              <ul className="space-y-2">
                {group.files.map((file) => (
                  <li
                    key={file.id}
                    className={cn(
                      "flex flex-col gap-3 rounded-xl border bg-card px-4 py-3.5 sm:flex-row sm:items-center",
                      file.id === highlighted && "border-brand bg-brand-soft"
                    )}
                  >
                    <div className="flex min-w-0 flex-1 items-start gap-3">
                      <FileKindTile mimeType={file.mime_type} className="size-9" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[15px] font-semibold text-foreground">{file.name}</p>
                        {file.description ? (
                          <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{file.description}</p>
                        ) : null}
                        <p className="mt-1 text-xs text-muted-foreground">
                          {formatShortDate(toDateKey(file.created_at), today)} · {formatFileSize(file.size_bytes)}
                        </p>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2 sm:justify-end">
                      {opensInBrowser(file.mime_type) ? (
                        <Button asChild variant="outline" size="sm" className="flex-1 gap-1.5 shadow-none sm:flex-none">
                          <a href={clientFileHref(file.id)} target="_blank" rel="noopener noreferrer">
                            <ExternalLink />
                            Abrir
                          </a>
                        </Button>
                      ) : null}
                      <Button asChild variant="outline" size="sm" className="flex-1 gap-1.5 shadow-none sm:flex-none">
                        <a href={clientFileHref(file.id, true)} aria-label={`Baixar ${file.name}`}>
                          <Download />
                          Baixar
                        </a>
                      </Button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))
        )}
      </PageBody>
    </PageContainer>
  )
}
