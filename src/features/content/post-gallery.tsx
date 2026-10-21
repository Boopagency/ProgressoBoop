"use client"

import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react"
import { useRef, useState } from "react"

import { Button } from "@/components/ui/button"
import { ContentImage } from "@/features/content/content-image"
import { cn } from "@/lib/utils"

/**
 * Imagens do post uma de cada vez, como no carrossel do Instagram. Usada no
 * portal (o post do cliente) e no admin (a prévia do carrossel no post).
 * No celular, arrasta com o dedo (em 4:5, com o contador "2/7" no canto); no
 * computador, as setas.
 */
export function PostGallery({ paths, title, className }: { paths: string[]; title: string; className?: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const position = Math.min(index, Math.max(paths.length - 1, 0))
  const empty = (
    <div className="flex size-full flex-col items-center justify-center gap-2 text-subtle-foreground">
      <ImageIcon className="size-6" />
      <span className="text-xs">Sem imagem ainda</span>
    </div>
  )

  function go(next: number) {
    const element = track.current
    if (!element) return
    setIndex(next)
    element.scrollTo({ left: next * element.clientWidth, behavior: "smooth" })
  }

  return (
    <div className={cn("space-y-2", className)}>
      <div className="relative">
        <div
          ref={track}
          onScroll={(event) => {
            const element = event.currentTarget
            if (element.clientWidth > 0) setIndex(Math.round(element.scrollLeft / element.clientWidth))
          }}
          className="flex aspect-[4/5] w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-xl border bg-muted [scrollbar-width:none] md:aspect-[3/4] [&::-webkit-scrollbar]:hidden"
        >
          {paths.length === 0 ? (
            <div className="w-full shrink-0">{empty}</div>
          ) : (
            paths.map((path, at) => (
              <div key={`${at}-${path}`} className="relative h-full w-full shrink-0 snap-center snap-always">
                <ContentImage
                  path={path}
                  alt={paths.length > 1 ? `${title}, imagem ${at + 1} de ${paths.length}` : title}
                  className="object-contain"
                  fallback={empty}
                />
              </div>
            ))
          )}
        </div>
        {paths.length > 1 ? (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-3 right-3 rounded-full bg-black/65 px-2 py-0.5 text-xs font-medium text-white tabular-nums md:hidden"
            >
              {position + 1}/{paths.length}
            </span>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute top-1/2 left-2 size-8 -translate-y-1/2 rounded-full bg-background/90 shadow-sm max-md:pointer-coarse:hidden"
              onClick={() => go(Math.max(0, position - 1))}
              disabled={position === 0}
              aria-label="Imagem anterior"
            >
              <ChevronLeft />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon"
              className="absolute top-1/2 right-2 size-8 -translate-y-1/2 rounded-full bg-background/90 shadow-sm max-md:pointer-coarse:hidden"
              onClick={() => go(Math.min(paths.length - 1, position + 1))}
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
