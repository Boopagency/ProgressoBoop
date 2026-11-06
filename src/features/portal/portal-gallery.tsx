"use client"

import { ChevronLeft, ChevronRight, ImageIcon } from "lucide-react"
import { useRef, useState } from "react"

import { PortalImage } from "@/features/portal/portal-image"
import { cn } from "@/lib/utils"

const ARROW =
  "absolute top-1/2 flex size-10 -translate-y-1/2 items-center justify-center rounded-full border border-glass-edge glass-surface text-foreground shadow-float outline-none transition-[opacity,transform] duration-150 hover:scale-105 focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:opacity-0 max-md:pointer-coarse:hidden"

/**
 * Imagens do post uma de cada vez, como o carrossel do Instagram, no visual
 * do portal: a moldura de vidro em 4:5, o contador "2/7" no canto, as setas
 * redondas de vidro (no computador) e, embaixo, os pontos e as miniaturas
 * para pular direto a um slide. No celular, arrasta com o dedo.
 */
export function PortalGallery({ paths, title, className }: { paths: string[]; title: string; className?: string }) {
  const track = useRef<HTMLDivElement>(null)
  const [index, setIndex] = useState(0)
  const position = Math.min(index, Math.max(paths.length - 1, 0))
  const many = paths.length > 1
  const empty = (
    <div className="flex size-full flex-col items-center justify-center gap-2 text-subtle-foreground">
      <ImageIcon className="size-7" />
      <span className="text-[13px]">Sem imagem ainda</span>
    </div>
  )

  function go(next: number) {
    const element = track.current
    if (!element) return
    setIndex(next)
    element.scrollTo({ left: next * element.clientWidth, behavior: "smooth" })
  }

  return (
    <div className={cn("space-y-3", className)}>
      <div className="relative overflow-hidden rounded-[1.75rem] border bg-card p-1.5">
        <div
          ref={track}
          onScroll={(event) => {
            const element = event.currentTarget
            if (element.clientWidth > 0) setIndex(Math.round(element.scrollLeft / element.clientWidth))
          }}
          className="flex aspect-[4/5] w-full snap-x snap-mandatory overflow-x-auto overflow-y-hidden overscroll-x-contain rounded-[1.375rem] bg-muted [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {paths.length === 0 ? (
            <div className="w-full shrink-0">{empty}</div>
          ) : (
            paths.map((path, at) => (
              <div key={`${at}-${path}`} className="relative h-full w-full shrink-0 snap-center snap-always">
                <PortalImage
                  path={path}
                  alt={many ? `${title}, imagem ${at + 1} de ${paths.length}` : title}
                  className="object-contain"
                  fallback={empty}
                />
              </div>
            ))
          )}
        </div>
        {many ? (
          <>
            <span
              aria-hidden="true"
              className="pointer-events-none absolute top-4 right-4 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white tabular-nums"
            >
              {position + 1}/{paths.length}
            </span>
            <button type="button" className={cn(ARROW, "left-4")} onClick={() => go(Math.max(0, position - 1))} disabled={position === 0} aria-label="Imagem anterior">
              <ChevronLeft className="size-5" />
            </button>
            <button
              type="button"
              className={cn(ARROW, "right-4")}
              onClick={() => go(Math.min(paths.length - 1, position + 1))}
              disabled={position === paths.length - 1}
              aria-label="Próxima imagem"
            >
              <ChevronRight className="size-5" />
            </button>
          </>
        ) : null}
      </div>

      {many ? (
        <>
          <div className="flex justify-center gap-1.5" aria-hidden="true">
            {paths.map((path, at) => (
              <span
                key={`${at}-${path}`}
                className={cn(
                  "h-1.5 rounded-full transition-[width,background-color] duration-200",
                  at === position ? "w-5 bg-glow shadow-[0_0_8px_var(--glow)]" : "w-1.5 bg-muted-foreground/30"
                )}
              />
            ))}
          </div>
          {/* No computador, as miniaturas para pular direto a um slide. */}
          <ol aria-label="Slides" className="hidden flex-wrap justify-center gap-2 md:flex">
            {paths.map((path, at) => (
              <li key={`${at}-${path}`}>
                <button
                  type="button"
                  onClick={() => go(at)}
                  aria-label={`Ver a imagem ${at + 1}`}
                  aria-current={at === position ? "true" : undefined}
                  className={cn(
                    "relative block aspect-[4/5] w-12 overflow-hidden rounded-lg border-2 bg-muted outline-none transition-[border-color,opacity] focus-visible:ring-[3px] focus-visible:ring-ring/50",
                    at === position ? "border-glow" : "border-transparent opacity-60 hover:opacity-100"
                  )}
                >
                  <PortalImage path={path} alt="" />
                </button>
              </li>
            ))}
          </ol>
        </>
      ) : null}
    </div>
  )
}
