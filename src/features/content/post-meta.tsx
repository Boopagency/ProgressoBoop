"use client"

import {
  AlertTriangle,
  Camera,
  Clapperboard,
  Clock,
  GalleryHorizontalEnd,
  Image as ImageIcon,
  Smartphone,
  Type,
  Video,
  type LucideIcon,
} from "lucide-react"

import {
  blockedFronts,
  clientColorIndex,
  frontStatus,
  isBlocked,
  isLate,
  pendingFronts,
  publishLabel,
  type PostSummary,
} from "@/features/content/logic"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import {
  CONTENT_FORMAT_LABEL,
  CONTENT_FRONT_LABEL,
  CONTENT_FRONT_STATUS_LABEL,
  CONTENT_FRONTS,
  CONTENT_STAGE_LABEL,
} from "@/lib/labels"
import type { ContentFormat, ContentFrontStatus, ContentStage, DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/*
 * Peças visuais dos posts: a marca do cliente (inicial numa cor estável), a
 * etapa, os sinais de atrasado e de falta material e as frentes.
 */

/**
 * Cores suaves por cliente. Sem vermelho, verde e laranja, que no produto
 * dizem atrasado, concluído e atenção.
 */
const CLIENT_COLORS = [
  { mark: "bg-sky-100 text-sky-900", dot: "bg-sky-400" },
  { mark: "bg-indigo-100 text-indigo-900", dot: "bg-indigo-400" },
  { mark: "bg-violet-100 text-violet-900", dot: "bg-violet-400" },
  { mark: "bg-fuchsia-100 text-fuchsia-900", dot: "bg-fuchsia-400" },
  { mark: "bg-cyan-100 text-cyan-900", dot: "bg-cyan-500" },
  { mark: "bg-blue-100 text-blue-900", dot: "bg-blue-400" },
  { mark: "bg-purple-100 text-purple-900", dot: "bg-purple-400" },
  { mark: "bg-slate-200 text-slate-800", dot: "bg-slate-400" },
  { mark: "bg-brand-sand text-foreground", dot: "bg-stone-400" },
  { mark: "bg-brand-mist text-brand-navy", dot: "bg-brand-slate" },
] as const

function clientColors(clientId: string) {
  return CLIENT_COLORS[clientColorIndex(clientId, CLIENT_COLORS.length)] ?? CLIENT_COLORS[0]
}

/** Fundo e texto da marca do cliente. */
export function clientColor(clientId: string): string {
  return clientColors(clientId).mark
}

/** Cor mais forte, para pontos pequenos (calendário no celular). */
export function clientDotColor(clientId: string): string {
  return clientColors(clientId).dot
}

const MARK_SIZE = {
  xs: "size-4 text-[9px]",
  sm: "size-5 text-[10px]",
  md: "size-7 text-xs",
} as const

/** Inicial do cliente na cor dele (a foto do perfil entra com o preview do feed). */
export function ClientMark({
  clientId,
  size = "sm",
  className,
}: {
  clientId: string
  size?: keyof typeof MARK_SIZE
  className?: string
}) {
  const { clientById } = useWorkspace()
  const name = clientById.get(clientId)?.name ?? "Cliente"
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cn(
        "inline-flex shrink-0 items-center justify-center rounded-full leading-none font-semibold select-none",
        MARK_SIZE[size],
        clientColor(clientId),
        className
      )}
    >
      {name.trim().charAt(0).toLocaleUpperCase("pt-BR")}
    </span>
  )
}

const FORMAT_ICON: Record<ContentFormat, LucideIcon> = {
  reels: Clapperboard,
  carousel: GalleryHorizontalEnd,
  static: ImageIcon,
  stories: Smartphone,
  video: Video,
  photo: Camera,
  text: Type,
}

