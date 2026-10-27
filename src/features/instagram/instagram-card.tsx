"use client"

import { Camera, CircleCheck, RefreshCw, TriangleAlert, Unplug } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { Button } from "@/components/ui/button"
import { disconnectInstagram } from "@/features/instagram/actions"
import type { InstagramCardData } from "@/features/instagram/queries"
import { daysBetween, formatShortDate, toDateKey } from "@/lib/dates"
import { INSTAGRAM_ACCOUNT_TYPE_LABEL, INSTAGRAM_SCOPE_LABEL, SOCIAL_ACCOUNT_STATUS_LABEL } from "@/lib/labels"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Os escopos pedidos à Meta (o mesmo que `INSTAGRAM_SCOPES`, que fica no servidor). */
const REQUESTED_SCOPES = Object.keys(INSTAGRAM_SCOPE_LABEL)
/** A partir de quantos dias para vencer o cartão chama a atenção (a renovação começa em 15). */
const EXPIRY_WARNING_DAYS = 10

/**
 * Cartão "Instagram" da página do cliente (equipe) e do Feed do portal:
 * conectar pelo OAuth da Meta, conectado como @fulano, quando o token vence,
 * reconectar e desconectar (apaga o token). O token nunca chega aqui.
 */
export function InstagramCard({
  clientId,
  clientName,
  data,
  notice,
  audience,
  today,
  className,
}: {
  clientId: string
  clientName: string
  data: InstagramCardData
  /** Resultado da volta do OAuth (`?instagram=`), já em texto. */
  notice: { tone: "success" | "error"; text: string } | null
  audience: "team" | "client"
  today: DateKey
  className?: string
}) {
  const [confirming, setConfirming] = useState(false)
  const [isPending, startTransition] = useTransition()
  const { account, configured } = data
  const connectHref = `/api/instagram/conectar?cliente=${clientId}`

  function confirmDisconnect() {
    startTransition(async () => {
      const result = await disconnectInstagram(clientId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setConfirming(false)
      toast.success("Instagram desconectado.")
    })
  }

  const expiresKey = account ? toDateKey(account.tokenExpiresAt) : null
  const daysLeft = expiresKey ? daysBetween(today, expiresKey) : null
  const expired = account ? account.status === "expired" || (daysLeft !== null && daysLeft < 0) : false
  const missing = account ? REQUESTED_SCOPES.filter((scope) => !account.permissions.includes(scope)) : []

  return (
    <PanelCard
      id="instagram"
      className={className}
      title={
        <>
          <Camera className="size-4 text-muted-foreground" aria-hidden="true" />
          Instagram
        </>
      }
    >
      {notice ? (
        <p
          role="status"
          className={cn(
            "mx-4 mt-3 flex items-start gap-2 rounded-lg px-3 py-2 text-[13px] leading-5",
            notice.tone === "success" ? "bg-brand/10 text-brand-ink" : "bg-destructive/10 text-destructive"
          )}
        >
          {notice.tone === "success" ? (
            <CircleCheck className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          ) : (
            <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
          )}
          {notice.text}
        </p>
      ) : null}

      {account ? (
        <div className="space-y-3 px-4 py-4">
          <div className="flex items-center gap-3">
            <Avatar size="lg">
              {account.pictureUrl ? <AvatarImage src={account.pictureUrl} alt="" referrerPolicy="no-referrer" /> : null}
              <AvatarFallback className="text-sm">{account.username.slice(0, 1).toUpperCase()}</AvatarFallback>
            </Avatar>
            <div className="min-w-0 flex-1">
              <p className="truncate text-[13px] font-medium text-foreground">
                Conectado como{" "}
                <a
                  href={`https://www.instagram.com/${account.username}/`}
                  target="_blank"
                  rel="noreferrer"
                  className="font-semibold hover:underline"
                >
                  @{account.username}
                </a>
              </p>
              <p className="truncate text-xs text-muted-foreground">
                {[account.displayName, INSTAGRAM_ACCOUNT_TYPE_LABEL[account.accountType]].filter(Boolean).join(" · ")}
              </p>
            </div>
          </div>

          <dl className="space-y-1 text-xs text-muted-foreground">
            <div className="flex gap-1">
              <dt>Conectado por</dt>
              <dd className="text-foreground">
                {account.connectedByName} em {formatShortDate(toDateKey(account.connectedAt), today)}
              </dd>
            </div>
            <div className="flex gap-1">
              <dt>{expired ? "Venceu em" : "Acesso vale até"}</dt>
              <dd
                className={cn(
                  "tabular-nums",
                  expired || (daysLeft !== null && daysLeft <= EXPIRY_WARNING_DAYS) ? "text-destructive" : "text-foreground"
                )}
              >
                {expiresKey ? formatShortDate(expiresKey, today) : "—"}
                {!expired && daysLeft !== null && daysLeft <= EXPIRY_WARNING_DAYS
                  ? ` (${daysLeft === 0 ? "hoje" : daysLeft === 1 ? "amanhã" : `em ${daysLeft} dias`})`
                  : null}
              </dd>
            </div>
          </dl>

          {expired || account.status === "refresh_failed" ? (
            <p className="flex items-start gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-xs leading-5 text-destructive">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0" aria-hidden="true" />
              {expired
                ? `${SOCIAL_ACCOUNT_STATUS_LABEL.expired}: reconecte para voltar a publicar e ver as métricas.`
                : `${SOCIAL_ACCOUNT_STATUS_LABEL.refresh_failed}: o app tenta de novo amanhã. Se continuar, reconecte.`}
            </p>
          ) : (
            <p className="text-xs leading-5 text-muted-foreground">O acesso é renovado sozinho antes de vencer.</p>
          )}

          {missing.length > 0 ? (
            <p className="flex items-start gap-2 rounded-lg bg-muted px-3 py-2 text-xs leading-5 text-foreground">
              <TriangleAlert className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
              Faltou autorizar: {missing.map((scope) => INSTAGRAM_SCOPE_LABEL[scope]).join(", ")}. Reconecte e deixe
              todas as permissões marcadas.
            </p>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {configured ? (
              <Button asChild variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
                <a href={connectHref}>
                  <RefreshCw className="size-3.5" />
                  Reconectar
                </a>
              </Button>
            ) : null}
            <Button
              variant="ghost"
              size="sm"
              className="h-8 gap-1.5 text-xs text-muted-foreground"
              onClick={() => setConfirming(true)}
            >
              <Unplug className="size-3.5" />
              Desconectar
            </Button>
          </div>
        </div>
      ) : configured ? (
        <div className="space-y-3 px-4 py-4">
          <p className="text-[13px] leading-5 text-muted-foreground">
            {audience === "client"
              ? "Conecte o Instagram para a Boop publicar os posts aprovados no horário e acompanhar as métricas. Você entra pelo próprio Instagram, sem passar a senha."
              : `Conecte a conta profissional do Instagram de ${clientName} para publicar no horário e acompanhar as métricas. A pessoa entra pelo Instagram, sem passar a senha.`}
          </p>
          <Button asChild size="sm" className="h-8 gap-1.5 text-xs">
            <a href={connectHref}>
              <Camera className="size-3.5" />
              Conectar Instagram
            </a>
          </Button>
          <p className="text-xs leading-5 text-muted-foreground">
            Precisa ser conta profissional (Empresa ou Criador de conteúdo).
          </p>
        </div>
      ) : (
        <p className="px-4 py-4 text-[13px] leading-5 text-muted-foreground">
          Integração com o Instagram não configurada.
        </p>
      )}

      <AlertDialog open={confirming} onOpenChange={(open) => (open ? null : setConfirming(false))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Desconectar o Instagram{account ? ` @${account.username}` : ""}?</AlertDialogTitle>
            <AlertDialogDescription>
              O acesso guardado é apagado e o Boop Admin deixa de publicar e de ler as métricas desta conta. Dá para
              conectar de novo quando quiser.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              variant="destructive"
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault()
                confirmDisconnect()
              }}
            >
              {isPending ? "Desconectando…" : "Desconectar"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelCard>
  )
}
