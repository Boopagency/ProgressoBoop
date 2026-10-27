"use client"

import { ExternalLink, Loader2, RotateCcw, Send } from "lucide-react"
import { useEffect, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { publishLabel, type PostSummary } from "@/features/content/logic"
import { loadAutoPublishContext, setAutoPublish, type AutoPublishContext } from "@/features/instagram/publish-actions"
import { MAX_PUBLISH_ATTEMPTS, publishBlockers, publishKind, type PublishCandidate } from "@/features/instagram/publish-logic"
import { todayKey, zonedTimeToInstant } from "@/lib/dates"
import { PUBLISH_STATUS_LABEL } from "@/lib/labels"
import type { ContentPost, DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

type PublishFields = Pick<
  ContentPost,
  "stage" | "auto_publish" | "publish_status" | "publish_error" | "publish_attempts" | "instagram_permalink"
>

/**
 * "Publicar automaticamente" no post (admin): liga e desliga a publicação no
 * Instagram e mostra o estado (agendado para…, publicando, publicado com o
 * link, não publicou e por quê, tentar de novo). Age sobre o post salvo:
 * com mudanças por salvar, pede para salvar antes.
 */
export function AutoPublishPanel({
  post,
  saved,
  dirty,
  onStageChange,
  className,
}: {
  post: PostSummary
  /** O post como está salvo (com a legenda e os slides), ou null enquanto os textos carregam. */
  saved: PublishCandidate | null
  /** Há mudanças por salvar que mexem na publicação. */
  dirty: boolean
  onStageChange: (stage: ContentPost["stage"]) => void
  className?: string
}) {
  const [today] = useState<DateKey>(() => todayKey())
  // Ao abrir o post (o horário passado se confere de novo no servidor ao ligar).
  const [openedAt] = useState(() => Date.now())
  const [state, setState] = useState<PublishFields>(() => ({
    stage: post.stage,
    auto_publish: post.auto_publish,
    publish_status: post.publish_status,
    publish_error: post.publish_error,
    publish_attempts: post.publish_attempts,
    instagram_permalink: post.instagram_permalink,
  }))
  const [context, setContext] = useState<AutoPublishContext | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let current = true
    void loadAutoPublishContext(post.client_id).then((result) => {
      if (current) setContext(result.ok ? result.data : { configured: false, account: null })
    })
    return () => {
      current = false
    }
  }, [post.client_id])

  if (!post.networks.includes("instagram") || post.format === "text") return null

  const kind = publishKind(post.format)
  const status = state.auto_publish ? state.publish_status : state.publish_status === "published" ? "published" : null
  const account = context?.account ?? null
  const connected = Boolean(account && account.status !== "expired" && Date.parse(account.tokenExpiresAt) > openedAt)
  const dueAt = post.publish_on && post.publish_time ? Date.parse(zonedTimeToInstant(post.publish_on, post.publish_time.slice(0, 5))) : null
  const blockers =
    saved && context ? publishBlockers({ ...saved, stage: state.stage }, { accountConnected: connected, dueAt, now: openedAt, requireFuture: true }) : []

  function change(on: boolean) {
    startTransition(async () => {
      const result = await setAutoPublish(post.id, on)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setState(result.data)
      if (result.data.stage !== state.stage) onStageChange(result.data.stage)
      if (on) toast.success("Publicação agendada", { description: `${post.title} · ${publishLabel(post, today)}` })
      else toast("Publicação automática desligada", { description: post.title })
    })
  }

  let body: ReactNode
  if (!kind) {
    body = (
      <p className="text-xs text-muted-foreground">
        Reels e vídeo não publicam sozinhos: o app ainda não guarda vídeo. Publique pelo Instagram e marque como publicado.
      </p>
    )
  } else if (status === "published") {
    body = (
      <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-foreground">
        <span>{PUBLISH_STATUS_LABEL.published}.</span>
        {state.instagram_permalink ? (
          <a
            href={state.instagram_permalink}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 font-medium text-brand-ink underline-offset-2 hover:underline"
          >
            Ver no Instagram
            <ExternalLink className="size-3" aria-hidden="true" />
          </a>
        ) : null}
      </p>
    )
  } else if (status === "failed") {
    body = (
      <div className="space-y-2">
        <p className="text-xs text-overdue">
          <span className="font-medium">{PUBLISH_STATUS_LABEL.failed}:</span> {state.publish_error ?? "erro desconhecido."}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending || dirty || !context?.configured}
            onClick={() => change(true)}
            className="h-7 gap-1 px-2.5 text-xs shadow-none"
          >
            <RotateCcw className="size-3.5" aria-hidden="true" />
            Tentar de novo
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            disabled={isPending}
            onClick={() => change(false)}
            className="h-7 px-2 text-xs text-muted-foreground"
          >
            Desligar
          </Button>
        </div>
      </div>
    )
  } else {
    const on = state.auto_publish
    // Por que não dá para ligar (desligar sempre dá).
    const reason =
      on || !context
        ? null
        : !context.configured
          ? "Integração com o Instagram não configurada."
          : dirty
            ? "Salve o post antes de ligar a publicação automática."
            : (blockers[0] ?? null)
    body = (
      <div className="space-y-1.5">
        <label className={cn("flex w-fit items-center gap-2 text-[13px] text-foreground", reason || isPending ? "cursor-default" : "cursor-pointer")}>
          <Checkbox
            checked={on}
            disabled={isPending || status === "publishing" || reason !== null || !context}
            onCheckedChange={(checked) => change(checked === true)}
          />
          Publicar automaticamente
          {isPending ? <Loader2 className="size-3.5 animate-spin text-muted-foreground" aria-hidden="true" /> : null}
        </label>
        {status === "publishing" ? (
          <p className="text-xs text-foreground">Publicando agora no Instagram…</p>
        ) : on ? (
          <p className="text-xs text-foreground">
            {PUBLISH_STATUS_LABEL.queued}: {publishLabel(post, today)}
            {account ? ` em @${account.username}` : ""}. Sai sozinho no horário.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            {reason ??
              `Sai sozinho no horário${account ? ` em @${account.username}` : ""}. Ligar leva o post para Agendado.${
                kind === "story" ? "" : " No feed, as imagens precisam estar entre 4:5 e 1,91:1 (ex.: 1080 × 1350)."
              }`}
          </p>
        )}
        {on && state.publish_error ? (
          <p className="text-xs text-muted-foreground">
            {state.publish_attempts > 0
              ? `Tentativa ${state.publish_attempts} de ${MAX_PUBLISH_ATTEMPTS} falhou: ${state.publish_error} Tenta de novo sozinho.`
              : state.publish_error}
          </p>
        ) : null}
        {on && dirty ? <p className="text-xs text-muted-foreground">Ao salvar, as imagens e o horário são atualizados na fila.</p> : null}
      </div>
    )
  }

  return (
    <section aria-label="Publicação no Instagram" className={cn("space-y-2 rounded-lg border p-3", className)}>
      <p className="flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
        <Send className={cn("size-3.5", state.auto_publish && status !== "failed" ? "text-brand-ink" : "text-muted-foreground")} aria-hidden="true" />
        Publicação no Instagram
      </p>
      {body}
    </section>
  )
}