export function FormatIcon({ format, className }: { format: ContentFormat; className?: string }) {
  const Icon = FORMAT_ICON[format]
  return <Icon role="img" aria-label={CONTENT_FORMAT_LABEL[format]} className={cn("size-3.5 shrink-0", className)} />
}

/** Ponto da etapa: vazado enquanto está com a equipe, cheio quando aprovado; verde quando publicado. */
export const STAGE_DOT: Record<ContentStage, string> = {
  production: "border-2 border-muted-foreground/45",
  internal_review: "border-2 border-brand/70",
  client_review: "bg-warning",
  approved: "bg-brand/55",
  scheduled: "bg-brand",
  published: "bg-success",
}

export function StageDot({ stage, className }: { stage: ContentStage; className?: string }) {
  return (
    <span
      role="img"
      aria-label={CONTENT_STAGE_LABEL[stage]}
      className={cn("inline-block size-2 shrink-0 rounded-full", STAGE_DOT[stage], className)}
    />
  )
}

/** Situação da frente: texto (listas) e ponto (cartões). */
const FRONT_TEXT: Record<ContentFrontStatus, string> = {
  not_needed: "text-subtle-foreground",
  todo: "text-muted-foreground",
  in_progress: "text-foreground",
  missing_material: "font-medium text-overdue",
  in_review: "text-brand-ink",
  changes: "text-warning-ink",
  done: "text-success-ink",
}

const FRONT_DOT: Record<ContentFrontStatus, string> = {
  not_needed: "bg-transparent",
  todo: "border border-muted-foreground/50",
  in_progress: "bg-muted-foreground/60",
  missing_material: "bg-overdue",
  in_review: "bg-brand",
  changes: "bg-warning",
  done: "bg-success",
}

export function FrontStatusDot({ status, className }: { status: ContentFrontStatus; className?: string }) {
  return <span aria-hidden="true" className={cn("inline-block size-1.5 shrink-0 rounded-full", FRONT_DOT[status], className)} />
}

/** Frentes em letras pequenas com o ponto da situação (C · D · V), para cartões. */
export function FrontDots({ post, className }: { post: PostSummary; className?: string }) {
  const fronts = CONTENT_FRONTS.filter((front) => frontStatus(post, front) !== "not_needed")
  if (fronts.length === 0) return null
  return (
    <span className={cn("inline-flex items-center gap-1.5", className)}>
      {fronts.map((front) => {
        const status = frontStatus(post, front)
        return (
          <span
            key={front}
            title={`${CONTENT_FRONT_LABEL[front]}: ${CONTENT_FRONT_STATUS_LABEL[status]}`}
            className={cn("inline-flex items-center gap-0.5 text-[11px]", FRONT_TEXT[status])}
          >
            <FrontStatusDot status={status} />
            <span aria-hidden="true">{CONTENT_FRONT_LABEL[front].charAt(0)}</span>
            <span className="sr-only">
              {CONTENT_FRONT_LABEL[front]}: {CONTENT_FRONT_STATUS_LABEL[status]}
            </span>
          </span>
        )
      })}
    </span>
  )
}

/** O que falta em cada frente, por extenso ("Copy: A fazer · Design: Em revisão"). */
export function PendingFronts({ post, className }: { post: PostSummary; className?: string }) {
  const pending = pendingFronts(post)
  if (pending.length === 0) {
    return <span className={cn("text-xs text-success-ink", className)}>{post.stage === "published" ? "Publicado" : "Frentes prontas"}</span>
  }
  return (
    <span className={cn("flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs", className)}>
      {pending.map((front) => {
        const status = frontStatus(post, front)
        return (
          <span key={front} className="inline-flex items-center gap-1">
            <FrontStatusDot status={status} />
            <span className="text-muted-foreground">{CONTENT_FRONT_LABEL[front]}:</span>
            <span className={FRONT_TEXT[status]}>{CONTENT_FRONT_STATUS_LABEL[status]}</span>
          </span>
        )
      })}
    </span>
  )
}

