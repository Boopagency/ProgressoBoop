import { Clock3, Mic, PartyPopper } from "lucide-react"
import Link from "next/link"

import { PageBody, PageContainer } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import { isBriefingOpen } from "@/features/briefing/logic"
import type { PortalBriefing } from "@/features/briefing/portal-queries"
import { PortalHeader, PortalSectionTitle } from "@/features/portal/portal-ui"
import { formatLongDate } from "@/lib/dates"

/**
 * Tela do Briefing no portal (PR 1 da Parte 1 do issue #108): boas-vindas,
 * os blocos com o tempo de cada um e o prazo. O passo a passo (uma pergunta
 * por tela, áudio em destaque) entra no PR 2. Enviado, agradece e leva de
 * volta ao portal.
 */
export function PortalBriefingWelcome({
  clientName,
  briefing,
  homeHref,
}: {
  clientName: string
  briefing: PortalBriefing
  homeHref: string
}) {
  if (!isBriefingOpen(briefing.status)) {
    return (
      <PageContainer>
        <PortalHeader
          client={clientName}
          title={
            <>
              Briefing <em>enviado</em>
            </>
          }
          description="Obrigado! A equipe já está lendo tudo e chama você para a reunião de imersão."
        />
        <PageBody width="reading" className="max-w-[720px]">
          <div className="flex items-center gap-3 rounded-2xl border bg-card px-5 py-4">
            <PartyPopper className="size-5 shrink-0 text-brand-ink" aria-hidden="true" />
            <p className="flex-1 text-[14px] leading-6 text-foreground">O resto do portal já está liberado.</p>
            <Button asChild size="sm">
              <Link href={homeHref}>Ir para o início</Link>
            </Button>
          </div>
        </PageBody>
      </PageContainer>
    )
  }

  const minutes = briefing.blocks.reduce((total, block) => total + (block.estimated_minutes ?? 0), 0)

  return (
    <PageContainer>
      <PortalHeader
        client={clientName}
        title={
          <>
            Bora conhecer a sua <em>marca</em>
          </>
        }
        description="Antes de começar, a Boop quer ouvir você. Responde do seu jeito, de preferência falando: dá pra pausar e voltar quando quiser."
        stats={[
          { label: "Minutos, mais ou menos", value: minutes },
          { label: "Etapas", value: briefing.blocks.length },
        ]}
      />

      <PageBody width="reading" className="max-w-[880px] space-y-6">
        <section className="glass-panel rounded-3xl px-6 py-5">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
            <span className="flex size-12 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground">
              <Mic className="size-5" aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-[15px] font-medium text-foreground">Falar é mais rápido que digitar.</p>
              <p className="mt-1 text-[13px] leading-5 text-muted-foreground">
                Cada pergunta tem uma dica com exemplo. Tudo fica salvo sozinho. Prazo: {formatLongDate(briefing.due_on)}.
              </p>
            </div>
          </div>
          <p className="mt-4 text-[13px] leading-5 text-muted-foreground">
            O passo a passo abre aqui em breve. Enquanto isso, o resto do portal fica fechado.
          </p>
        </section>

        <section aria-labelledby="briefing-etapas" className="space-y-3">
          <PortalSectionTitle id="briefing-etapas" count={briefing.blocks.length}>
            Etapas
          </PortalSectionTitle>
          <ol className="divide-y overflow-hidden rounded-2xl border bg-card">
            {briefing.blocks.map((block, index) => (
              <li key={block.id} className="flex items-start gap-3.5 px-5 py-3.5">
                <span className="display-number w-6 shrink-0 text-[22px] leading-none text-muted-foreground">{index}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] font-medium text-foreground">{block.title}</p>
                  {block.description ? <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{block.description}</p> : null}
                </div>
                {block.estimated_minutes ? (
                  <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                    <Clock3 className="size-3.5" aria-hidden="true" />
                    cerca de {block.estimated_minutes} min
                  </span>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      </PageBody>
    </PageContainer>
  )
}
