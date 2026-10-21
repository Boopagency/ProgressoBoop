"use client"

import { ArrowUpRight, FileText, ImageOff, Link2, X } from "lucide-react"
import Image from "next/image"
import { useState } from "react"

import {
  deliverableHref,
  isImageDeliverable,
  linkHost,
  type Deliverable,
} from "@/features/deliverables/logic"
import { cn } from "@/lib/utils"

/*
 * Entregas de uma etapa, como a equipe e o cliente veem: as imagens em
 * miniatura (o layout), os PDFs e os links em linhas. Tudo abre numa aba nova
 * (o arquivo pela rota do app, que confere a sessão).
 */

function Thumbnail({ item }: { item: Deliverable }) {
  const [failed, setFailed] = useState(false)
  if (failed || !item.file_path) {
    return (
      <span className="flex size-full items-center justify-center text-muted-foreground">
        <ImageOff className="size-5" aria-hidden="true" />
      </span>
    )
  }
  return (
    <Image
      src={deliverableHref(item)}
      alt=""
      fill
      unoptimized
      draggable={false}
      onError={() => setFailed(true)}
      className="object-cover object-top transition-transform duration-300 group-hover:scale-[1.02]"
    />
  )
}

function RemoveButton({ item, onRemove }: { item: Deliverable; onRemove: (item: Deliverable) => void }) {
  return (
    <button
      type="button"
      onClick={() => onRemove(item)}
      aria-label={`Tirar “${item.title}”`}
      title="Tirar"
      className="flex size-6 shrink-0 items-center justify-center rounded-md text-muted-foreground transition-colors outline-none hover:bg-muted hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40"
    >
      <X className="size-3.5" aria-hidden="true" />
    </button>
  )
}

export function DeliverableList({
  items,
  onRemove,
  className,
}: {
  items: Deliverable[]
  /** Só a equipe tira entregas. */
  onRemove?: (item: Deliverable) => void
  className?: string
}) {
  if (items.length === 0) return null
  const images = items.filter(isImageDeliverable)
  const others = items.filter((item) => !isImageDeliverable(item))

  return (
    <div className={cn("space-y-2", className)}>
      {images.length > 0 ? (
        <ul className="grid grid-cols-2 gap-2 sm:grid-cols-3">
          {images.map((item) => (
            <li key={item.id} className="min-w-0">
              <a
                href={deliverableHref(item)}
                target="_blank"
                rel="noopener noreferrer"
                className="group relative block aspect-[4/3] overflow-hidden rounded-lg border bg-muted outline-none focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <Thumbnail item={item} />
                <span className="sr-only">Abrir {item.title}</span>
              </a>
              <div className="mt-1 flex items-center gap-1">
                <p className="min-w-0 flex-1 truncate text-xs text-muted-foreground" title={item.title}>
                  {item.title}
                </p>
                {onRemove ? <RemoveButton item={item} onRemove={onRemove} /> : null}
              </div>
            </li>
          ))}
        </ul>
      ) : null}

      {others.length > 0 ? (
        <ul className="space-y-1.5">
          {others.map((item) => {
            const Icon = item.kind === "link" ? Link2 : FileText
            const detail = item.kind === "link" ? linkHost(item.url) : "PDF"
            return (
              <li key={item.id} className="flex items-center gap-1">
                <a
                  href={deliverableHref(item)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="group flex min-w-0 flex-1 items-center gap-2.5 rounded-lg border bg-card px-3 py-2 transition-colors outline-none hover:bg-muted/60 focus-visible:ring-[3px] focus-visible:ring-ring/40"
                >
                  <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-brand-soft text-brand-ink">
                    <Icon className="size-4" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">{item.title}</span>
                    {detail ? <span className="block truncate text-xs text-muted-foreground">{detail}</span> : null}
                  </span>
                  <ArrowUpRight
                    className="size-4 shrink-0 text-muted-foreground transition-colors group-hover:text-foreground"
                    aria-hidden="true"
                  />
                </a>
                {onRemove ? <RemoveButton item={item} onRemove={onRemove} /> : null}
              </li>
            )
          })}
        </ul>
      ) : null}
    </div>
  )
}
