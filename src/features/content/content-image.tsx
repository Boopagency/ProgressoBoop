"use client"

import Image from "next/image"
import { useState, type ReactNode } from "react"

import { contentImageUrl } from "@/features/content/logic"
import { cn } from "@/lib/utils"

/**
 * Imagem do bucket `content` pela rota do app, que confere a sessão e
 * redireciona para uma URL assinada (por isso sem a otimização do Next, que
 * buscaria a imagem sem a sessão). Preenche o pai, que precisa ser `relative`.
 * Se não carregar (arquivo apagado), mostra o `fallback`.
 */
export function ContentImage({
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
      src={contentImageUrl(path)}
      alt={alt}
      fill
      unoptimized
      draggable={false}
      onError={() => setFailed(path)}
      className={cn("object-cover", className)}
    />
  )
}

/**
 * Área que abre o seletor de imagem (um `label` com o campo de arquivo
 * escondido, que continua alcançável pelo teclado).
 */
export function ImagePick({
  label,
  onPick,
  disabled = false,
  className,
  children,
}: {
  label: string
  onPick: (file: File) => void
  disabled?: boolean
  className?: string
  children: ReactNode
}) {
  return (
    <label
      title={label}
      className={cn(
        "cursor-pointer outline-none has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40",
        disabled && "pointer-events-none cursor-default opacity-60",
        className
      )}
    >
      <input
        type="file"
        accept="image/*"
        aria-label={label}
        disabled={disabled}
        className="sr-only"
        onChange={(event) => {
          const file = event.target.files?.[0]
          // Limpa para a mesma foto poder ser escolhida de novo.
          event.target.value = ""
          if (file) onPick(file)
        }}
      />
      {children}
    </label>
  )
}
