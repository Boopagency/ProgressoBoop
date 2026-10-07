"use client"

import { CalendarDays, Repeat, Trash2 } from "lucide-react"
import { useId, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { DatePicker } from "@/components/date-picker"
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
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { addPeriods, periodLabel, periodOf } from "@/features/clients/logic"
import {
  createEntry,
  createRecurrence,
  deleteEntry,
  deleteRecurrence,
  updateEntry,
  updateOccurrence,
  updateRecurrence,
} from "@/features/finance/actions"
import { EXPENSE_CATEGORIES, INCOME_CATEGORIES, type FinanceItem } from "@/features/finance/logic"
import { formatMoney, moneyInputValue, parseMoney } from "@/features/finance/money"
import { CATEGORY_MAX, DESCRIPTION_MAX, NOTES_MAX } from "@/features/finance/validation"
import { ProjectSelect } from "@/features/projects/project-meta"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate, todayKey } from "@/lib/dates"
import { FINANCE_KIND_LABEL } from "@/lib/labels"
import type { DateKey, FinanceKind, FinanceRecurrence } from "@/lib/types"
import { cn } from "@/lib/utils"

export interface FinanceDialogState {
  open: boolean
  key: number
  /** Item do mês em edição (lançamento ou ocorrência de recorrência). */
  item?: FinanceItem
  /** Recorrência em edição (todos os meses). */
  recurrence?: FinanceRecurrence
  defaults?: { kind?: FinanceKind; client_id?: string | null; project_id?: string | null }
}

const NONE = "none"
const TRIGGER = "h-9 w-full justify-between shadow-none"

export function FinanceDialog({
  state,
  onOpenChange,
}: {
  state: FinanceDialogState
  onOpenChange: (open: boolean) => void
}) {
  const [view, setView] = useState<{ key: number; recurrence?: FinanceRecurrence }>({ key: state.key })
  // Ao trocar de item, volta para o modo pedido pelo estado.
  if (view.key !== state.key) setView({ key: state.key })
  const recurrence = view.recurrence ?? state.recurrence
  const title = recurrence ? "Recorrência" : state.item ? "Lançamento" : "Novo lançamento"

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[4%] max-h-[92svh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[8%] sm:max-w-[600px]"
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <DialogDescription className="sr-only">Receita ou despesa, valor, vencimento e pagamento.</DialogDescription>
        {recurrence ? (
          <RecurrenceForm key={`r-${recurrence.id}-${state.key}`} recurrence={recurrence} onDone={() => onOpenChange(false)} />
        ) : (
          <EntryForm
            key={state.key}
            item={state.item}
            defaults={state.defaults}
            onDone={() => onOpenChange(false)}
            onEditRecurrence={(next) => setView({ key: state.key, recurrence: next })}
          />
        )}
      </DialogContent>
    </Dialog>
  )
}

function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

function KindToggle({ value, onChange }: { value: FinanceKind; onChange: (kind: FinanceKind) => void }) {
  return (
    <div role="radiogroup" aria-label="Tipo" className="inline-flex rounded-lg bg-muted p-0.5">
      {(["income", "expense"] as const).map((kind) => (
        <button
          key={kind}
          type="button"
          role="radio"
          aria-checked={value === kind}
          onClick={() => onChange(kind)}
          className={cn(
            "h-7 rounded-md px-3 text-[13px] font-medium text-muted-foreground outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring/40",
            value === kind && "bg-background text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.04)]"
          )}
        >
          {FINANCE_KIND_LABEL[kind]}
        </button>
      ))}
    </div>
  )
}

/** Meses para escolher o fim de uma recorrência (do começo até dois anos à frente). */
function endOptions(startsOn: DateKey, today: DateKey): DateKey[] {
  const first = startsOn > periodOf(today) ? startsOn : periodOf(today)
  return Array.from({ length: 25 }, (_, index) => addPeriods(first, index))
}

