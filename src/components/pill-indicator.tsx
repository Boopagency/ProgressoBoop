"use client"

import { useLayoutEffect, useRef } from "react"

import { cn } from "@/lib/utils"

/**
 * Pílula que desliza até a opção escolhida num grupo de pílulas (controle
 * segmentado, abas): a cor vai junto com o clique, em vez de pular. Vai como
 * primeiro filho do grupo, que precisa de `relative`; as opções precisam de
 * `relative` para ficar por cima dela.
 *
 * Até medir (na renderização do servidor, por exemplo) a pílula fica
 * escondida e a opção escolhida mantém o próprio fundo. Depois de medir, o
 * grupo ganha `data-pill`, e as opções usam isso para tirar o próprio fundo
 * (`group-data-[pill]/pill:` nas classes). Com "reduzir movimento", a pílula
 * troca de lugar sem deslizar.
 */
export function PillIndicator({ selector, active }: {
  /** Como achar a opção escolhida dentro do grupo, ex.: `[data-state=on]`. */
  selector: string
  /** A opção escolhida; quando muda, a pílula vai até ela. */
  active: string
}) {
  const ref = useRef<HTMLSpanElement>(null)

  useLayoutEffect(() => {
    const pill = ref.current
    const group = pill?.parentElement
    if (!pill || !group) return

    function place() {
      const target = group!.querySelector<HTMLElement>(selector)
      if (!target) {
        delete group!.dataset.pill
        return
      }
      pill!.style.translate = `${target.offsetLeft}px ${target.offsetTop}px`
      pill!.style.width = `${target.offsetWidth}px`
      pill!.style.height = `${target.offsetHeight}px`
      if (group!.dataset.pill === undefined) {
        // Primeira posição sem animar; daí em diante, desliza.
        pill!.getBoundingClientRect()
        group!.dataset.pill = ""
      }
    }

    place()
    const observer = new ResizeObserver(place)
    observer.observe(group)
    return () => observer.disconnect()
  }, [selector, active])

  return (
    <span
      ref={ref}
      aria-hidden="true"
      className={cn(
        "pointer-events-none absolute top-0 left-0 rounded-full bg-primary opacity-0 shadow-[0_6px_14px_-8px_rgb(11_27_44/0.7)]",
        "group-data-[pill]/pill:opacity-100 motion-safe:group-data-[pill]/pill:transition-[translate,width,height] motion-safe:group-data-[pill]/pill:duration-300 motion-safe:group-data-[pill]/pill:ease-[cubic-bezier(0.2,0,0,1)]"
      )}
    />
  )
}

/** Classes da opção escolhida: fundo próprio até a pílula aparecer, depois só a cor do texto. */
export const PILL_ACTIVE =
  "bg-primary text-primary-foreground shadow-[0_6px_14px_-8px_rgb(11_27_44/0.7)] hover:text-primary-foreground group-data-[pill]/pill:bg-transparent group-data-[pill]/pill:shadow-none"
