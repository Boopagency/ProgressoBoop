import { PortalReferralView } from "@/features/portal/referral-view"
import { todayKey } from "@/lib/dates"

import { VitrineShell } from "../../vitrine-shell"
import { CLIENT, referrals } from "../exemplos"

/** O Indicar do portal, com indicações já feitas. */
export default function VitrineReferralPage() {
  const today = todayKey()
  return (
    <VitrineShell area="portal" active="/portal/indicar">
      <PortalReferralView clientId={CLIENT.id} clientName={CLIENT.name} referrals={referrals(today)} today={today} />
    </VitrineShell>
  )
}
