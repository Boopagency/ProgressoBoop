import type { Metadata } from "next"

import { getPortalReferrals } from "@/features/portal/referral-queries"
import { PortalReferralView } from "@/features/portal/referral-view"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Indicar" }

/**
 * Indicações: o cliente indica alguém para a Boop (cai no Comercial, com aviso
 * para quem cuida das indicações) e acompanha em que pé estão as que já fez.
 */
export default async function PortalReferralPage(props: PageProps<"/portal/indicar">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const referrals = await getPortalReferrals(client.id)
  return <PortalReferralView clientId={client.id} clientName={client.name} referrals={referrals} today={todayKey()} />
}
