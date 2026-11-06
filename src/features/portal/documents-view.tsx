import { Download, ExternalLink, FolderOpen } from "lucide-react"

import { PageBody, PageContainer } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import { EmptyPanel } from "@/components/empty-panel"
import { FileKindTile } from "@/features/client-files/file-icon"
import { clientFileHref, formatFileSize, opensInBrowser, type PortalClientFile } from "@/features/client-files/logic"
import { PortalHeader, PortalSectionTitle } from "@/features/portal/portal-ui"
import { formatShortDate, toDateKey } from "@/lib/dates"
import { CLIENT_FILE_CATEGORIES, CLIENT_FILE_CATEGORY_LABEL } from "@/lib/labels"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface PortalDocumentsData {
  clientName: string
  files: PortalClientFile[]
  /** O documento do aviso "Novo documento" (`?arquivo=`), que vem destacado. */
  highlighted: string | null
  today: DateKey
}

/**
 * Documentos que a Boop enviou para o cliente (contrato, briefing, marca,
 * relatórios…), separados por tipo, com as pílulas para pular a um tipo.
 * Abrir mostra no navegador quando dá (PDF, imagem, vídeo); baixar traz o
 * arquivo com o nome original. O documento do aviso vem destacado.
 */
export function PortalDocumentsView({ clientName, files, highlighted, today }: PortalDocumentsData) {
  const groups = CLIENT_FILE_CATEGORIES.map((category) => ({
    category,
    files: files.filter((file) => file.category === category),
  })).filter((group) => group.files.length > 0)

  return (
    <PageContainer>
      <PortalHeader
        client={clientName}
        title={
          <>
            Seus <em>documentos</em>
          </>
        }
        description="Contrato, briefing, marca e relatórios que a equipe enviou para você ver e baixar."
        stats={files.length > 0 ? [{ label: "Documentos", value: files.length }] : undefined}
      />

      <PageBody width="reading">
        {files.length === 0 ? (
          <EmptyPanel icon={FolderOpen} title="Nenhum documento por aqui ainda">
            Quando a equipe enviar o contrato, o briefing, o manual da marca ou um relatório, ele aparece aqui para você ver
            e baixar.
          </EmptyPanel>
        ) : (
          <>
            {groups.length > 1 ? (
              <nav aria-label="Tipos de documento" className="flex flex-wrap gap-2">
                {groups.map((group) => (
                  <a
                    key={group.category}
                    href={`#documentos-${group.category}`}
                    className="inline-flex h-8 items-center gap-2 rounded-full border border-foreground/15 bg-card px-3.5 text-[13px] text-foreground outline-none transition-colors hover:border-glow/50 hover:bg-glow-soft focus-visible:ring-[3px] focus-visible:ring-ring/40"
                  >
                    {CLIENT_FILE_CATEGORY_LABEL[group.category]}
                    <span className="text-xs text-muted-foreground tabular-nums">{group.files.length}</span>
                  </a>
                ))}
              </nav>
            ) : null}

            {groups.map((group) => (
              <section key={group.category} aria-labelledby={`documentos-${group.category}`} className="scroll-mt-6 space-y-3">
                <PortalSectionTitle id={`documentos-${group.category}`} count={group.files.length}>
                  {CLIENT_FILE_CATEGORY_LABEL[group.category]}
                </PortalSectionTitle>
                <ul className="space-y-2.5">
                  {group.files.map((file) => {
                    const isNew = file.id === highlighted
                    return (
                      <li
                        key={file.id}
                        className={cn(
                          "flex flex-col gap-4 rounded-2xl border bg-card px-4 py-4 sm:flex-row sm:items-center sm:px-5",
                          isNew && "border-glow/60 shadow-glow"
                        )}
                      >
                        <div className="flex min-w-0 flex-1 items-start gap-3.5">
                          <FileKindTile
                            mimeType={file.mime_type}
                            className={cn("size-11 rounded-xl", isNew ? "bg-glow-soft text-brand-ink" : "bg-muted")}
                          />
                          <div className="min-w-0 flex-1">
                            <p className="flex min-w-0 items-center gap-2">
                              <span className="truncate text-[15px] font-semibold text-foreground">{file.name}</span>
                              {isNew ? (
                                <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-semibold text-primary-foreground">
                                  Novo
                                </span>
                              ) : null}
                            </p>
                            {file.description ? (
                              <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{file.description}</p>
                            ) : null}
                            <p className="mt-1 text-xs text-subtle-foreground tabular-nums">
                              {formatShortDate(toDateKey(file.created_at), today)} · {formatFileSize(file.size_bytes)}
                            </p>
                          </div>
                        </div>
                        <div className="flex shrink-0 gap-2 sm:justify-end">
                          {opensInBrowser(file.mime_type) ? (
                            <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
                              <a href={clientFileHref(file.id)} target="_blank" rel="noopener noreferrer">
                                <ExternalLink />
                                Abrir
                              </a>
                            </Button>
                          ) : null}
                          <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none">
                            <a href={clientFileHref(file.id, true)} aria-label={`Baixar ${file.name}`}>
                              <Download />
                              Baixar
                            </a>
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              </section>
            ))}
          </>
        )}
      </PageBody>
    </PageContainer>
  )
}
