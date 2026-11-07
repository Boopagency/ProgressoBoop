"use client"

import { CalendarClock, Check, CircleAlert, Send, Undo2 } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { DatePicker } from "@/components/date-picker"
import { HeroEyebrow, HeroPanel } from "@/components/hero-panel"
import { StatGrid } from "@/components/stat-grid"
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
} from "@/features/briefing/logic"
import { setBriefingStatus } from "@/features/briefing/team-actions"
import {
  nextTeamStatus,
  previousTeamStatus,
  TEAM_STATUS_ACTION,
  type BriefingProgress,
  type TeamBriefingDetail,
} from "@/features/briefing/team-logic"
import { formatLongDate, formatShortDate, toDateKey, toTimeLabel } from "@/lib/dates"
import { BRIEFING_STATUSES, BRIEFING_STATUS_LABEL } from "@/lib/labels"
import type { BriefingStatus, DateKey, Timestamp } from "@/lib/types"
import { cn } from "@/lib/utils"

/** "hoje, 14:32" / "06/11, 09:10". */
function moment(at: Timestamp, today: DateKey): string {
  return `${formatShortDate(toDateKey(at), today)}, ${toTimeLabel(at)}`
}

/**
 * Topo da aba Briefing (o painel de destaque): o status na sequência, o
 * andamento, o prazo, se os obrigatórios estão completos e os botões da
 * equipe. Antes de liberar, explica e abre a liberação (identificação
 * conferida e prazo de 5 dias úteis, editável).
 */
