"use client"

import Link from "next/link"
import { useId, useMemo, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { PanelCard } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { addPeriods, periodLabel } from "@/features/clients/logic"
import { updateFinanceSettings } from "@/features/finance/actions"
import { MoneyLine } from "@/features/finance/finance-ui"
import { fixedCostsMonthly, indexFinance, type FinanceData } from "@/features/finance/management"
import { formatMoney, moneyInputValue, parseMoney } from "@/features/finance/money"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate, toDateKey } from "@/lib/dates"
import { formatPercent } from "@/lib/format"
import type { DateKey } from "@/lib/types"

/** "6" / "6,5" → pontos-base (650); null se inválido. */
function parsePercent(text: string): number | null {
  const clean = text.replace("%", "").replace(",", ".").trim()
  if (!/^\d+(\.\d{1,2})?$/.test(clean)) return null
  return Math.round(Number(clean) * 100)
}

function percentInput(bps: number): string {
  return (bps / 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })
}

/** Saldo pode ser zero ou negativo. */
function parseBalance(text: string): number | null {
  const clean = text.trim()
  if (/^[-−]?\s*(R\$)?\s*0+([.,]0{1,2})?$/.test(clean)) return 0
  const negative = /^[-−]/.test(clean)
  const cents = parseMoney(clean.replace(/^[-−]/, ""))
  return cents === null ? null : negative ? -cents : cents
}