/** Sinais de atenção: atrasado e falta material. */
export function PostFlags({ post, today, compact = false }: { post: PostSummary; today: DateKey; compact?: boolean }) {
  const late = isLate(post, today)
  const blocked = isBlocked(post)
  if (!late && !blocked) return null
  const missing = blockedFronts(post).map((front) => CONTENT_FRONT_LABEL[front].toLocaleLowerCase("pt-BR"))
  return (
    <span className="inline-flex items-center gap-1.5">
      {late ? (
        <span title="Atrasado" className="inline-flex items-center gap-0.5 text-[11px] font-medium whitespace-nowrap text-overdue">
          <Clock className="size-3" aria-hidden="true" />
          {compact ? <span className="sr-only">Atrasado</span> : "Atrasado"}
        </span>
      ) : null}
      {blocked ? (
        <span title={`Falta material (${missing.join(", ")})`} className="inline-flex items-center gap-0.5 text-[11px] font-medium whitespace-nowrap text-warning-ink">
          <AlertTriangle className="size-3" aria-hidden="true" />
          {compact ? <span className="sr-only">Falta material</span> : "Falta material"}
        </span>
      ) : null}
    </span>
  )
}

/** Ponto único para itens muito pequenos (calendário no mês): vermelho atrasado, laranja falta material. */
export function attentionDot(post: PostSummary, today: DateKey): string | null {
  if (isLate(post, today)) return "bg-overdue"
  if (isBlocked(post)) return "bg-warning"
  return null
}

/**
 * Linha de post (listas): marca do cliente, título e sinais, cliente,
 * formato, quando sai, etapa e, se pedido, o que falta em cada frente.
 */
export function PostRow({
  post,
  today,
  onOpen,
  showClient = true,
  showFronts = true,
  className,
}: {
  post: PostSummary
  today: DateKey
  onOpen: (post: PostSummary) => void
  showClient?: boolean
  showFronts?: boolean
  className?: string
}) {
  const { clientById, profiles } = useWorkspace()
  const ownerIndex = profiles.findIndex((profile) => profile.id === post.owner_id)
  const owner = ownerIndex >= 0 ? profiles[ownerIndex] : undefined
  return (
    <button
      type="button"
      onClick={() => onOpen(post)}
      className={cn("flex w-full items-start gap-3 rounded-lg px-3 py-2.5 text-left transition-colors hover:bg-muted/50", className)}
    >
      <ClientMark clientId={post.client_id} size="md" />
      <span className="min-w-0 flex-1">
        <span className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5">
          <span className="line-clamp-2 min-w-0 text-sm font-medium break-words text-foreground">{post.title}</span>
          <PostFlags post={post} today={today} />
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-xs text-muted-foreground">
          {showClient ? (
            <>
              <span className="max-w-40 truncate">{clientById.get(post.client_id)?.name ?? "Cliente"}</span>
              <span aria-hidden="true" className="text-subtle-foreground">·</span>
            </>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <FormatIcon format={post.format} className="size-3" />
            {CONTENT_FORMAT_LABEL[post.format]}
          </span>
          <span aria-hidden="true" className="text-subtle-foreground">·</span>
          <span className="tabular-nums">{publishLabel(post, today)}</span>
          <span aria-hidden="true" className="text-subtle-foreground">·</span>
          <span className="inline-flex items-center gap-1">
            <StageDot stage={post.stage} />
            {CONTENT_STAGE_LABEL[post.stage]}
          </span>
        </span>
        {showFronts ? <PendingFronts post={post} className="mt-1" /> : null}
      </span>
      {owner ? (
        <PersonAvatar
          name={owner.full_name}
          avatarUrl={owner.avatar_url}
          colorIndex={ownerIndex}
          size="sm"
          className="mt-0.5 size-5 shrink-0 [&_[data-slot=avatar-fallback]]:text-[10px]"
        />
      ) : null}
    </button>
  )
}
