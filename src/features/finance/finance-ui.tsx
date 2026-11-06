import { AlertTriangle, ChevronLeft, ChevronRight, Info } from "lucide-react"
import Link from "next/link"
import type { ReactNode } from "react"

import { MonthTitle } from "@/components/month-title"
import { Button } from "@/components/ui/button"
import { addPeriods, periodParam } from "@/features/clients/logic"
import type { DreStatus, FinanceAlert } from "@/features/finance/management"
import { formatMonthYear } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

export const DRE_STATUS_LABEL: Record<DreStatus, string> = {
  closed: "Fechado",
  realized: "Realizado",
  current: "Parcial",
  forecast: "Previsto",
}

export const DRE_STATUS_HINT: Record<DreStatus, string> = {
  closed: "Conferido com o extrato; os pagamentos do mês estão travados.",
  realized: "O que foi recebido e pago no mês (ainda não fechado).",
  current: "O que já entrou e saiu, mais o que ainda vence neste mês.",
  forecast: "Contratos, custos fixos e lançamentos já agendados.",
}

/** Selo do mês no DRE: fechado, realizado, parcial ou previsto. */
export function StatusChip({ status, className }: { status: DreStatus; className?: string }) {
  return (
    <span
      title={DRE_STATUS_HINT[status]}
      className={cn(
        "inline-flex h-5 items-center rounded-full px-1.5 text-[11px] font-medium whitespace-nowrap",
        status === "closed" && "bg-brand-soft text-brand-ink",
        status === "realized" && "bg-muted text-foreground",
        status === "current" && "bg-muted text-muted-foreground",
        status === "forecast" && "border border-dashed text-muted-foreground",
        className
      )}
    >
      {DRE_STATUS_LABEL[status]}
    </span>
  )
}

/** Linha "rótulo ........ valor" dos resumos (DRE do mês, divisão do resultado). */
export function MoneyLine({
  label,
  value,
  strong = false,
  tone,
  href,
  indent = false,
}: {
  label: ReactNode
  value: ReactNode
  strong?: boolean
  tone?: "negative" | "muted"
  href?: string
  indent?: boolean
}) {
  const content = (
    <>
      <dt className={cn("min-w-0 truncate", strong ? "font-medium text-foreground" : "text-muted-foreground", indent && "pl-3")}>{label}</dt>
      <dd
        className={cn(
          "shrink-0 tabular-nums",
          strong ? "font-semibold" : "font-normal",
          tone === "negative" ? "text-overdue" : tone === "muted" ? "text-muted-foreground" : "text-foreground"
        )}
      >
        {value}
      </dd>
    </>
  )
  const base = "flex items-baseline justify-between gap-3 py-1 text-[13px]"
  return href ? (
    <Link href={href} className={cn(base, "-mx-2 rounded-md px-2 transition-colors hover:bg-muted/60")}>
      {content}
    </Link>
  ) : (
    <div className={base}>{content}</div>
  )
}

/** Navegação de mês (‹ outubro de 2026 ›) com volta ao mês atual. */
export function MonthNav({
  period,
  current,
  basePath,
  hrefFor,
  hero = false,
}: {
  period: DateKey
  current: DateKey
  basePath: string
  /** No painel de destaque: o nome do mês grande, na serifada itálica. */
  hero?: boolean
  /** Endereço de outro mês (padrão: `?mes=`), para manter outros filtros. */
  hrefFor?: (period: DateKey) => string
}) {
  const href = hrefFor ?? ((target: DateKey) => (target === current ? basePath : `${basePath}?mes=${periodParam(target)}`))
  return (
    <nav aria-label="Mês" className="flex items-center gap-2">
      <Button variant="outline" size="icon-sm" asChild aria-label="Mês anterior">
        <Link href={href(addPeriods(period, -1))} scroll={false}>
          <ChevronLeft />
        </Link>
      </Button>
      {hero ? (
        <h2 className="min-w-0 px-1 text-center font-display text-[22px] leading-none font-medium tracking-[-0.03em] text-foreground sm:min-w-52 sm:text-[26px]">
          <MonthTitle period={period} />
        </h2>
      ) : (
        <h2 className="min-w-44 text-center font-display text-base font-semibold text-foreground">{formatMonthYear(period)}</h2>
      )}
      <Button variant="outline" size="icon-sm" asChild aria-label="Próximo mês">
        <Link href={href(addPeriods(period, 1))} scroll={false}>
          <ChevronRight />
        </Link>
      </Button>
      {period !== current ? (
        <Button variant="ghost" size="sm" asChild className="text-muted-foreground">
          <Link href={href(current)} scroll={false}>
            Este mês
          </Link>
        </Button>
      ) : null}
    </nav>
  )
}

/** Pílula de vidro com um número curto (margem, MRR) no painel de destaque. */
export function HeroChip({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="inline-flex h-8 items-center gap-2 rounded-full border border-glass-edge bg-glass px-3.5 text-xs shadow-[inset_0_1px_0_var(--glass-highlight)]">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-foreground tabular-nums">{value}</dd>
    </div>
  )
}

/** Vazio do financeiro: ícone em vidro, o que fazer e o botão. */
export function FinanceEmpty({ icon, title, children, action, className }: { icon: ReactNode; title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col items-center rounded-2xl border border-dashed border-foreground/15 bg-card px-6 py-14 text-center", className)}>
      <div className="flex size-12 items-center justify-center rounded-full border border-glass-edge bg-glow-soft text-brand-ink shadow-[0_0_24px_-6px_var(--glow)] [&_svg]:size-5">
        {icon}
      </div>
      <h2 className="mt-4 font-display text-[17px] font-medium tracking-tight text-foreground">{title}</h2>
      {children ? <div className="mt-1.5 max-w-md text-sm text-muted-foreground">{children}</div> : null}
      {action ? <div className="mt-5 flex flex-wrap justify-center gap-2">{action}</div> : null}
    </div>
  )
}

/** Alertas do financeiro (cada um leva à tela onde se resolve). */
export function AlertList({ alerts, empty }: { alerts: FinanceAlert[]; empty?: string }) {
  if (alerts.length === 0) {
    return empty ? <p className="px-4 py-3.5 text-[13px] text-muted-foreground">{empty}</p> : null
  }
  return (
    <ul className="divide-y">
      {alerts.map((alert) => (
        <li key={alert.key}>
          <Link href={alert.href} className="flex gap-3 px-4 py-3 transition-colors hover:bg-muted/40">
            {alert.tone === "attention" ? (
              <AlertTriangle className="mt-0.5 size-4 shrink-0 text-warning-ink" aria-label="Atenção" />
            ) : (
              <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-label="Aviso" />
            )}
            <span className="min-w-0">
              <span className="block text-[13px] font-medium text-foreground">{alert.title}</span>
              <span className="block text-xs text-muted-foreground">{alert.detail}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  )
}

/** Link para o extrato com os lançamentos que formam um número. */
export function ledgerHref(params: { mes?: DateKey; de?: DateKey; ate?: DateKey; contas?: readonly string[]; cliente?: string; situacao?: string }): string {
  const search = new URLSearchParams()
  if (params.mes) search.set("mes", periodParam(params.mes))
  if (params.de) search.set("de", periodParam(params.de))
  if (params.ate) search.set("ate", periodParam(params.ate))
  if (params.contas && params.contas.length > 0) search.set("conta", params.contas.join(","))
  if (params.cliente) search.set("cliente", params.cliente)
  if (params.situacao) search.set("situacao", params.situacao)
  const query = search.toString()
  return query ? `/financeiro/lancamentos?${query}` : "/financeiro/lancamentos"
}
