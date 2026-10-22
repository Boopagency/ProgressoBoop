"use client"

import { useEffect } from "react"

/** O teclado aberto tira pelo menos isto da altura da tela (px). */
const KEYBOARD_MIN = 120

/**
 * A parte da tela que se vê, em variáveis CSS no <html>, para as telas cheias
 * do celular (a conversa e o post) acompanharem o teclado: `--vv-height` e
 * `--vv-top` (altura e topo do que se vê; no iPhone, o teclado não encolhe a
 * página, só a parte visível) e `--vv-safe-bottom` (a área segura de baixo,
 * zero com o teclado aberto). Sem `visualViewport`, as telas usam 100dvh e 0.
 */
export function VisualViewportVars() {
  useEffect(() => {
    const viewport = window.visualViewport
    if (!viewport) return
    const root = document.documentElement
    let frame = 0

    function update() {
      frame = 0
      if (!viewport) return
      // Com zoom de pinça, vale a tela inteira (a conversa não encolhe junto).
      const zoomed = viewport.scale > 1.01
      const height = zoomed ? window.innerHeight : viewport.height
      const keyboard = !zoomed && window.innerHeight - viewport.height > KEYBOARD_MIN
      root.style.setProperty("--vv-height", `${Math.round(height)}px`)
      root.style.setProperty("--vv-top", `${zoomed ? 0 : Math.round(viewport.offsetTop)}px`)
      root.style.setProperty("--vv-safe-bottom", keyboard ? "0px" : "env(safe-area-inset-bottom)")
    }

    function schedule() {
      if (!frame) frame = window.requestAnimationFrame(update)
    }

    update()
    viewport.addEventListener("resize", schedule)
    viewport.addEventListener("scroll", schedule)
    return () => {
      viewport.removeEventListener("resize", schedule)
      viewport.removeEventListener("scroll", schedule)
      window.cancelAnimationFrame(frame)
      for (const name of ["--vv-height", "--vv-top", "--vv-safe-bottom"]) root.style.removeProperty(name)
    }
  }, [])

  return null
}
