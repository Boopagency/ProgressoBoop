"use client"

import { useLayoutEffect, useRef } from "react"

const KEYFRAMES: Keyframe[] = [
  { opacity: 0, transform: "translateY(6px)" },
  { opacity: 1, transform: "none" },
]
const TIMING: KeyframeAnimationOptions = { duration: 300, easing: "cubic-bezier(0.2, 0, 0, 1)" }

/**
 * Troca de visão dentro da mesma tela (Calendário | Quadro | 7 dias, Lista |
 * Quadro, Mês | Semana, Todas | Minhas): o elemento com o ref entra com um
 * fade curto sempre que `view` muda, e o que está fora dele (título, filtros,
 * números) fica parado. Nada é montado de novo, então o estado das listas
 * continua. Não anima na primeira montagem (aí quem entra é a tela inteira,
 * pelo PageContainer) nem com "reduzir movimento" ligado no sistema.
 */
export function useViewFade<T extends HTMLElement = HTMLDivElement>(view: string) {
  const ref = useRef<T>(null)
  const shown = useRef(view)

  // Antes da pintura: o miolo novo já começa transparente, sem piscar.
  useLayoutEffect(() => {
    if (shown.current === view) return
    shown.current = view
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    ref.current?.animate(KEYFRAMES, TIMING)
  }, [view])

  return ref
}
