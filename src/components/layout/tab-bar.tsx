"use client"

import type { LucideIcon } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { cn } from "@/lib/utils"

/*
 * Menu de baixo do celular (admin e portal), no lugar do menu lateral, como
 * num aplicativo: as telas do dia a dia e o "Mais". Some do `md` para cima.
 * A altura (3,5rem mais a área segura do iPhone) fica em `--app-bottom-bar`,
 * posta pelo layout, para as telas e as barras fixas, como o Aprovar do post
 * no portal, ficarem acima dele.
 */

export function TabBar({ label, children }: { label: string; children: ReactNode }) {
  return (
    <nav
      aria-label={label}
      data-slot="tab-bar"
      className="fixed inset-x-0 bottom-0 z-40 border-t border-sidebar-border bg-sidebar pb-[env(safe-area-inset-bottom)] text-sidebar-foreground md:hidden"
    >
      <ul className="mx-auto flex h-14 max-w-lg">{children}</ul>
    </nav>
  )
}

interface TabBarItemProps {
  title: string
  icon: LucideIcon
  active?: boolean
  /** Contador no ícone (não lidas, pendências). */
  count?: number
  /** Como o contador é lido em voz alta (ex.: "3 mensagens não lidas"). */
  countLabel?: string
  href?: string
  onClick?: () => void
}

/** Um item do menu de baixo: o ícone (com o contador) e o nome; o ativo leva a cor da marca. */
export function TabBarItem({ title, icon: Icon, active = false, count = 0, countLabel, href, onClick }: TabBarItemProps) {
  const className =
    "group/tab flex h-full w-full flex-col items-center justify-center gap-0.5 text-[11px] leading-none font-medium outline-none select-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
  const content = (
    <>
      <span
        className={cn(
          "relative flex h-7 w-12 items-center justify-center rounded-full text-muted-foreground transition-colors group-active/tab:bg-sidebar-accent",
          active && "bg-sidebar-accent text-brand-ink"
        )}
      >
        <Icon className="size-[22px]" strokeWidth={active ? 2.25 : 2} aria-hidden="true" />
        {count > 0 ? (
          <span className="absolute -top-1 left-[calc(50%+4px)] flex h-4 min-w-4 items-center justify-center rounded-full bg-brand px-1 text-[10px] leading-none font-semibold text-brand-navy tabular-nums ring-2 ring-sidebar">
            {count > 99 ? "99+" : count}
          </span>
        ) : null}
      </span>
      <span className={cn("text-muted-foreground max-[380px]:text-[10.5px] max-[380px]:tracking-tight", active && "font-semibold text-foreground")}>
        {title}
      </span>
      {count > 0 && countLabel ? <span className="sr-only">, {countLabel}</span> : null}
    </>
  )

  return (
    <li className="min-w-0 flex-1">
      {href ? (
        <Link href={href} aria-current={active ? "page" : undefined} className={className} onClick={onClick}>
          {content}
        </Link>
      ) : (
        <button type="button" aria-haspopup="dialog" className={className} onClick={onClick}>
          {content}
        </button>
      )}
    </li>
  )
}
