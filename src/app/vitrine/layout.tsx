import type { Metadata } from "next"
import { notFound } from "next/navigation"
import type { ReactNode } from "react"

export const metadata: Metadata = { title: "Vitrine" }

/**
 * Vitrine do visual, só em desenvolvimento: as peças e as telas principais
 * montadas com dados de exemplo (nada vem do banco). Em produção, não existe.
 */
export default function VitrineLayout({ children }: { children: ReactNode }) {
  if (process.env.NODE_ENV === "production") notFound()
  return children
}
