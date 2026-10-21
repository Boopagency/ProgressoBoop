"use client"

import { ContentImage } from "@/features/content/content-image"
import { clientColor } from "@/features/content/post-meta"
import { cn } from "@/lib/utils"

/**
 * Foto do perfil do cliente no feed do portal; sem foto, a inicial na cor do
 * cliente. `sm` é a do cabeçalho do post, como no Instagram.
 */
export function ProfilePhoto({
  clientId,
  name,
  path,
  size = "md",
  className,
}: {
  clientId: string
  name: string
  path: string | null
  size?: "md" | "sm"
  className?: string
}) {
  const initial = (
    <span
      className={cn(
        "absolute inset-0 flex items-center justify-center font-semibold select-none",
        size === "sm" ? "text-sm" : "text-2xl",
        clientColor(clientId)
      )}
    >
      {name.trim().charAt(0).toLocaleUpperCase("pt-BR")}
    </span>
  )
  return (
    <span
      className={cn(
        "relative block shrink-0 overflow-hidden rounded-full border",
        size === "sm" ? "size-8" : "size-16 sm:size-20",
        className
      )}
    >
      {path ? <ContentImage path={path} alt={`Foto de ${name}`} fallback={initial} /> : initial}
    </span>
  )
}
