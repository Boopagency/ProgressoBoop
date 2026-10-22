"use client"

import type { ComponentProps } from "react"

import { useViewFade } from "@/hooks/use-view-fade"

/**
 * Bloco que entra com um fade curto quando `view` muda (ver `useViewFade`).
 * Para quando só parte do corpo da tela troca de visão, e o resto (como os
 * números do topo) deve ficar parado.
 */
export function ViewFade({ view, ...props }: ComponentProps<"div"> & { view: string }) {
  const ref = useViewFade(view)
  return <div ref={ref} {...props} />
}
