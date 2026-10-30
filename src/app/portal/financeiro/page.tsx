import type { Metadata } from "next"

import { PageBody, PageContainer, PageHeader } from "@/components/layout/page"
import { clientStatement } from "@/features/finance/logic"
import { FinanceList, FinanceStatus, OverdueNotice } from "@/features/portal/finance-cards"
import { getPortalFinance } from "@/features/portal/finance-queries"
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
    <PageContainer>
      <PageHeader title="Financeiro" description={client.name} />

      <PageBody width="reading">
        <div className="flex flex-col gap-3">
          <FinanceStatus overdue={statement.overdue.length} total={statement.overdueTotal} />
          {finance.reminders ? (
            <OverdueNotice overdue={statement.overdue} communicationHref={portalHref("/portal/comunicacao", client, user.clients)} />
          ) : null}
        </div>
        {statement.overdue.length > 0 ? (
          <FinanceList id="financeiro-aberto" title="Em aberto" items={statement.overdue} variant="overdue" today={today} empty="" />
        ) : null}
        <FinanceList
          id="financeiro-proximos"
          title="Próximos vencimentos"
          items={statement.upcoming}
          variant="upcoming"
          today={today}
          empty="Nenhum vencimento nos próximos 60 dias."
        />
        <FinanceList
          id="financeiro-pagos"
          title="Pagos nos últimos 12 meses"
          items={statement.paid}
          variant="paid"
          today={today}
          empty="Nenhum pagamento registrado nos últimos 12 meses."
        />
      </PageBody>
    </PageContainer>
  )
}
