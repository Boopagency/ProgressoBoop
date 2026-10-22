import type { Metadata } from "next"

import { PageBody, PageContainer, PageHeader } from "@/components/layout/page"
import { ReferralForm } from "@/features/portal/referral-form"
import { REFERRAL_STATUS_LABEL, type ReferralStatus } from "@/features/portal/referral-logic"
import { getPortalReferrals } from "@/features/portal/referral-queries"
import { pickPortalClient, requirePortalUser } from "@/features/portal/session"
import { formatShortDate, toDateKey, todayKey } from "@/lib/dates"
import { cn } from "@/lib/utils"

export const metadata: Metadata = { title: "Indicar" }

const STATUS_CLASS: Record<ReferralStatus, string> = {
  received: "bg-muted text-muted-foreground",
  talking: "bg-brand-soft text-brand-ink",
  won: "bg-success/15 text-success-ink",
  closed: "bg-muted text-muted-foreground",
}

/**
 * Indicações: o cliente indica alguém para a Boop (cai no Comercial, com aviso
 * para quem cuida das indicações) e acompanha em que pé estão as que já fez.
 */
export default async function PortalReferralPage(props: PageProps<"/portal/indicar">) {
  const [user, searchParams] = await Promise.all([requirePortalUser(), props.searchParams])
  const client = pickPortalClient(user, searchParams.cliente)
  const referrals = await getPortalReferrals(client.id)
  const today = todayKey()

  return (
    <PageContainer>
      <PageHeader
        title="Indicar"
        description="Conhece alguém que precisa de marketing? Indique para a Boop e a nossa equipe cuida do resto."
      />

      <PageBody width="reading" className="max-w-[720px]">
        <ReferralForm clientId={client.id} />

        {referrals.length > 0 ? (
          <section aria-labelledby="indicacoes-feitas" className="space-y-3">
            <h2 id="indicacoes-feitas" className="text-sm font-semibold text-foreground">
              Suas indicações
            </h2>
            <ul className="divide-y rounded-xl border bg-card">
              {referrals.map((item) => (
                <li key={item.id} className="flex items-center gap-3 px-4 py-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-foreground">{item.contact_name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[item.company, formatShortDate(toDateKey(item.created_at), today)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span
                    className={cn("shrink-0 rounded-full px-2 py-0.5 text-xs font-medium whitespace-nowrap", STATUS_CLASS[item.status])}
                  >
                    {REFERRAL_STATUS_LABEL[item.status]}
                  </span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}
      </PageBody>
    </PageContainer>
  )
}
