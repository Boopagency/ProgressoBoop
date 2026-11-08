"use client"

import Link from "next/link"
import { usePathname } from "next/navigation"

import { PILL_ACTIVE, PillIndicator } from "@/components/pill-indicator"
import { cn } from "@/lib/utils"

/** Abas da central de briefings (cada uma é uma rota). */
const TABS = [
  { path: "", label: "Briefings" },
  { path: "/configuracao", label: "Configuração" },
] as const

/**
 * Abas da central, logo abaixo do título: a lista de todos os briefings e o
 * editor de perguntas. `basePath` troca o começo dos links (a vitrine monta
 * a central em outro endereço).
 */
export function BriefingCentralNav({ basePath = "/briefing" }: { basePath?: string }) {
  const pathname = usePathname()
  return (
    // py-2: espaço para a sombra das pílulas dentro da rolagem lateral.
    <nav aria-label="Seções do briefing" className="group/pill relative -mx-4 mt-4 overflow-x-auto px-4 py-2 sm:-mx-2 sm:px-2">
      <PillIndicator selector="[aria-current=page]" active={pathname} />
      <ul className="flex w-max gap-1 rounded-full bg-card p-1 shadow-card">
        {TABS.map((tab) => {
          const href = basePath + tab.path
          const active = tab.path === "" ? !pathname.startsWith(`${basePath}/configuracao`) : pathname.startsWith(href)
          return (
            <li key={tab.path}>
              <Link
                href={href}
                aria-current={active ? "page" : undefined}
                className={cn(
                  "relative inline-flex h-8 items-center rounded-full px-4 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40",
                  active && PILL_ACTIVE
                )}
              >
                {tab.label}
              </Link>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}
