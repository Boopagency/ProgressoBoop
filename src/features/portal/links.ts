import type { PortalClient } from "@/features/portal/session"

/*
 * Endereços do portal. Quem acompanha mais de um cliente leva o escolhido em
 * `?cliente=`; com um cliente só, o endereço fica limpo.
 */

/** Endereço de uma tela do portal mantendo o cliente escolhido (quando a conta tem mais de um). */
export function portalHref(path: string, client: PortalClient, clients: readonly PortalClient[], extra = ""): string {
  const params = new URLSearchParams(extra)
  if (clients.length > 1) params.set("cliente", client.id)
  const query = params.toString()
  return query ? `${path}?${query}` : path
}

/** Cliente escolhido em `?cliente=` (precisa ser da conta); senão, o primeiro. Mesma regra de `pickPortalClient`. */
export function selectedClient(clients: readonly PortalClient[], requested: string | null): PortalClient | null {
  return clients.find((item) => item.id === requested) ?? clients[0] ?? null
}