/** Aba Parâmetros: as premissas da planilha (aba PARÂMETROS), com o efeito de cada uma. */
export function SettingsView({ data, today }: { data: FinanceData; today: DateKey }) {
  const ids = useId()
  const { profileById } = useWorkspace()
  const settings = data.settings
  const index = useMemo(() => indexFinance(data, today), [data, today])
  const fixed = fixedCostsMonthly(index)
  const [taxRate, setTaxRate] = useState(percentInput(settings.tax_rate_bps))
  const [taxConfirmed, setTaxConfirmed] = useState(settings.tax_rate_confirmed)
  const [reserveMonths, setReserveMonths] = useState(String(settings.reserve_months))
  const [reserveShare, setReserveShare] = useState(percentInput(settings.reserve_share_bps))
  const [reinvestShare, setReinvestShare] = useState(percentInput(settings.reinvest_share_bps))
  const [partners, setPartners] = useState(String(settings.partners))
  const [ownerTarget, setOwnerTarget] = useState(moneyInputValue(settings.owner_draw_target_cents))
  const [openingBalance, setOpeningBalance] = useState(moneyInputValue(settings.opening_balance_cents))
  const [openingOn, setOpeningOn] = useState<DateKey>(settings.opening_on)
  const [alertDays, setAlertDays] = useState(String(settings.contract_alert_days))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  const reserveBps = parsePercent(reserveShare)
  const reinvestBps = parsePercent(reinvestShare)
  const ownerShare = reserveBps !== null && reinvestBps !== null ? Math.max(0, 10000 - reserveBps - reinvestBps) : null
  const months = Number(reserveMonths)
  const updatedBy = settings.updated_by ? profileById.get(settings.updated_by) : undefined
  const openingOptions = Array.from({ length: 37 }, (_, position) => addPeriods(index.current, position - 24))
  if (!openingOptions.includes(openingOn)) openingOptions.unshift(openingOn)

  function submit() {
    const tax = parsePercent(taxRate)
    const target = parseBalance(ownerTarget)
    const balance = parseBalance(openingBalance)
    if (tax === null) return setError("Alíquota inválida (ex.: 6 ou 6,5).")
    if (reserveBps === null || reinvestBps === null) return setError("Percentuais da divisão inválidos.")
    if (target === null || target < 0) return setError("Alvo de pró-labore inválido.")
    if (balance === null) return setError("Saldo inicial inválido.")
    setError(null)
    startTransition(async () => {
      const result = await updateFinanceSettings({
        tax_rate_bps: tax,
        tax_rate_confirmed: taxConfirmed,
        reserve_months: Number(reserveMonths),
        reserve_share_bps: reserveBps,
        reinvest_share_bps: reinvestBps,
        partners: Number(partners),
        owner_draw_target_cents: target,
        opening_balance_cents: balance,
        opening_on: openingOn,
        contract_alert_days: Number(alertDays),
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Parâmetros salvos", { description: "DRE, projeção e indicadores já usam os novos valores." })
    })
  }

  return (
    <form
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="min-w-0 space-y-6">
        <PanelCard id="parametros-imposto" title="Imposto">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="Alíquota sobre a receita bruta (%)" htmlFor={`${ids}-tax`} hint="O DRE provisiona o imposto por ela (Simples Nacional).">
              <Input id={`${ids}-tax`} inputMode="decimal" value={taxRate} onChange={(event) => setTaxRate(event.target.value)} className="h-9 w-32 text-right tabular-nums" />
            </Field>
            <div className="space-y-1.5">
              <label className="flex items-center gap-2 pt-6 text-[13px] text-foreground">
                <Checkbox checked={taxConfirmed} onCheckedChange={(checked) => setTaxConfirmed(checked === true)} />
                Confirmada com o contador
              </label>
              <p className="text-xs text-muted-foreground">
                {taxConfirmed ? "Valor confirmado." : "Enquanto não confirmar, o financeiro avisa que é uma premissa (anexo III ou V, Fator R)."}
              </p>
            </div>
          </div>
        </PanelCard>

        <PanelCard id="parametros-caixa" title="Caixa mínimo e divisão do resultado">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="Caixa mínimo (meses de custo fixo)" htmlFor={`${ids}-months`} hint={`= ${formatMoney((Number.isFinite(months) ? months : 0) * fixed)} com os custos fixos de hoje (${formatMoney(fixed)}/mês).`}>
              <Input id={`${ids}-months`} inputMode="numeric" value={reserveMonths} onChange={(event) => setReserveMonths(event.target.value.replace(/\D/g, "").slice(0, 2))} className="h-9 w-24 text-right tabular-nums" />
            </Field>
            <Field label="Número de sócios" htmlFor={`${ids}-partners`}>
              <Input id={`${ids}-partners`} inputMode="numeric" value={partners} onChange={(event) => setPartners(event.target.value.replace(/\D/g, "").slice(0, 2))} className="h-9 w-24 text-right tabular-nums" />
            </Field>
            <Field label="Do resultado, para o caixa (%)" htmlFor={`${ids}-reserve`} hint="Depois que o caixa mínimo foi atingido.">
              <Input id={`${ids}-reserve`} inputMode="decimal" value={reserveShare} onChange={(event) => setReserveShare(event.target.value)} className="h-9 w-24 text-right tabular-nums" />
            </Field>
            <Field label="Do resultado, para reinvestimento (%)" htmlFor={`${ids}-reinvest`}>
              <Input id={`${ids}-reinvest`} inputMode="decimal" value={reinvestShare} onChange={(event) => setReinvestShare(event.target.value)} className="h-9 w-24 text-right tabular-nums" />
            </Field>
            <p className="text-xs text-muted-foreground sm:col-span-2">
              Pró-labore: {ownerShare === null ? "—" : formatPercent(ownerShare / 10000)} do resultado (o que sobra), dividido igualmente entre os sócios.
            </p>
            <Field label="Alvo de pró-labore por sócio (R$/mês)" htmlFor={`${ids}-target`} hint="Calcula a receita necessária na Projeção.">
              <Input
                id={`${ids}-target`}
                inputMode="decimal"
                value={ownerTarget}
                onChange={(event) => setOwnerTarget(event.target.value)}
                onBlur={() => {
                  const cents = parseMoney(ownerTarget)
                  if (cents) setOwnerTarget(moneyInputValue(cents))
                }}
                className="h-9 w-40 text-right tabular-nums"
              />
            </Field>
          </div>
        </PanelCard>

        <PanelCard id="parametros-controle" title="Controle">
          <div className="grid gap-4 px-4 py-4 sm:grid-cols-2">
            <Field label="Primeiro mês do controle">
              <Select value={openingOn} onValueChange={setOpeningOn}>
                <SelectTrigger aria-label="Primeiro mês do controle" className="h-9 w-56 shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start" className="max-h-72">
                  {openingOptions.map((period) => (
                    <SelectItem key={period} value={period}>
                      {periodLabel(period)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <Field label="Saldo em conta no início do mês (R$)" htmlFor={`${ids}-opening`} hint="O que já estava na conta antes do primeiro mês. Zero se não havia.">
              <Input
                id={`${ids}-opening`}
                inputMode="decimal"
                value={openingBalance}
                onChange={(event) => setOpeningBalance(event.target.value)}
                className="h-9 w-40 text-right tabular-nums"
              />
            </Field>
            <Field label="Avisar fim de contrato com (dias)" htmlFor={`${ids}-alert`}>
              <Input id={`${ids}-alert`} inputMode="numeric" value={alertDays} onChange={(event) => setAlertDays(event.target.value.replace(/\D/g, "").slice(0, 3))} className="h-9 w-24 text-right tabular-nums" />
            </Field>
          </div>
        </PanelCard>

        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={isPending}>
            {isPending ? "Salvando…" : "Salvar parâmetros"}
          </Button>
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : (
            <p className="text-xs text-muted-foreground">
              {updatedBy ? `Última mudança: ${firstName(updatedBy.full_name)}, ${formatShortDate(toDateKey(settings.updated_at), today)}.` : "Valores iniciais da planilha."}
            </p>
          )}
        </div>
      </div>

      <aside className="min-w-0 space-y-6" aria-label="Valores calculados">
        <PanelCard id="parametros-calculados" title="Calculados pelo sistema">
          <dl className="px-4 py-3">
            <MoneyLine label="Taxa média do gateway" value={formatPercent(index.gatewayRate)} />
            <p className="pb-2 text-xs text-muted-foreground">Taxas ÷ valor bruto das receitas de cliente recebidas nos últimos 12 meses.</p>
            <MoneyLine label="Custos fixos por mês" value={formatMoney(fixed)} href="/financeiro/contratos" />
            <p className="pb-2 text-xs text-muted-foreground">Custos fixos recorrentes que valem neste mês.</p>
            <MoneyLine label="Caixa mínimo" value={formatMoney(settings.reserve_months * fixed)} />
          </dl>
        </PanelCard>
        <p className="px-1 text-xs text-muted-foreground">
          Metas de receita, como a meta de MRR da planilha, ficam em{" "}
          <Link href="/metas" className="font-medium text-foreground hover:underline">Metas</Link>: o progresso sai dos contratos e
          lançamentos, sem preencher nada à mão.
        </p>
      </aside>
    </form>
  )
}

function Field({ label, htmlFor, hint, children }: { label: string; htmlFor?: string; hint?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-1.5">
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
      {hint ? <p className="text-xs text-muted-foreground">{hint}</p> : null}
    </div>
  )
}
