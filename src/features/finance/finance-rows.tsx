"use client"

import { Repeat } from "lucide-react"
import { useOptimistic, useTransition } from "react"
import { toast } from "sonner"

import { Checkbox } from "@/components/ui/checkbox"
import { updateEntry, updateOccurrence } from "@/features/finance/actions"
import { dueLabel, itemStatus, type FinanceItem } from "@/features/finance/logic"
import { formatMoney } from "@/features/finance/money"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate } from "@/lib/dates"
import { FINANCE_ACCOUNT_LABEL } from "@/lib/labels"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Descrição com o ícone de "todo mês" preso à última palavra (não quebra sozinho). */
function RecurringText({ text }: { text: string }) {
  const cut = text.lastIndexOf(" ")
  return (
    <>
      {text.slice(0, cut + 1)}
      <span className="whitespace-nowrap">
        {text.slice(cut + 1)}
        <Repeat className="ml-1.5 inline size-3 align-[-1px] text-subtle-foreground" aria-label="Todo mês" />
      </span>
    </>
  )
}

/**
 * Lista de lançamentos: checkbox de recebido/pago (marca com a data de hoje),
 * descrição, vínculos, vencimento e valor. Clicar abre o lançamento.
 */
export function FinanceRows({
  items,
  today,
  onOpen,
  showMonth = false,
  hide = [],
  emptyText,
  className,
}: {
  items: FinanceItem[]
  today: DateKey
  onOpen: (item: FinanceItem) => void
  /** Atrasados com a data ("Venceu 28/08") em vez de "há N dias" (listas que misturam meses). */
  showMonth?: boolean
  /** Vínculos que não precisam aparecer (o cartão já está na página do cliente/projeto). */
  hide?: ("client" | "project")[]
  emptyText?: string
  className?: string
}) {
  const { clientById, projectById } = useWorkspace()
  const [, startTransition] = useTransition()
  const [optimistic, markPaid] = useOptimistic(items, (current: FinanceItem[], change: { key: string; paidOn: DateKey | null }) =>
    current.map((item) => (item.key === change.key ? { ...item, paid_on: change.paidOn } : item))
  )

  function togglePaid(item: FinanceItem) {
    const paidOn = item.paid_on ? null : today
    startTransition(async () => {
      markPaid({ key: item.key, paidOn })
      const result = item.entry
        ? await updateEntry(item.entry.id, { paid_on: paidOn })
        : await updateOccurrence(item.recurrence!.id, item.period!, { paid_on: paidOn })
      if (!result.ok) toast.error(result.error)
      else if (paidOn) {
        toast.success(item.kind === "income" ? "Recebimento registrado" : "Pagamento registrado", {
          description: `${item.description} · ${formatMoney(item.amount_cents)}`,
          // Recebimento pelo gateway: a taxa entra pelo formulário.
          action:
            item.account === "client_revenue"
              ? { label: "Informar taxa", onClick: () => onOpen({ ...item, paid_on: paidOn }) }
              : undefined,
        })
      }
    })
  }

  if (optimistic.length === 0) {
    return emptyText ? <p className={cn("px-4 py-4 text-[13px] text-muted-foreground", className)}>{emptyText}</p> : null
  }

  // Em listas estreitas (cartões laterais, celular) o vencimento desce para a
  // linha de baixo, para a descrição não ser cortada.
  return (
    <ul className={cn("@container divide-y", className)}>
      {optimistic.map((item) => {
        const status = itemStatus(item, today)
        const client = item.client_id && !hide.includes("client") ? clientById.get(item.client_id) : undefined
        const project = item.project_id && !hide.includes("project") ? projectById.get(item.project_id) : undefined
        // A categoria aparece quando não é a óbvia (receita de cliente).
        const account = item.account !== "client_revenue" ? FINANCE_ACCOUNT_LABEL[item.account] : null
        const meta = [client?.name, project?.name, account, item.category].filter(Boolean)
        const when =
          status === "skipped"
            ? "Pulado"
            : item.paid_on
              ? `${item.kind === "income" ? "Recebido" : "Pago"} ${formatShortDate(item.paid_on, today)}`
              : showMonth && item.due_on < today
                ? `Venceu ${formatShortDate(item.due_on, today)}`
                : dueLabel(item.due_on, today).label
        const whenClass = status === "overdue" ? "font-medium text-overdue" : "text-muted-foreground"
        return (
          <li key={item.key} className={cn("relative flex items-center gap-3 px-4 py-2.5 transition-colors hover:bg-muted/40", status === "skipped" && "opacity-60")}>
            <Checkbox
              checked={Boolean(item.paid_on)}
              disabled={item.skipped}
              onCheckedChange={() => togglePaid(item)}
              aria-label={
                item.paid_on
                  ? `Desfazer ${item.kind === "income" ? "recebimento" : "pagamento"} de ${item.description}`
                  : `Marcar ${item.description} como ${item.kind === "income" ? "recebido" : "pago"}`
              }
              className="relative z-10"
            />
            <button
              type="button"
              onClick={() => onOpen(item)}
              className="min-w-0 flex-1 text-left outline-none after:absolute after:inset-0 focus-visible:underline"
            >
              <span
                className={cn(
                  "line-clamp-2 text-sm font-medium break-words text-foreground @md:line-clamp-1",
                  item.paid_on && "text-muted-foreground"
                )}
              >
                {item.recurrence ? <RecurringText text={item.description} /> : item.description}
              </span>
              <span className={cn("block truncate text-xs text-muted-foreground", meta.length === 0 && "@md:hidden")}>
                <span className={cn("tabular-nums @md:hidden", whenClass)}>
                  {when}
                  {meta.length > 0 ? <span className="font-normal text-muted-foreground"> · </span> : null}
                </span>
                {meta.join(" · ")}
              </span>
            </button>
            <span className={cn("hidden shrink-0 text-xs tabular-nums @md:block", whenClass)}>{when}</span>
            <span
              className={cn(
                "shrink-0 text-right text-sm tabular-nums @md:w-28",
                item.kind === "income" ? "text-foreground" : "text-muted-foreground",
                item.skipped && "line-through"
              )}
            >
              {item.kind === "expense" ? "− " : ""}
              {formatMoney(item.amount_cents)}
            </span>
          </li>
        )
      })}
    </ul>
  )
}
