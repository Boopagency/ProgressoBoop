import { PortalFinanceView } from "@/features/portal/finance-view"
import { todayKey } from "@/lib/dates"

import { VitrineShell } from "../../vitrine-shell"
import { CLIENT, statement } from "../exemplos"

/** O Financeiro do portal em dia. */
export default function VitrineFinanceOkPage() {
  const today = todayKey()
  return (
    <VitrineShell area="portal" active="/portal/financeiro">
      <PortalFinanceView clientName={CLIENT.name} statement={statement(today, false)} reminders communicationHref="#" today={today} />
    </VitrineShell>
  )
}
