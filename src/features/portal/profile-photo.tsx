"use client"

import { ContentImage } from "@/features/content/content-image"
import { clientColor } from "@/features/content/post-meta"
import { cn } from "@/lib/utils"

/** Foto do perfil do cliente no feed do portal; sem foto, a inicial na cor do cliente. */
export function ProfilePhoto({
  clientId,
  name,
  path,
  className,
}: {
  clientId: string
  name: string
  path: string | null
  className?: string
}) {
  const initial = (
    <span
      className={cn("absolute inset-0 flex items-center justify-center text-2xl font-semibold select-none", clientColor(clientId))}
    >
      {name.trim().charAt(0).toLocaleUpperCase("pt-BR")}
    </span>
  )
  return (
    <span className={cn("relative block size-16 shrink-0 overflow-hidden rounded-full border sm:size-20", className)}>
      {path ? <ContentImage path={path} alt={`Foto de ${name}`} fallback={initial} /> : initial}
    </span>
  )
}
