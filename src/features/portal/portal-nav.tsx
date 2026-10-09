import Link from "next/link"

import type { PortalClient } from "@/features/portal/session"
import { cn } from "@/lib/utils"

export type PortalSection = "inicio" | "calendario" | "feed" | "projetos"

const SECTIONS: { value: PortalSection; label: string; path: string }[] = [
  { value: "inicio", label: "Início", path: "/portal" },
  { value: "calendario", label: "Calendário", path: "/portal/calendario" },
  { value: "feed", label: "Feed", path: "/portal/feed" },
  { value: "projetos", label: "Projetos", path: "/portal/projetos" },
]

/** Endereço de uma tela do portal mantendo o cliente escolhido (quando a conta tem mais de um). */
export function portalHref(path: string, client: PortalClient, clients: readonly PortalClient[], extra = ""): string {
  const params = new URLSearchParams(extra)
  if (clients.length > 1) params.set("cliente", client.id)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

/** Abas do portal e, para quem acompanha mais de um cliente, a troca de cliente. */
export function PortalNav({
  section,
  client,
  clients,
}: {
  section: PortalSection
  client: PortalClient
  clients: readonly PortalClient[]
}) {
  const current = SECTIONS.find((item) => item.value === section)
  return (
    <div className="space-y-3">
      {clients.length > 1 ? (
        <nav aria-label="Clientes" className="flex flex-wrap gap-1.5">
          {clients.map((item) => (
            <Link
              key={item.id}
              href={portalHref(current?.path ?? "/portal", item, clients)}
              aria-current={item.id === client.id ? "page" : undefined}
              className={cn(
                "rounded-full border px-3 py-1 text-[13px] transition-colors hover:bg-muted/60",
                item.id === client.id && "border-brand bg-brand-soft font-medium text-brand-ink"
              )}
            >
              {item.name}
            </Link>
          ))}
        </nav>
      ) : null}
      <nav aria-label="Seções" className="flex gap-1 overflow-x-auto border-b">
        {SECTIONS.map((item) => (
          <Link
            key={item.value}
            href={portalHref(item.path, client, clients)}
            aria-current={item.value === section ? "page" : undefined}
            className={cn(
              "-mb-px shrink-0 border-b-2 border-transparent px-3 pb-2 text-sm text-muted-foreground transition-colors hover:text-foreground",
              item.value === section && "border-brand font-medium text-foreground"
            )}
          >
            {item.label}
          </Link>
        ))}
      </nav>
    </div>
  )
}
