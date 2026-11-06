"use client"

import Image from "next/image"
import { useState, type ReactNode } from "react"

import { contentImageUrl } from "@/features/content/logic"
import { cn } from "@/lib/utils"

/** Caminho do bucket `content` (pela rota do app) ou um endereço pronto (`data:` ou `/…`, como na vitrine). */
function imageSrc(path: string): string {
  return path.startsWith("data:") || path.startsWith("/") ? path : contentImageUrl(path)
}

/**
 * Imagem de um post no portal, como o `ContentImage` da Central de Conteúdo:
 * preenche o pai (que precisa ser `relative`), sem a otimização do Next (a
 * rota confere a sessão) e com o `fallback` se não carregar.
 */
export function PortalImage({
  path,
  alt = "",
  className,
  fallback = null,
}: {
  path: string
  alt?: string
  className?: string
  fallback?: ReactNode
}) {
  const [failed, setFailed] = useState<string | null>(null)
  if (failed === path) return <>{fallback}</>
  return (
    <Image
      src={imageSrc(path)}
      alt={alt}
      fill
      unoptimized
      draggable={false}
      onError={() => setFailed(path)}
      className={cn("object-cover", className)}
    />
  )
}
