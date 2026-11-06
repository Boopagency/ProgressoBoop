"use client"

import { useLayoutEffect, useRef } from "react"

import { cn } from "@/lib/utils"

/**
 * Número que conta até o valor: de zero ao aparecer e do valor anterior
 * quando muda. O texto é o valor final desde a primeira pintura (servidor e
 * leitores de tela); só o desenho anima, e com "reduzir movimento" nada anima.
 */
export function CountUp({ value, duration = 700, className }: { value: number; duration?: number; className?: string }) {
  const ref = useRef<HTMLSpanElement>(null)
  // O número mostrado quando a animação anterior parou (zero ao aparecer).
  const shown = useRef(0)

  useLayoutEffect(() => {
    const node = ref.current?.firstChild
    if (!node) return
    const from = shown.current
    shown.current = value
    if (from === value || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    const start = performance.now()
    let frame = 0
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration)
      const eased = 1 - (1 - progress) ** 4
      node.nodeValue = String(Math.round(from + (value - from) * eased))
      if (progress < 1) frame = requestAnimationFrame(step)
    }
    node.nodeValue = String(from)
    frame = requestAnimationFrame(step)
    return () => {
      cancelAnimationFrame(frame)
      shown.current = Number(node.nodeValue) || 0
    }
  }, [value, duration])

  return (
    <span ref={ref} className={cn("tabular-nums", className)}>
      {value}
    </span>
  )
}
