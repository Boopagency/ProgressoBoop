import { PageBody, PageContainer } from "@/components/layout/page"
import { ReferralForm } from "@/features/portal/referral-form"
import { REFERRAL_STATUS_LABEL, type PortalReferral, type ReferralStatus } from "@/features/portal/referral-logic"
import { PortalHeader, PortalSectionTitle } from "@/features/portal/portal-ui"
import { formatShortDate, toDateKey } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const STATUS_CLASS: Record<ReferralStatus, string> = {
  received: "border-foreground/15 bg-muted text-muted-foreground",
  talking: "border-glow/25 bg-brand-soft text-brand-ink",
  won: "border-success/30 bg-success/12 text-success-ink",
  closed: "border-foreground/10 bg-transparent text-subtle-foreground",
}

/** Como funciona, em três passos (o que acontece com a indicação). */
const STEPS = [
  { title: "Você indica", text: "Nome e um contato de quem precisa de marketing." },
  { title: "A gente conversa", text: "A equipe comercial da Boop entra em contato." },
  { title: "Você acompanha", text: "Veja aqui embaixo em que pé está cada indicação." },
] as const

export interface PortalReferralData {
  clientId: string
  clientName: string
  referrals: PortalReferral[]
  today: DateKey
}

/**
 * Indicações: o cliente indica alguém para a Boop (cai no Comercial, com aviso
 * para quem cuida das indicações) e acompanha em que pé estão as que já fez.
 */
export function PortalReferralView({ clientId, clientName, referrals, today }: PortalReferralData) {
  const won = referrals.filter((item) => item.status === "won").length

  return (
    <PageContainer>
      <PortalHeader
        client={clientName}
        title={
          <>
            Indique a <em>Boop</em>
          </>
        }
        description="Conhece alguém que precisa de marketing? Indique para a Boop e a nossa equipe cuida do resto."
        stats={
          referrals.length > 0
            ? [
                { label: "Indicações", value: referrals.length },
                { label: "Viraram cliente", value: won },
              ]
            : undefined
        }
      />

      <PageBody width="reading" className="max-w-[880px]">
        <ol className="grid gap-3 sm:grid-cols-3">
          {STEPS.map((step, index) => (
            <li key={step.title} className="flex items-start gap-3.5 rounded-2xl border bg-card px-4 py-3.5 sm:block sm:py-4">
              <span className="w-6 shrink-0 display-number text-[34px] leading-none text-brand-ink">{index + 1}</span>
              <div className="min-w-0 sm:mt-2">
                <p className="text-sm font-semibold text-foreground">{step.title}</p>
                <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{step.text}</p>
              </div>
            </li>
          ))}
        </ol>

        <ReferralForm clientId={clientId} />

        {referrals.length > 0 ? (
          <section aria-labelledby="indicacoes-feitas" className="space-y-3">
            <PortalSectionTitle id="indicacoes-feitas" count={referrals.length}>
              Suas indicações
            </PortalSectionTitle>
            <ul className="overflow-hidden rounded-[1.5rem] border bg-card">
              {referrals.map((item) => (
                <li key={item.id} className="flex items-center gap-3.5 border-b border-border/70 px-4 py-3.5 last:border-b-0 sm:px-5">
                  <span
                    aria-hidden="true"
                    className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-display text-sm font-medium text-foreground"
                  >
                    {item.contact_name.trim().charAt(0).toLocaleUpperCase("pt-BR")}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-semibold text-foreground">{item.contact_name}</p>
                    <p className="mt-0.5 truncate text-xs text-muted-foreground">
                      {[item.company, formatShortDate(toDateKey(item.created_at), today)].filter(Boolean).join(" · ")}
                    </p>
                  </div>
                  <span
                    className={cn(
                      "inline-flex h-6 shrink-0 items-center rounded-full border px-2.5 text-xs font-medium whitespace-nowrap",
                      STATUS_CLASS[item.status]
                    )}
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
