"use client"

import { AlertTriangle, CheckCircle2, Lock } from "lucide-react"
import { useId, useMemo, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { PanelCard, PanelCount } from "@/components/panel-card"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { addPeriods, periodLabel } from "@/features/clients/logic"
import { closeMonth, reopenMonth } from "@/features/finance/actions"
import { FinanceRows } from "@/features/finance/finance-rows"
import { useFinanceDialog } from "@/features/finance/finance-shell"
import { fromEntry } from "@/features/finance/logic"
import { closingReview, indexFinance, type ClosingReview, type FinanceData } from "@/features/finance/management"
import { formatMoney, moneyInputValue, parseMoney } from "@/features/finance/money"
import { NOTES_MAX } from "@/features/finance/validation"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate, monthRangeOf, toDateKey } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Saldo digitado (pode ser zero ou negativo) → centavos. */
function parseBalance(text: string): number | null {
  const clean = text.trim()
  if (/^[-−]?\s*(R\$)?\s*0+([.,]0{1,2})?$/.test(clean)) return 0
  const negative = /^[-−]/.test(clean)
  const cents = parseMoney(clean.replace(/^[-−]/, ""))
  return cents === null ? null : negative ? -cents : cents
}

/**
 * Aba Fechamento: conferir cada mês com o extrato do banco e travar os
 * pagamentos dele (a coluna "Último mês fechado" da planilha, com conferência).
 */
export function ClosingView({ data, today }: { data: FinanceData; today: DateKey }) {
  const index = useMemo(() => indexFinance(data, today), [data, today])
  const periods: DateKey[] = []
  for (let period = addPeriods(index.current, -1); period >= data.settings.opening_on; period = addPeriods(period, -1)) {
    periods.push(period)
  }
  const reviews = periods.map((period) => closingReview(index, period))
  const open = reviews.filter((review) => !review.closing)
  const closed = reviews.filter((review) => review.closing)
  // O mais antigo em aberto vem primeiro: os saldos se apoiam no mês anterior.
  const next = open[open.length - 1]

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_340px] xl:items-start">
      <div className="min-w-0 space-y-6">
        {periods.length === 0 ? (
          <p className="rounded-xl border border-dashed px-6 py-10 text-center text-[13px] text-muted-foreground">
            O primeiro mês do controle ({periodLabel(data.settings.opening_on).toLocaleLowerCase("pt-BR")}) ainda não terminou. O
            fechamento fica disponível no mês seguinte.
          </p>
        ) : next ? (
          <ClosingCard key={next.period} review={next} today={today} />
        ) : (
          <div className="flex items-center gap-3 rounded-xl border bg-card px-4 py-4">
            <CheckCircle2 className="size-5 text-success-ink" aria-hidden="true" />
            <p className="text-[13px] text-foreground">Todos os meses encerrados estão fechados.</p>
          </div>
        )}

        {open.length > 1 ? (
          <PanelCard
            id="meses-abertos"
            title={
              <>
                Outros meses em aberto
                <PanelCount value={open.length - 1} />
              </>
            }
          >
            <ul className="divide-y">
              {open
                .filter((review) => review !== next)
                .map((review) => (
                  <li key={review.period} className="flex items-center justify-between gap-3 px-4 py-2.5 text-[13px]">
                    <span className="text-foreground">{periodLabel(review.period)}</span>
                    <span className="text-xs text-muted-foreground">feche {periodLabel(next!.period).toLocaleLowerCase("pt-BR")} antes</span>
                  </li>
                ))}
            </ul>
          </PanelCard>
        ) : null}
      </div>

      <PanelCard
        id="meses-fechados"
        title={
          <>
            <Lock className="size-3.5 text-muted-foreground" aria-hidden="true" />
            Meses fechados
            <PanelCount value={closed.length} />
          </>
        }
      >
        {closed.length === 0 ? (
          <p className="px-4 py-4 text-[13px] text-muted-foreground">Nenhum mês fechado ainda.</p>
        ) : (
          <ul className="divide-y">
            {closed.map((review, position) => (
              <ClosedRow key={review.period} review={review} latest={position === 0} today={today} />
            ))}
          </ul>
        )}
      </PanelCard>
    </div>
  )
}