function ClientProjectFields({
  clientId,
  projectId,
  onClient,
  onProject,
}: {
  clientId: string | null
  projectId: string | null
  onClient: (id: string | null) => void
  onProject: (id: string | null) => void
}) {
  const { clients, projectById } = useWorkspace()
  return (
    <>
      <Field label="Cliente">
        <Select value={clientId ?? NONE} onValueChange={(value) => onClient(value === NONE ? null : value)}>
          <SelectTrigger aria-label="Cliente" className={TRIGGER}>
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectItem value={NONE}>Nenhum (da Boop)</SelectItem>
            {clients
              .filter((client) => client.active || client.id === clientId)
              .map((client) => (
                <SelectItem key={client.id} value={client.id}>
                  {client.name}
                </SelectItem>
              ))}
          </SelectContent>
        </Select>
      </Field>
      <Field label="Projeto">
        <ProjectSelect
          value={projectId}
          clientId={clientId}
          onChange={(next) => {
            onProject(next)
            const project = next ? projectById.get(next) : undefined
            if (project?.client_id && !clientId) onClient(project.client_id)
          }}
          placeholder="Nenhum"
          size="default"
          className={TRIGGER}
        />
      </Field>
    </>
  )
}

function EntryForm({
  item,
  defaults,
  onDone,
  onEditRecurrence,
}: {
  item?: FinanceItem
  defaults?: FinanceDialogState["defaults"]
  onDone: () => void
  onEditRecurrence: (recurrence: FinanceRecurrence) => void
}) {
  const ids = useId()
  const [today] = useState<DateKey>(() => todayKey())
  const [kind, setKind] = useState<FinanceKind>(item?.kind ?? defaults?.kind ?? "income")
  const [description, setDescription] = useState(item?.description ?? "")
  const [amount, setAmount] = useState(item ? moneyInputValue(item.amount_cents) : "")
  const [dueOn, setDueOn] = useState<DateKey>(item?.due_on ?? today)
  const [paid, setPaid] = useState(Boolean(item?.paid_on))
  const [paidOn, setPaidOn] = useState<DateKey>(item?.paid_on ?? today)
  const [category, setCategory] = useState(item?.category ?? "")
  const [clientId, setClientId] = useState<string | null>(item ? item.client_id : (defaults?.client_id ?? null))
  const [projectId, setProjectId] = useState<string | null>(item ? item.project_id : (defaults?.project_id ?? null))
  const [notes, setNotes] = useState(item?.entry?.notes ?? "")
  const [repeat, setRepeat] = useState(false)
  const [endsOn, setEndsOn] = useState<DateKey | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  const occurrence = item?.recurrence && item.period ? { recurrence: item.recurrence, period: item.period } : null
  const income = kind === "income"
  const categories = income ? INCOME_CATEGORIES : EXPENSE_CATEGORIES

  function submit() {
    const cents = parseMoney(amount)
    if (!description.trim()) {
      setError("Descreva o lançamento.")
      return
    }
    if (!cents) {
      setError("Informe um valor (ex.: 3.500,00).")
      return
    }
    setError(null)
    const fields = {
      description,
      amount_cents: cents,
      category: category || null,
      client_id: clientId,
      project_id: projectId,
      notes: notes || null,
    }
    startTransition(async () => {
      let result
      if (item?.entry) {
        result = await updateEntry(item.entry.id, { ...fields, due_on: dueOn, paid_on: paid ? paidOn : null })
      } else if (occurrence) {
        result = await updateOccurrence(occurrence.recurrence.id, occurrence.period, {
          ...fields,
          due_on: dueOn,
          paid_on: paid ? paidOn : null,
        })
      } else if (repeat) {
        const created = await createRecurrence({
          kind,
          ...fields,
          day_of_month: Number(dueOn.slice(8, 10)),
          starts_on: periodOf(dueOn),
          ends_on: endsOn,
        })
        result = created
        if (created.ok && paid) {
          result = await updateOccurrence(created.data.id, periodOf(dueOn), { paid_on: paidOn })
        }
      } else {
        result = await createEntry({ kind, ...fields, due_on: dueOn, paid_on: paid ? paidOn : null })
      }
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success(item ? "Lançamento salvo" : repeat ? "Recorrência criada" : "Lançamento criado", {
        description: `${description.trim()} · ${formatMoney(cents)}`,
      })
      onDone()
    })
  }

  function skipMonth() {
    if (!occurrence) return
    startTransition(async () => {
      const skipped = !item?.skipped
      const result = item?.entry
        ? await updateEntry(item.entry.id, { skipped })
        : await updateOccurrence(occurrence.recurrence.id, occurrence.period, { skipped })
      if (!result.ok) toast.error(result.error)
      else {
        toast.success(skipped ? "Mês pulado" : "Mês voltou a contar", { description: description })
        onDone()
      }
    })
  }

  function remove() {
    if (!item?.entry) return
    startTransition(async () => {
      const result = await deleteEntry(item.entry!.id)
      if (!result.ok) toast.error(result.error)
      else {
        toast("Lançamento excluído", { description: item.description })
        onDone()
      }
    })
  }

  return (
    <form
      className="flex max-h-[92svh] flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
          event.preventDefault()
          submit()
        }
      }}
    >
      <div className="overflow-y-auto px-5 pt-5 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {item ? (
            <p className="text-xs font-medium text-muted-foreground">
              {FINANCE_KIND_LABEL[kind]}
              {occurrence ? ` · ${periodLabel(occurrence.period).toLocaleLowerCase("pt-BR")} de uma recorrência` : ""}
            </p>
          ) : (
            <KindToggle value={kind} onChange={setKind} />
          )}
        </div>
        <input
          autoFocus={!item}
          value={description}
          onChange={(event) => {
            setDescription(event.target.value)
            if (error) setError(null)
          }}
          maxLength={DESCRIPTION_MAX}
          placeholder={income ? "Ex.: Fee mensal Velmont, Site Hertmann (entrada)" : "Ex.: Adobe, Simples Nacional, freelancer"}
          aria-label="Descrição"
          className="mt-3 w-full bg-transparent text-lg leading-7 font-semibold tracking-tight text-foreground outline-none placeholder:font-normal placeholder:text-subtle-foreground"
        />

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Valor (R$)" htmlFor={`${ids}-amount`}>
            <Input
              id={`${ids}-amount`}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              onBlur={() => {
                const cents = parseMoney(amount)
                if (cents) setAmount(moneyInputValue(cents))
              }}
              placeholder="0,00"
              className="h-9 text-right tabular-nums"
            />
          </Field>
          <Field label="Vencimento">
            <DatePicker
              value={dueOn}
              onChange={(next) => next && setDueOn(next)}
              today={today}
              placeholder="Data"
              aria-label="Vencimento"
              icon={<CalendarDays className="size-4 text-muted-foreground" />}
              renderValue={(value) => <span>{formatShortDate(value, today)}</span>}
              className="h-9 w-full justify-start border border-input px-3"
            />
          </Field>
          <ClientProjectFields clientId={clientId} projectId={projectId} onClient={setClientId} onProject={setProjectId} />
          <Field label="Categoria" htmlFor={`${ids}-category`}>
            <Input
              id={`${ids}-category`}
              list={`${ids}-categories`}
              value={category}
              maxLength={CATEGORY_MAX}
              onChange={(event) => setCategory(event.target.value)}
              placeholder={categories[0]}
              className="h-9"
            />
            <datalist id={`${ids}-categories`}>
              {categories.map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </Field>
          <div className="space-y-1.5">
            <label className="flex h-[18px] items-center gap-2 text-xs font-medium text-muted-foreground">
              <Checkbox checked={paid} onCheckedChange={(checked) => setPaid(checked === true)} />
              {income ? "Já recebido" : "Já pago"}
            </label>
            {paid ? (
              <DatePicker
                value={paidOn}
                onChange={(next) => next && setPaidOn(next)}
                today={today}
                placeholder="Data"
                aria-label={income ? "Recebido em" : "Pago em"}
                icon={<CalendarDays className="size-4 text-muted-foreground" />}
                renderValue={(value) => <span>{income ? "Recebido" : "Pago"} em {formatShortDate(value, today)}</span>}
                className="h-9 w-full justify-start border border-input px-3"
              />
            ) : (
              <p className="flex h-9 items-center text-xs text-muted-foreground">Ainda não</p>
            )}
          </div>
        </div>

        {!item ? (
          <div className="mt-4 rounded-lg border bg-muted/30 p-3">
            <label className="flex items-center gap-2 text-[13px] font-medium text-foreground">
              <Checkbox checked={repeat} onCheckedChange={(checked) => setRepeat(checked === true)} />
              <Repeat className="size-3.5 text-muted-foreground" aria-hidden="true" />
              Repetir todo mês
            </label>
            {repeat ? (
              <div className="mt-2 flex flex-wrap items-center gap-2 text-[13px] text-muted-foreground">
                Todo dia {Number(dueOn.slice(8, 10))}, a partir de {periodLabel(periodOf(dueOn)).toLocaleLowerCase("pt-BR")},
                <Select value={endsOn ?? NONE} onValueChange={(value) => setEndsOn(value === NONE ? null : value)}>
                  <SelectTrigger size="sm" aria-label="Até quando" className="h-8 w-auto shadow-none">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start" className="max-h-72">
                    <SelectItem value={NONE}>sem data para acabar</SelectItem>
                    {endOptions(periodOf(dueOn), today).map((period) => (
                      <SelectItem key={period} value={period}>
                        até {periodLabel(period).toLocaleLowerCase("pt-BR")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ) : (
              <p className="mt-1 text-xs text-muted-foreground">Para fees e assinaturas: cada mês aparece sozinho, é só marcar quando entrar.</p>
            )}
          </div>
        ) : null}

        <Field label="Observação" htmlFor={`${ids}-notes`} className="mt-4">
          <Textarea
            id={`${ids}-notes`}
            value={notes}
            maxLength={NOTES_MAX}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="Nota fiscal, forma de pagamento, parcela…"
            className="min-h-14 resize-none text-[13px] shadow-none"
          />
        </Field>

        {occurrence ? (
          <p className="mt-3 text-xs text-muted-foreground">
            As mudanças aqui valem só para este mês.{" "}
            <button
              type="button"
              onClick={() => onEditRecurrence(occurrence.recurrence)}
              className="font-medium text-foreground underline-offset-2 hover:text-brand-ink hover:underline"
            >
              Editar a recorrência (todos os meses)
            </button>
          </p>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
        <div className="flex items-center gap-1">
          {occurrence ? (
            <Button type="button" variant="ghost" size="sm" onClick={skipMonth} disabled={isPending}>
              {item?.skipped ? "Voltar a contar este mês" : "Pular este mês"}
            </Button>
          ) : null}
          {item?.entry && !occurrence ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Excluir lançamento"
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          ) : null}
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Salvando…" : item ? "Salvar" : "Lançar"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este lançamento?</AlertDialogTitle>
            <AlertDialogDescription>“{item?.description}” sai do financeiro. Não dá para desfazer.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}

function RecurrenceForm({ recurrence, onDone }: { recurrence: FinanceRecurrence; onDone: () => void }) {
  const ids = useId()
  const [today] = useState<DateKey>(() => todayKey())
  const [description, setDescription] = useState(recurrence.description)
  const [amount, setAmount] = useState(moneyInputValue(recurrence.amount_cents))
  const [day, setDay] = useState(String(recurrence.day_of_month))
  const [category, setCategory] = useState(recurrence.category ?? "")
  const [clientId, setClientId] = useState(recurrence.client_id)
  const [projectId, setProjectId] = useState(recurrence.project_id)
  const [endsOn, setEndsOn] = useState<DateKey | null>(recurrence.ends_on)
  const [notes, setNotes] = useState(recurrence.notes ?? "")
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()
  const income = recurrence.kind === "income"
  const ends = endOptions(recurrence.starts_on, today)
  if (endsOn && !ends.includes(endsOn)) ends.unshift(endsOn)

  function submit() {
    const cents = parseMoney(amount)
    const dayNumber = Number(day)
    if (!description.trim()) {
      setError("Descreva a recorrência.")
      return
    }
    if (!cents) {
      setError("Informe um valor (ex.: 3.500,00).")
      return
    }
    if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) {
      setError("Dia do vencimento entre 1 e 31.")
      return
    }
    setError(null)
    startTransition(async () => {
      const result = await updateRecurrence(recurrence.id, {
        description,
        amount_cents: cents,
        day_of_month: dayNumber,
        category: category || null,
        client_id: clientId,
        project_id: projectId,
        ends_on: endsOn,
        notes: notes || null,
      })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Recorrência salva", { description: "Vale para os meses que ainda não foram marcados." })
      onDone()
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteRecurrence(recurrence.id)
      if (!result.ok) toast.error(result.error)
      else {
        toast("Recorrência excluída", { description: recurrence.description })
        onDone()
      }
    })
  }

  return (
    <form
      className="flex max-h-[92svh] flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="overflow-y-auto px-5 pt-5 pb-4">
        <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Repeat className="size-3.5" aria-hidden="true" />
          {income ? "Receita" : "Despesa"} todo mês, desde {periodLabel(recurrence.starts_on).toLocaleLowerCase("pt-BR")}
        </p>
        <input
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          maxLength={DESCRIPTION_MAX}
          aria-label="Descrição"
          className="mt-3 w-full bg-transparent text-lg leading-7 font-semibold tracking-tight text-foreground outline-none"
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Valor por mês (R$)" htmlFor={`${ids}-amount`}>
            <Input
              id={`${ids}-amount`}
              inputMode="decimal"
              value={amount}
              onChange={(event) => setAmount(event.target.value)}
              onBlur={() => {
                const cents = parseMoney(amount)
                if (cents) setAmount(moneyInputValue(cents))
              }}
              className="h-9 text-right tabular-nums"
            />
          </Field>
          <Field label="Vence todo dia" htmlFor={`${ids}-day`}>
            <Input
              id={`${ids}-day`}
              inputMode="numeric"
              value={day}
              onChange={(event) => setDay(event.target.value.replace(/\D/g, "").slice(0, 2))}
              className="h-9 tabular-nums"
            />
          </Field>
          <ClientProjectFields clientId={clientId} projectId={projectId} onClient={setClientId} onProject={setProjectId} />
          <Field label="Categoria" htmlFor={`${ids}-category`}>
            <Input
              id={`${ids}-category`}
              list={`${ids}-categories`}
              value={category}
              maxLength={CATEGORY_MAX}
              onChange={(event) => setCategory(event.target.value)}
              className="h-9"
            />
            <datalist id={`${ids}-categories`}>
              {(income ? INCOME_CATEGORIES : EXPENSE_CATEGORIES).map((option) => (
                <option key={option} value={option} />
              ))}
            </datalist>
          </Field>
          <Field label="Até quando">
            <Select value={endsOn ?? NONE} onValueChange={(value) => setEndsOn(value === NONE ? null : value)}>
              <SelectTrigger aria-label="Até quando" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start" className="max-h-72">
                <SelectItem value={NONE}>Sem data para acabar</SelectItem>
                {ends.map((period) => (
                  <SelectItem key={period} value={period}>
                    Até {periodLabel(period).toLocaleLowerCase("pt-BR")}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
        <Field label="Observação" htmlFor={`${ids}-notes`} className="mt-4">
          <Textarea
            id={`${ids}-notes`}
            value={notes}
            maxLength={NOTES_MAX}
            onChange={(event) => setNotes(event.target.value)}
            className="min-h-14 resize-none text-[13px] shadow-none"
          />
        </Field>
        <p className="mt-3 text-xs text-muted-foreground">
          Mudanças valem para os meses ainda não marcados; os já recebidos ou pagos ficam como estão.
        </p>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Excluir recorrência"
            onClick={() => setConfirmDelete(true)}
            disabled={isPending}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </Button>
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Salvando…" : "Salvar"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta recorrência?</AlertDialogTitle>
            <AlertDialogDescription>
              Os próximos meses deixam de aparecer. Os meses já marcados (recebidos, pagos ou pulados) continuam no
              histórico. Para só parar de cobrar, use “Até quando”.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </form>
  )
}
