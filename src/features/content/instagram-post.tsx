"use client"

import { useEffect, useRef, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/*
 * Partes do post como o Instagram mostra no celular: o cabeçalho com a foto e
 * o @ do cliente e a legenda em duas linhas, com "mais" para abrir. Usadas no
 * post do portal e na prévia do carrossel no admin.
 */

/** Cabeçalho: a foto e o @ (sem @, o nome do cliente). */
export function InstagramHeader({
  avatar,
  handle,
  name,
  className,
}: {
  avatar: ReactNode
  handle: string | null
  name: string
  className?: string
}) {
  return (
    <div className={cn("flex min-w-0 items-center gap-2.5", className)}>
      {avatar}
      <p className="min-w-0 truncate text-sm font-semibold text-foreground">{handle ? handle : name}</p>
    </div>
  )
}

/** Legenda: o @ em negrito, até duas linhas e "mais" quando passa disso. */
export function InstagramCaption({
  handle,
  name,
  text,
  className,
}: {
  handle: string | null
  name: string
  text: string
  className?: string
}) {
  const ref = useRef<HTMLParagraphElement>(null)
  const [open, setOpen] = useState(false)
  const [long, setLong] = useState(false)

  useEffect(() => {
    const element = ref.current
    if (!element) return
    const measure = () => setLong(element.scrollHeight > element.clientHeight + 1)
    measure()
    const observer = new ResizeObserver(measure)
    observer.observe(element)
    return () => observer.disconnect()
  }, [text])

  return (
    <div className={cn("text-sm leading-5 text-foreground", className)}>
      <p ref={ref} className={cn("break-words whitespace-pre-line", !open && "line-clamp-2")}>
        <span className="font-semibold">{handle ? handle : name}</span> {text}
      </p>
      {long && !open ? (
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="-my-2 py-2 text-sm text-muted-foreground outline-none focus-visible:underline"
        >
          mais
        </button>
      ) : null}
    </div>
  )
}
