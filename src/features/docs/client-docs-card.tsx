"use client"

import { Plus } from "lucide-react"
import Link from "next/link"

import { PanelCard, PanelCount } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { CLIENT_TEMPLATE_ICON, DOC_KIND_ICON, DocKindTile, DocStatusBadge } from "@/features/docs/doc-meta"
import { CLIENT_TEMPLATES, type TemplateId } from "@/features/docs/templates"
import type { DateKey, DocSummary } from "@/lib/types"

/**
 * Página do cliente: os documentos dele (Processos com o cliente) e os
 * atalhos "Novo documento do cliente" com os modelos de social media
 * (persona, identidades, estratégia do mês, stories, relatório do mês).
 */
export function ClientDocsCard({
  docs,
  today,
  onNew,
}: {
  /** Documentos do cliente. */
  docs: DocSummary[]
  today: DateKey
  /** Abre o "Novo documento" com o cliente (e o modelo, quando escolhido). */
  onNew: (template?: TemplateId) => void
}) {
  return (
    <PanelCard
      id="documentos-cliente"
      title={
        <>
          Documentos do cliente
          <PanelCount value={docs.length} />
        </>
      }
      action={
        <Button variant="ghost" size="sm" onClick={() => onNew()} className="h-7 gap-1 px-2 text-xs">
          <Plus className="size-3.5" />
          Novo
        </Button>
      }
    >
      {docs.length === 0 ? (
        <p className="px-4 py-4 text-[13px] leading-5 text-muted-foreground">
          Persona, identidade da marca, estratégia e relatório do mês, briefing e acessos: o que é específico deste
          cliente, em Processos.
        </p>
      ) : (
        <ul className="py-1">
          {docs.map((doc) => (
            <li key={doc.id}>
              <Link
                href={`/processos/${doc.id}`}
                className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/50"
              >
                <DocKindTile kind={doc.kind} className="size-7" />
                <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-foreground">{doc.title}</span>
                {doc.status !== "active" ? <DocStatusBadge doc={doc} today={today} /> : null}
              </Link>
            </li>
          ))}
        </ul>
      )}
      <div className="border-t px-4 py-3">
        <p id="novo-documento-cliente" className="text-xs font-medium text-muted-foreground">
          Novo documento do cliente
        </p>
        <ul aria-labelledby="novo-documento-cliente" className="mt-2 flex flex-wrap gap-1.5">
          {CLIENT_TEMPLATES.map((template) => {
            const Icon = CLIENT_TEMPLATE_ICON[template.id] ?? DOC_KIND_ICON[template.kind]
            return (
              <li key={template.id}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => onNew(template.id)}
                  title={template.description}
                  className="h-7 gap-1.5 px-2.5 text-xs font-normal shadow-none"
                >
                  <Icon className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  {template.label}
                </Button>
              </li>
            )
          })}
        </ul>
      </div>
    </PanelCard>
  )
}