export function BriefingStatusPanel({
  clientId,
  clientName,
  defaults,
  briefing,
  progress,
  today,
}: {
  clientId: string
  clientName: string
  /** Dados que a ficha já tem, para preencher a identificação. */
  defaults: BriefingIdentification
  briefing: TeamBriefingDetail | null
  progress: BriefingProgress | null
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

  function changeStatus(to: BriefingStatus) {
    if (!briefing) return
    const from = briefing.status
    startTransition(async () => {
      const result = await setBriefingStatus(clientId, from, to)
      if (!result.ok) toast.error(result.error)
      else toast.success(`Briefing: ${BRIEFING_STATUS_LABEL[to]}.`)
    })
  }

  const releaseDialog = (
    <ReleaseDialog
      key={releaseKey}
      open={releaseOpen}
      onOpenChange={setReleaseOpen}
      clientId={clientId}
      clientName={clientName}
      defaults={defaults}
      today={today}
    />
  )

  if (!briefing || !progress) {
    return (
      <HeroPanel aria-label="Briefing de onboarding">
        <HeroEyebrow>Briefing de onboarding</HeroEyebrow>
        <p className="mt-6 max-w-2xl font-display text-[26px] leading-[1.15] font-medium tracking-[-0.03em] text-foreground sm:text-[32px]">
          Briefing <em className="emphasis text-[1.14em] text-brand-ink">ainda não liberado</em>
        </p>
        <p className="mt-3 max-w-xl text-[13.5px] leading-6 text-muted-foreground">
          Libere quando o contrato estiver assinado. O cliente responde no portal, de preferência por áudio, e até enviar
          só vê o Briefing. As respostas aparecem aqui, por bloco.
        </p>
        <Button onClick={openRelease} className="mt-6 gap-1.5">
          <Send />
          Liberar briefing
        </Button>
        {releaseDialog}
      </HeroPanel>
    )
  }

  const open = isBriefingOpen(briefing.status)
  const due = dueState(briefing, today)
  const missing = progress.missing.length
  const next = nextTeamStatus(briefing.status)
  const previous = previousTeamStatus(briefing.status)
  const blockedImmersion = next === "immersion_done" && missing > 0

  return (
    <HeroPanel aria-label="Situação do briefing">
      <HeroEyebrow>Briefing de onboarding</HeroEyebrow>
      <p className="mt-6 max-w-2xl font-display text-[26px] leading-[1.15] font-medium tracking-[-0.03em] text-foreground sm:text-[32px]">
        <StatusHeadline briefing={briefing} progress={progress} today={today} />
      </p>

      <StatusSteps status={briefing.status} />

      <StatGrid
        variant="line"
        className="mt-7"
        items={[
          {
            key: "respostas",
            label: "Respostas",
            value: `${progress.percent}%`,
            hint: `${progress.answered} de ${progress.total}${progress.skipped > 0 ? ` · ${progress.skipped} pulada${progress.skipped === 1 ? "" : "s"}` : ""}`,
            progress: progress.percent,
            accent: open,
          },
          {
            key: "obrigatorias",
            label: "Obrigatórias",
            value: missing === 0 ? "Completas" : `Faltam ${missing}`,
            hint: missing === 0 ? "a imersão pode ser marcada" : "para marcar a imersão",
            alert: missing > 0 && !open,
          },
          open
            ? {
                key: "prazo",
                label: "Prazo",
                value: formatShortDate(briefing.due_on, today),
                hint: due === "late" ? "atrasado" : due === "today" ? "vence hoje" : `liberado em ${formatShortDate(toDateKey(briefing.released_at), today)}`,
                alert: due === "late",
              }
            : {
                key: "enviado",
                label: "Enviado em",
                value: briefing.submitted_at ? formatShortDate(toDateKey(briefing.submitted_at), today) : "—",
                hint: `prazo era ${formatShortDate(briefing.due_on, today)}`,
              },
          {
            key: "acesso",
            label: "Último acesso",
            value: briefing.last_seen_at ? formatShortDate(toDateKey(briefing.last_seen_at), today) : "—",
            hint: briefing.last_seen_at ? toTimeLabel(briefing.last_seen_at) : "ainda não abriu",
          },
        ]}
      />

      {missing > 0 ? (
        <details className="group mt-5 max-w-2xl text-[13px]">
          <summary className="inline-flex cursor-pointer list-none items-center gap-1.5 text-muted-foreground hover:text-foreground">
            <CircleAlert className="size-3.5" aria-hidden="true" />
            {missing === 1 ? "1 obrigatória sem resposta" : `${missing} obrigatórias sem resposta`}
            <span className="text-xs group-open:hidden">· ver</span>
          </summary>
          <ul className="mt-2 space-y-1 pl-5 text-muted-foreground">
            {progress.missing.map((item) => (
              <li key={item.id} className="list-disc">
                <span className="text-foreground">{item.text}</span> <span className="text-xs">· {item.block}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {open ? (
          <>
            <p className="mr-2 text-xs leading-5 text-muted-foreground">Até o cliente enviar, o portal dele mostra só o Briefing.</p>
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
            {briefing.status === "not_started" && briefing.answers.length === 0 ? (
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
          </>
        ) : null}
        {next ? (
          <Button onClick={() => changeStatus(next)} disabled={isPending || blockedImmersion} className="gap-1.5">
            <Check />
            {TEAM_STATUS_ACTION[next as keyof typeof TEAM_STATUS_ACTION]}
          </Button>
        ) : null}
        {previous && !isBriefingOpen(previous) ? (
          <Button variant="ghost" size="sm" onClick={() => changeStatus(previous)} disabled={isPending} className="gap-1.5 text-muted-foreground">
            <Undo2 className="size-3.5" />
            Voltar para {BRIEFING_STATUS_LABEL[previous]}
          </Button>
        ) : null}
        {blockedImmersion ? (
          <p className="text-xs text-muted-foreground">A imersão só pode ser marcada com todas as obrigatórias respondidas.</p>
        ) : null}
      </div>

      {releaseDialog}

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
    </HeroPanel>
  )
}

function StatusHeadline({ briefing, progress, today }: { briefing: TeamBriefingDetail; progress: BriefingProgress; today: DateKey }) {
  const em = "emphasis text-[1.14em] text-brand-ink"
  switch (briefing.status) {
    case "not_started":
      return (
        <>
          Liberado, <em className={em}>esperando o cliente</em>
        </>
      )
    case "in_progress":
      return (
        <>
          Em preenchimento, <em className={em}>{progress.percent}% respondido</em>
        </>
      )
    case "submitted":
      return (
        <>
          Enviado{briefing.submitted_at ? ` ${moment(briefing.submitted_at, today).replace(",", " às")}` : ""},{" "}
          <em className={em}>{progress.missing.length === 0 ? "pronto para a imersão" : "com obrigatórias em aberto"}</em>
        </>
      )
    case "immersion_done":
      return (
        <>
          Imersão feita, <em className={em}>falta o Documento de Marca</em>
        </>
      )
    case "document_sent":
      return (
        <>
          Documento enviado, <em className={em}>esperando a validação</em>
        </>
      )
    case "validated":
      return (
        <>
          Briefing <em className={em}>validado</em>
        </>
      )
  }
}

/** A sequência inteira, com o passo atual em azul. */
function StatusSteps({ status }: { status: BriefingStatus }) {
  const current = BRIEFING_STATUSES.indexOf(status)
  return (
    <ol aria-label="Etapas do briefing" className="mt-6 flex flex-wrap gap-1.5">
      {BRIEFING_STATUSES.map((step, index) => {
        const done = index < current
        const active = index === current
        return (
          <li
            key={step}
            aria-current={active ? "step" : undefined}
            className={cn(
              "inline-flex h-7 items-center gap-1.5 rounded-full border px-3 text-xs font-medium",
              active
                ? "border-transparent bg-primary text-primary-foreground shadow-glow"
                : done
                  ? "border-border bg-card text-foreground"
                  : "border-dashed border-border text-muted-foreground"
            )}
          >
            {done ? <Check className="size-3 text-brand-ink" aria-hidden="true" /> : null}
            {BRIEFING_STATUS_LABEL[step]}
          </li>
        )
      })}
    </ol>
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
