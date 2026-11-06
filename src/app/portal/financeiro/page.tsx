import type { Metadata } from "next"

import { clientStatement } from "@/features/finance/logic"
import { getPortalFinance } from "@/features/portal/finance-queries"
import { PortalFinanceView } from "@/features/portal/finance-view"
import { portalHref } from "@/features/portal/links"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Financeiro" }

/**
 * Financeiro do cliente: se está em dia, o que está em aberto (com quantos
 * dias), os próximos vencimentos e o que já foi pago nos últimos 12 meses. Só
 * as cobranças da Boop para o cliente, pelas mesmas regras da equipe (o "Em
 * atraso" daqui é o da página do cliente no admin).
 */
export default async function PortalFinancePage(props: PageProps<"/portal/financeiro">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const finance = await getPortalFinance(client.id)
  const today = todayKey()
  const statement = clientStatement(client.id, finance.entries, finance.recurrences, today)

  return (
    <PortalFinanceView
      clientName={client.name}
      statement={statement}
      reminders={finance.reminders}
      communicationHref={portalHref("/portal/comunicacao", client, user.clients)}
      today={today}
    />
  )
}
