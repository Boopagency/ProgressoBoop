import { PortalFinanceView } from "@/features/portal/finance-view"
import { todayKey } from "@/lib/dates"

import { VitrineShell } from "../../vitrine-shell"
import { CLIENT, statement } from "../exemplos"

/** O Financeiro do portal com um pagamento em aberto (e o aviso ligado). */
export default function VitrineFinancePage() {
  const today = todayKey()
  return (
    <VitrineShell area="portal" active="/portal/financeiro">
      <PortalFinanceView clientName={CLIENT.name} statement={statement(today, true)} reminders communicationHref="#" today={today} />
    </VitrineShell>
  )
}