function ClosingCard({ review, today }: { review: ClosingReview; today: DateKey }) {
  const ids = useId()
  const { openItem } = useFinanceDialog()
  const [bank, setBank] = useState("")
  const [notes, setNotes] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const end = monthRangeOf(review.period).end
  const bankCents = bank.trim() ? parseBalance(bank) : null
  const difference = bankCents === null ? null : bankCents - review.ledgerBalance
  const month = periodLabel(review.period).toLocaleLowerCase("pt-BR")

  function submit() {
    if (bankCents === null) {
      setError("Informe o saldo do extrato no último dia do mês (ex.: 1.250,00).")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await closeMonth({ period: review.period, bank_balance_cents: bankCents, notes: notes || null })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(`${periodLabel(review.period)} fechado`, {
        description: difference === 0 ? "Saldo conferido com o extrato." : "Fechado com diferença registrada.",
      })
    })
  }

  return (
    <PanelCard id="fechar-mes" title={`Fechar ${month}`}>
      <ol className="divide-y">
        <li className="px-4 py-3">
          <Step done={review.open.length === 0} title="Vencimentos do mês resolvidos">
            {review.open.length === 0
              ? "Tudo que venceu no mês foi pago, recebido ou pulado."
              : `${review.open.length} ${review.open.length === 1 ? "item venceu" : "itens venceram"} sem baixa. Marque o pagamento (com a data certa), pule o mês ou mude o vencimento.`}
          </Step>
          {review.open.length > 0 ? (
            <div className="mt-2 overflow-hidden rounded-lg border">
              <FinanceRows items={review.open} today={today} onOpen={openItem} showMonth />
            </div>
          ) : null}
        </li>
        <li className="px-4 py-3">
          <Step done={review.issues.length === 0} title="Lançamentos conferidos">
            {review.issues.length === 0 ? "Nenhuma pendência de conferência no mês." : "Ajuste os lançamentos abaixo (a coluna Conferência da planilha)."}
          </Step>
          {review.issues.length > 0 ? (
            <ul className="mt-2 divide-y overflow-hidden rounded-lg border">
              {review.issues.map((issue) => (
                <li key={`${issue.entry.id}-${issue.message}`}>
                  <button
                    type="button"
                    onClick={() => openItem(fromEntry(issue.entry, new Map()))}
                    className="flex w-full items-center gap-2 px-3 py-2 text-left text-[13px] transition-colors hover:bg-muted/40"
                  >
                    <AlertTriangle className="size-3.5 shrink-0 text-warning-ink" aria-hidden="true" />
                    <span className="min-w-0 flex-1 truncate text-foreground">{issue.entry.description}</span>
                    <span className="shrink-0 text-xs text-muted-foreground">{issue.message}</span>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </li>
        <li className="px-4 py-3">
          <Step done={difference === 0} title="Saldo conferido com o extrato">
            Pelos lançamentos, o saldo em {formatShortDate(end, today)} é <strong className="font-medium text-foreground tabular-nums">{formatMoney(review.ledgerBalance)}</strong>.
          </Step>
          <form
            className="mt-3 grid gap-3 sm:grid-cols-2"
            onSubmit={(event) => {
              event.preventDefault()
              submit()
            }}
          >
            <div className="space-y-1.5">
              <label htmlFor={`${ids}-bank`} className="text-xs font-medium text-muted-foreground">
                Saldo do extrato em {formatShortDate(end, today)} (R$)
              </label>
              <Input
                id={`${ids}-bank`}
                inputMode="decimal"
                value={bank}
                onChange={(event) => {
                  setBank(event.target.value)
                  if (error) setError(null)
                }}
                onBlur={() => {
                  const cents = parseBalance(bank)
                  if (cents !== null) setBank(`${cents < 0 ? "-" : ""}${moneyInputValue(Math.abs(cents))}`)
                }}
                placeholder="0,00"
                className="h-9 text-right tabular-nums"
              />
              {difference !== null ? (
                <p className={cn("text-xs tabular-nums", difference === 0 ? "text-success-ink" : "text-warning-ink")}>
                  {difference === 0
                    ? "Bate com os lançamentos."
                    : `Diferença de ${formatMoney(difference)}: falta lançar algo ou há uma data de pagamento errada.`}
                </p>
              ) : null}
            </div>
            <div className="space-y-1.5">
              <label htmlFor={`${ids}-notes`} className="text-xs font-medium text-muted-foreground">
                Observação
              </label>
              <Textarea
                id={`${ids}-notes`}
                value={notes}
                maxLength={NOTES_MAX}
                onChange={(event) => setNotes(event.target.value)}
                placeholder="Ex.: diferença de tarifa bancária, ajustar em outubro"
                className="min-h-9 resize-none text-[13px] shadow-none"
              />
            </div>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit" size="sm" disabled={isPending} className="gap-1.5">
                <Lock className="size-3.5" />
                {isPending ? "Fechando…" : `Fechar ${month}`}
              </Button>
              <p className="text-xs text-muted-foreground">Depois de fechado, valores e datas de pagamento do mês não mudam (dá para reabrir).</p>
              {error ? (
                <p className="w-full text-xs text-destructive" role="alert">
                  {error}
                </p>
              ) : null}
            </div>
          </form>
        </li>
      </ol>
    </PanelCard>
  )
}

function Step({ done, title, children }: { done: boolean; title: string; children: ReactNode }) {
  return (
    <div className="flex gap-3">
      {done ? (
        <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-success-ink" aria-label="Feito" />
      ) : (
        <span aria-label="Pendente" className="mt-0.5 size-4 shrink-0 rounded-full border-2 border-muted-foreground/40" />
      )}
      <div className="min-w-0">
        <p className="text-[13px] font-medium text-foreground">{title}</p>
        <p className="text-xs text-muted-foreground">{children}</p>
      </div>
    </div>
  )
}

function ClosedRow({ review, latest, today }: { review: ClosingReview; latest: boolean; today: DateKey }) {
  const { profileById } = useWorkspace()
  const [confirm, setConfirm] = useState(false)
  const [isPending, startTransition] = useTransition()
  const closing = review.closing!
  const difference = closing.bank_balance_cents - closing.ledger_balance_cents
  const who = profileById.get(closing.closed_by)

  function reopen() {
    startTransition(async () => {
      const result = await reopenMonth(review.period)
      if (!result.ok) toast.error(result.error)
      else toast(`${periodLabel(review.period)} reaberto`, { description: "Os pagamentos do mês voltam a poder mudar." })
    })
  }

  return (
    <li className="px-4 py-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-foreground">{periodLabel(review.period)}</p>
          <p className="text-xs text-muted-foreground">
            {who ? `${firstName(who.full_name)} · ` : ""}
            {formatShortDate(toDateKey(closing.closed_at), today)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[13px] text-foreground tabular-nums">{formatMoney(closing.bank_balance_cents)}</p>
          <p className={cn("text-[11px] tabular-nums", difference === 0 ? "text-success-ink" : "text-warning-ink")}>
            {difference === 0 ? "bate com os lançamentos" : `diferença de ${formatMoney(difference)}`}
          </p>
        </div>
      </div>
      {closing.notes ? <p className="mt-1.5 text-xs text-muted-foreground">{closing.notes}</p> : null}
      {review.ledgerBalance !== closing.ledger_balance_cents ? (
        <p className="mt-1.5 text-xs text-warning-ink">
          O saldo pelos lançamentos mudou depois do fechamento ({formatMoney(review.ledgerBalance)}): algum mês anterior foi alterado.
        </p>
      ) : null}
      {latest ? (
        <Button variant="ghost" size="sm" className="mt-1 -ml-2 h-7 text-xs text-muted-foreground" onClick={() => setConfirm(true)} disabled={isPending}>
          Reabrir
        </Button>
      ) : null}
      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Reabrir {periodLabel(review.period).toLocaleLowerCase("pt-BR")}?</AlertDialogTitle>
            <AlertDialogDescription>
              Os pagamentos do mês voltam a poder mudar e o DRE deixa de mostrar o mês como conferido. Depois de ajustar,
              feche de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={reopen}>Reabrir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}
