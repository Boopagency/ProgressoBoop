import { PageBody, PageContainer } from "@/components/layout/page"
import type { ClientStatement } from "@/features/finance/logic"
import { FinanceList, FinanceStatus, OverdueNotice } from "@/features/portal/finance-cards"
import { PortalHeader } from "@/features/portal/portal-ui"
import type { DateKey } from "@/lib/types"

export interface PortalFinanceData {
  clientName: string
  statement: ClientStatement
  /** O aviso de atraso está ligado para o cliente. */
  reminders: boolean
  communicationHref: string
  today: DateKey
}

/**
 * Financeiro do cliente: o selo (em dia ou pagamento em aberto) com os
 * totais, o aviso gentil do atraso e as três listas: em aberto, próximos
 * vencimentos e pagos nos últimos 12 meses.
 */
export function PortalFinanceView({ clientName, statement, reminders, communicationHref, today }: PortalFinanceData) {
  return (
    <PageContainer>
      <PortalHeader
        client={clientName}
        title={
          <>
            Seu <em>financeiro</em>
          </>
        }
        description="As cobranças da Boop: o que está em aberto, os próximos vencimentos e o que já foi pago."
      />

      <PageBody width="reading">
        <div className="flex flex-col gap-4">
          <FinanceStatus overdue={statement.overdue} upcoming={statement.upcoming} paid={statement.paid} />
          {reminders ? <OverdueNotice overdue={statement.overdue} communicationHref={communicationHref} /> : null}
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
