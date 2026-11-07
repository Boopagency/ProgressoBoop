"use client"

import { CalendarClock, ClipboardList, Send } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { DatePicker } from "@/components/date-picker"
import { PanelCard } from "@/components/panel-card"
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
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { cancelBriefing, changeBriefingDue, releaseBriefing } from "@/features/briefing/actions"
import {
  BRIEFING_DUE_BUSINESS_DAYS,
  defaultBriefingDue,
  dueState,
  IDENTIFICATION_FIELDS,
  isBriefingOpen,
  type BriefingIdentification,
  type ClientBriefingSummary,
} from "@/features/briefing/logic"
import { formatLongDate, formatShortDate, toDateKey } from "@/lib/dates"
import { BRIEFING_STATUS_LABEL } from "@/lib/labels"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Ficha do cliente: o briefing de onboarding. Antes de liberar, a equipe
 * confere os dados de identificação (bloco 0) e o prazo (5 dias úteis,
 * editável); liberado, mostra o status, o andamento e o prazo. Enquanto o
 * cliente não envia, o portal dele só mostra o Briefing. A Parte 2 do
 * issue #108 transforma este cartão na aba Briefing.
 */
export function BriefingCard({
  clientId,
  clientName,
  defaults,
  briefing,
  today,
}: {
  clientId: string
  clientName: string
  /** Dados que a ficha já tem, para preencher a identificação. */
  defaults: BriefingIdentification
  briefing: ClientBriefingSummary | null
  today: DateKey
}) {
  const [releaseOpen, setReleaseOpen] = useState(false)
  const [releaseKey, setReleaseKey] = useState(0)
  const [cancelOpen, setCancelOpen] = useState(false)
  const [isPending, startTransition] = useTransition()

  function openRelease() {
    setReleaseKey((key) => key + 1)
    setReleaseOpen(true)
  }

  function changeDue(next: DateKey | null) {
    if (!next || !briefing || next === briefing.due_on) return
    startTransition(async () => {
      const result = await changeBriefingDue(clientId, next)
      if (!result.ok) toast.error(result.error)
      else toast.success(`Prazo do briefing: ${formatLongDate(next)}.`)
    })
  }

  function confirmCancel() {
    startTransition(async () => {
      const result = await cancelBriefing(clientId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setCancelOpen(false)
      toast.success("Liberação cancelada. O portal do cliente voltou ao normal.")
    })
  }

  const open = briefing ? isBriefingOpen(briefing.status) : false
  const due = briefing ? dueState(briefing, today) : null

  return (
    <PanelCard
      id="briefing-cliente"
      title={
        <>
          <ClipboardList className="size-4 text-muted-foreground" aria-hidden="true" />
          Briefing
        </>
      }
      action={
        briefing ? (
          <span className="rounded-full border px-2.5 py-0.5 text-xs font-medium text-foreground">
            {BRIEFING_STATUS_LABEL[briefing.status]}
          </span>
        ) : (
          <Button variant="ghost" size="sm" onClick={openRelease} className="h-7 gap-1 px-2 text-xs">
            <Send className="size-3.5" />
            Liberar briefing
          </Button>
        )
      }
    >
      {briefing ? (
        <div className="space-y-3 px-5 py-4">
          <dl className="grid grid-cols-2 gap-x-4 gap-y-3 text-[13px]">
            <div>
              <dt className="eyebrow text-muted-foreground">Respostas</dt>
              <dd className="mt-0.5 text-foreground tabular-nums">
                {briefing.answered} de {briefing.total}
              </dd>
            </div>
            <div>
              <dt className="eyebrow text-muted-foreground">{open ? "Prazo" : "Enviado em"}</dt>
              <dd
                className={cn(
                  "mt-0.5 tabular-nums",
                  due === "late" ? "text-destructive" : due === "today" ? "text-warning-ink" : "text-foreground"
                )}
              >
                {open
                  ? `${formatShortDate(briefing.due_on, today)}${due === "late" ? " · atrasado" : due === "today" ? " · hoje" : ""}`
                  : briefing.submitted_at
                    ? formatShortDate(toDateKey(briefing.submitted_at), today)
                    : "—"}
              </dd>
            </div>
            <div>
              <dt className="eyebrow text-muted-foreground">Liberado em</dt>
              <dd className="mt-0.5 text-foreground tabular-nums">{formatShortDate(toDateKey(briefing.released_at), today)}</dd>
            </div>
            <div>
              <dt className="eyebrow text-muted-foreground">Último acesso</dt>
              <dd className="mt-0.5 text-foreground tabular-nums">
                {briefing.last_seen_at ? formatShortDate(toDateKey(briefing.last_seen_at), today) : "Ainda não abriu"}
              </dd>
            </div>
          </dl>
          {open ? (
            <>
              <p className="text-xs leading-5 text-muted-foreground">
                Até o cliente enviar, o portal dele mostra só o Briefing.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <DatePicker
                  value={briefing.due_on}
                  onChange={changeDue}
                  today={today}
                  renderValue={(value) => `Prazo: ${formatShortDate(value, today)}`}
                  placeholder="Prazo"
                  icon={<CalendarClock className="size-3.5" />}
                  aria-label="Mudar o prazo do briefing"
                  className="h-8 text-xs"
                />
                {briefing.status === "not_started" && briefing.answered === 0 ? (
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs text-muted-foreground"
                    disabled={isPending}
                    onClick={() => setCancelOpen(true)}
                  >
                    Cancelar liberação
                  </Button>
                ) : null}
              </div>
            </>
          ) : null}
        </div>
      ) : (
        <p className="px-5 py-4 text-[13px] leading-5 text-muted-foreground">
          Libere quando o contrato estiver assinado. O cliente responde no portal, de preferência por áudio, e até
          enviar só vê o Briefing.
        </p>
      )}

      <ReleaseDialog
        key={releaseKey}
        open={releaseOpen}
        onOpenChange={setReleaseOpen}
        clientId={clientId}
        clientName={clientName}
        defaults={defaults}
        today={today}
      />

      <AlertDialog open={cancelOpen} onOpenChange={setCancelOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Cancelar a liberação do briefing?</AlertDialogTitle>
            <AlertDialogDescription>
              O cliente ainda não respondeu nada. O portal dele volta ao normal e você pode liberar de novo depois.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Voltar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault()
                confirmCancel()
              }}
            >
              {isPending ? "Cancelando…" : "Cancelar liberação"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelCard>
  )
}

/** Confere a identificação (bloco 0) e o prazo, e libera. */
function ReleaseDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
  defaults,
  today,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
  defaults: BriefingIdentification
  today: DateKey
}) {
  const [fields, setFields] = useState<BriefingIdentification>(defaults)
  const [due, setDue] = useState<DateKey>(() => defaultBriefingDue(today))
  const [isPending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    startTransition(async () => {
      const result = await releaseBriefing(clientId, { identification: fields, due_on: due })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onOpenChange(false)
      toast.success(`Briefing liberado para ${clientName}.`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>Liberar briefing</DialogTitle>
            <DialogDescription>
              Confira os dados que o cliente vai confirmar no começo. Até ele enviar, o portal mostra só o Briefing.
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            {IDENTIFICATION_FIELDS.map((field) => (
              <div key={field.key} className={cn("space-y-1.5", field.key === "brand_name" && "sm:col-span-2")}>
                <Label htmlFor={`briefing-${field.key}`}>{field.label}</Label>
                <Input
                  id={`briefing-${field.key}`}
                  value={fields[field.key]}
                  maxLength={field.max}
                  placeholder={field.placeholder}
                  required={field.key === "brand_name"}
                  onChange={(event) => setFields((current) => ({ ...current, [field.key]: event.target.value }))}
                />
              </div>
            ))}
          </div>

          <div className="space-y-1.5">
            <Label>Prazo para responder</Label>
            <div className="flex flex-wrap items-center gap-2">
              <DatePicker
                value={due}
                onChange={(next) => (next ? setDue(next) : null)}
                today={today}
                renderValue={(value) => formatLongDate(value)}
                placeholder="Escolha o prazo"
                icon={<CalendarClock className="size-3.5" />}
                aria-label="Prazo para responder"
              />
              <span className="text-xs text-muted-foreground">Padrão: {BRIEFING_DUE_BUSINESS_DAYS} dias úteis</span>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Liberando…" : "Liberar briefing"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
