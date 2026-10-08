import type { Metadata } from "next"
import Link from "next/link"
import { redirect } from "next/navigation"

import { requirePortalUser } from "@/features/portal/session"
import { greetingFor } from "@/lib/dates"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Portal" }

/** Início do portal. Nesta fase só recebe a pessoa; o conteúdo vem a seguir. */
export default async function PortalPage(props: PageProps<"/portal">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const requested = typeof searchParams.cliente === "string" ? searchParams.cliente : null
  const client = user.clients.find((item) => item.id === requested) ?? user.clients[0]
  if (!client) redirect("/login")

  return (
    <div className="space-y-8">
      <div className="space-y-1">
        <p className="text-sm text-muted-foreground">{client.name}</p>
        <h1 className="font-display text-2xl leading-8 font-semibold tracking-tight text-foreground">
          {greetingFor()}, {user.name}
        </h1>
      </div>

      {user.clients.length > 1 ? (
        <nav aria-label="Clientes" className="flex flex-wrap gap-1.5">
          {user.clients.map((item) => (
            <Link
              key={item.id}
              href={`/portal?cliente=${item.id}`}
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

      <section className="rounded-xl border bg-card px-5 py-6">
        <h2 className="text-sm font-semibold text-foreground">Seu espaço com a Boop</h2>
        <p className="mt-2 text-[13px] leading-5 text-muted-foreground">
          Em breve, aqui você vai ver o calendário e o feed dos seus posts, aprovar ou pedir ajustes nas peças e
          conversar com a equipe sobre cada uma.
        </p>
      </section>
    </div>
  )
}
