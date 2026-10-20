"use client"

import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { ContentImage } from "@/features/content/content-image"
import { cn } from "@/lib/utils"

/**
 * Imagens do post uma de cada vez, como no carrossel do Instagram. Usada no
 * portal (o post do cliente) e no admin (a prévia do carrossel no post).
 */
export function PostGallery({ paths, title, className }: { paths: string[]; title: string; className?: string }) {
  const [index, setIndex] = useState(0)
  const position = Math.min(index, paths.length - 1)
  const current = paths[position]
  const empty = (
    <div className="flex size-full flex-col items-center justify-center gap-2 text-subtle-foreground">
      <ImageIcon className="size-6" />
      <span className="text-xs">Sem imagem ainda</span>
    </div>
  )

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative aspect-[3/4] w-full overflow-hidden rounded-xl border bg-muted">
        {current ? (
          <ContentImage
            key={current}
            path={current}
            alt={paths.length > 1 ? `${title}, imagem ${position + 1} de ${paths.length}` : title}
            className="object-contain"
            fallback={empty}
          />
        ) : (
          empty
        )}
        {paths.length > 1 ? (
          <>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute top-1/2 left-2 size-8 -translate-y-1/2 rounded-full bg-background/90 shadow-sm"
              onClick={() => setIndex(Math.max(0, position - 1))}
              disabled={position === 0}
              aria-label="Imagem anterior"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute top-1/2 right-2 size-8 -translate-y-1/2 rounded-full bg-background/90 shadow-sm"
              onClick={() => setIndex(Math.min(paths.length - 1, position + 1))}
              disabled={position === paths.length - 1}
              aria-label="Próxima imagem"
            >
              <ChevronRight />
            </Button>
          </>
        ) : null}
      </div>
      {paths.length > 1 ? (
        <div className="flex justify-center gap-1.5" aria-hidden="true">
          {paths.map((path, at) => (
            <span
              key={`${at}-${path}`}
              className={cn("size-1.5 rounded-full bg-muted-foreground/30", at === position && "bg-brand")}
            />
          ))}
        </div>
      ) : null}
    </div>
  )
}
