"use client"

import { Clapperboard, Copy, ImagePlus, Loader2, Pencil, Pin, PinOff, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useId, useOptimistic, useState, useTransition } from "react"
import { toast } from "sonner"

import { SegmentedControl } from "@/components/segmented-control"
import { Button, buttonVariants } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { setClientAvatar, updateFeedProfile, updatePost } from "@/features/content/actions"
import { ContentImage, ImagePick } from "@/features/content/content-image"
import { discardUploads, uploadContentImage } from "@/features/content/image-upload"
import {
  feedPosts,
  MAX_PINNED,
  pinnedCount,
  publishLabel,
  type FeedFilter,
  type PostSummary,
} from "@/features/content/logic"
import { clientColor, StageDot } from "@/features/content/post-meta"
import { BIO_MAX, HANDLE_MAX } from "@/features/content/validation"
import { CONTENT_FORMAT_LABEL, CONTENT_STAGE_LABEL } from "@/lib/labels"
import type { Client, ContentFormat, DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/*
 * Preview do feed do Instagram de um cliente: o cabeçalho do perfil (foto, @
 * e bio, editáveis ali mesmo) e o grid de 3 colunas em 3:4, como o
 * Instagram mostra hoje, na ordem `feedOrder` (fixados primeiro, depois do
 * mais recente para o mais antigo). Clicar num quadrado abre o post.
 */

const FILTER_OPTIONS: { value: FeedFilter; label: string }[] = [
  { value: "planned", label: "Todos os planejados" },
  { value: "approved", label: "Só aprovados" },
]

/** Ícone do canto, como no Instagram: carrossel e vídeo (reels). */
const FEED_ICON: Partial<Record<ContentFormat, LucideIcon>> = {
  carousel: Copy,
  reels: Clapperboard,
  video: Clapperboard,
}

export function ContentFeed({
  client,
  posts,
  today,
  onOpen,
  limit,
  moreHref,
  className,
}: {
  client: Client
  /** Pode trazer posts de outros clientes: o feed mostra só os deste. */
  posts: PostSummary[]
  today: DateKey
  onOpen: (post: PostSummary) => void
  /** Quantos quadrados mostrar; o resto fica no link `moreHref`. */
  limit?: number
  moreHref?: string
  className?: string
}) {
  const [filter, setFilter] = useState<FeedFilter>("planned")
  const [, startTransition] = useTransition()
  const [optimistic, pinOptimistic] = useOptimistic(posts, (current: PostSummary[], change: { id: string; pinned: boolean }) =>
    current.map((post) => (post.id === change.id ? { ...post, pinned: change.pinned } : post))
  )
  const tiles = feedPosts(optimistic, client.id, filter)
  const shown = limit === undefined ? tiles : tiles.slice(0, limit)
  const pinned = pinnedCount(optimistic, client.id)

  function togglePin(post: PostSummary) {
    const next = !post.pinned
    if (next && pinned >= MAX_PINNED) {
      toast.error(`Já há ${MAX_PINNED} posts fixados no feed deste cliente. Desafixe um antes.`)
      return
    }
    startTransition(async () => {
      pinOptimistic({ id: post.id, pinned: next })
      const result = await updatePost(post.id, { pinned: next })
      if (!result.ok) toast.error(result.error)
    })
  }

  return (
    <div className={cn("mx-auto w-full max-w-[600px]", className)}>
      <FeedProfile key={client.id} client={client} count={tiles.length} />

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t pt-3">
        <SegmentedControl aria-label="Posts do feed" value={filter} onValueChange={setFilter} options={FILTER_OPTIONS} />
        <p className="inline-flex items-center gap-1 text-xs text-muted-foreground tabular-nums">
          <Pin className="size-3" aria-hidden="true" />
          {pinned} de {MAX_PINNED} fixados
        </p>
      </div>

      {tiles.length === 0 ? (
        <p className="mt-3 rounded-lg border border-dashed px-4 py-8 text-center text-[13px] text-muted-foreground">
          {filter === "approved"
            ? "Nenhum post aprovado, programado ou publicado ainda."
            : "Nenhum post de Instagram planejado. Stories não entram no feed."}
        </p>
      ) : (
        <ul aria-label="Grid do feed" className="mt-3 grid grid-cols-3 gap-0.5">
          {shown.map((post) => (
            <FeedTile key={post.id} post={post} today={today} onOpen={onOpen} onTogglePin={togglePin} />
          ))}
        </ul>
      )}

      {moreHref && limit !== undefined && tiles.length > limit ? (
        <Link
          href={moreHref}
          className="mt-3 block text-center text-xs font-medium text-muted-foreground hover:text-foreground"
        >
          Ver o feed inteiro ({tiles.length})
        </Link>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Grid                                                                */
/* ------------------------------------------------------------------ */

function FeedTile({
  post,
  today,
  onOpen,
  onTogglePin,
}: {
  post: PostSummary
  today: DateKey
  onOpen: (post: PostSummary) => void
  onTogglePin: (post: PostSummary) => void
}) {
  const Icon = FEED_ICON[post.format]
  const label = [
    post.title,
    CONTENT_FORMAT_LABEL[post.format],
    publishLabel(post, today),
    CONTENT_STAGE_LABEL[post.stage],
    post.pinned ? "Fixado" : null,
  ]
    .filter(Boolean)
    .join(" · ")
  const title = <TileTitle title={post.title} />

  return (
    <li className="group relative">
      <button
        type="button"
        onClick={() => onOpen(post)}
        aria-label={label}
        title={label}
        className="relative block aspect-[3/4] w-full overflow-hidden bg-muted outline-none focus-visible:z-10 focus-visible:ring-[3px] focus-visible:ring-ring"
      >
        {post.cover_path ? (
          <ContentImage key={post.cover_path} path={post.cover_path} fallback={title} className="transition-opacity group-hover:opacity-90" />
        ) : (
          title
        )}
        <span
          aria-hidden="true"
          className={cn(
            "absolute top-1.5 right-1.5 flex items-center gap-1",
            post.cover_path ? "text-white drop-shadow-[0_1px_2px_rgb(0_0_0/0.55)]" : "text-muted-foreground"
          )}
        >
          {post.pinned ? <Pin className="size-3.5 fill-current sm:size-4" /> : null}
          {Icon ? <Icon className="size-3.5 sm:size-4" /> : null}
        </span>
        <span aria-hidden="true" className="absolute bottom-1.5 left-1.5 flex size-4 items-center justify-center rounded-full bg-background/90 shadow-sm">
          <StageDot stage={post.stage} />
        </span>
      </button>
      {/* Fixar pelo grid com mouse; no celular, pelo post ("Fixar no topo do feed"). */}
      <button
        type="button"
        onClick={() => onTogglePin(post)}
        aria-pressed={post.pinned}
        aria-label={post.pinned ? `Desafixar “${post.title}” do feed` : `Fixar “${post.title}” no topo do feed`}
        title={post.pinned ? "Desafixar" : "Fixar no topo"}
        className="absolute top-1.5 left-1.5 hidden size-7 items-center justify-center rounded-full bg-background/90 text-foreground opacity-0 shadow-sm transition-opacity outline-none group-hover:opacity-100 focus-visible:opacity-100 focus-visible:ring-[3px] focus-visible:ring-ring/50 pointer-fine:flex [&_svg]:size-3.5"
      >
        {post.pinned ? <PinOff /> : <Pin />}
      </button>
    </li>
  )
}

/** Post sem capa: o título num fundo neutro. */
function TileTitle({ title }: { title: string }) {
  return (
    <span className="absolute inset-0 flex items-center justify-center p-2 text-center sm:p-3">
      <span className="line-clamp-5 text-[11px] leading-snug font-medium break-words text-muted-foreground sm:text-xs">{title}</span>
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Perfil                                                              */
/* ------------------------------------------------------------------ */

function ProfilePhoto({ client, busy = false, className }: { client: Client; busy?: boolean; className?: string }) {
  const initial = (
    <span
      className={cn(
        "absolute inset-0 flex items-center justify-center text-2xl font-semibold select-none",
        clientColor(client.id)
      )}
    >
      {client.name.trim().charAt(0).toLocaleUpperCase("pt-BR")}
    </span>
  )
  return (
    <span className={cn("relative block size-16 shrink-0 overflow-hidden rounded-full border sm:size-20", className)}>
      {client.avatar_path ? (
        <ContentImage key={client.avatar_path} path={client.avatar_path} alt={`Foto de ${client.name}`} fallback={initial} />
      ) : (
        initial
      )}
      {busy ? (
        <span className="absolute inset-0 flex items-center justify-center bg-background/70">
          <Loader2 className="size-5 animate-spin text-muted-foreground" aria-label="Enviando" />
        </span>
      ) : null}
    </span>
  )
}

/** Cabeçalho como o do Instagram: foto, @, número de posts, nome e bio. */
function FeedProfile({ client, count }: { client: Client; count: number }) {
  const [editing, setEditing] = useState(false)
  if (editing) return <ProfileForm client={client} onDone={() => setEditing(false)} />

  return (
    <div>
      <div className="flex items-center gap-4 sm:gap-6">
        <ProfilePhoto client={client} />
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            {client.instagram_handle ? (
              <p className="truncate text-base font-semibold text-foreground">@{client.instagram_handle}</p>
            ) : (
              <p className="text-sm text-muted-foreground">Sem @ do Instagram</p>
            )}
            <Button type="button" variant="outline" size="sm" onClick={() => setEditing(true)} className="h-7 gap-1 px-2.5 text-xs shadow-none">
              <Pencil className="size-3.5" />
              Editar perfil
            </Button>
          </div>
          <p className="mt-1 text-sm text-foreground">
            <span className="font-semibold tabular-nums">{count}</span> {count === 1 ? "post" : "posts"}
          </p>
        </div>
      </div>
      <div className="mt-3 text-sm">
        <p className="font-semibold text-foreground">{client.name}</p>
        {client.instagram_bio ? (
          <p className="mt-0.5 break-words whitespace-pre-line text-foreground">{client.instagram_bio}</p>
        ) : (
          <p className="mt-0.5 text-[13px] text-muted-foreground">Sem bio. Em “Editar perfil”, copie a bio do Instagram do cliente.</p>
        )}
      </div>
    </div>
  )
}

/** Edição do perfil: a foto salva na hora (a anterior sai do Storage); @ e bio, ao salvar. */
function ProfileForm({ client, onDone }: { client: Client; onDone: () => void }) {
  const ids = useId()
  const [handle, setHandle] = useState(client.instagram_handle ?? "")
  const [bio, setBio] = useState(client.instagram_bio ?? "")
  const [error, setError] = useState<string | null>(null)
  const [photoBusy, setPhotoBusy] = useState(false)
  const [isPending, startTransition] = useTransition()

  async function pickPhoto(file: File) {
    setPhotoBusy(true)
    try {
      const path = await uploadContentImage(client.id, file, "avatar")
      const result = await setClientAvatar(client.id, path)
      if (result.ok) toast.success("Foto atualizada", { description: client.name })
      else {
        void discardUploads([path])
        toast.error(result.error)
      }
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível enviar a foto.")
    } finally {
      setPhotoBusy(false)
    }
  }

  function removePhoto() {
    startTransition(async () => {
      const result = await setClientAvatar(client.id, null)
      if (!result.ok) toast.error(result.error)
    })
  }

  function save() {
    setError(null)
    startTransition(async () => {
      const result = await updateFeedProfile(client.id, { instagram_handle: handle, instagram_bio: bio })
      if (!result.ok) {
        setError(result.error)
        return
      }
      toast.success("Perfil salvo", { description: client.name })
      onDone()
    })
  }

  return (
    <form
      aria-label="Perfil do Instagram"
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        save()
      }}
    >
      <div className="flex items-center gap-4">
        <ProfilePhoto client={client} busy={photoBusy} />
        <div className="flex flex-wrap items-center gap-1.5">
          <ImagePick
            label={client.avatar_path ? "Trocar a foto do perfil" : "Enviar a foto do perfil"}
            disabled={photoBusy || isPending}
            onPick={(file) => void pickPhoto(file)}
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 px-2.5 text-xs shadow-none")}
          >
            <ImagePlus className="size-3.5" aria-hidden="true" />
            {client.avatar_path ? "Trocar foto" : "Enviar foto"}
          </ImagePick>
          {client.avatar_path ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={removePhoto}
              disabled={photoBusy || isPending}
              className="h-7 px-2 text-xs text-muted-foreground"
            >
              Tirar foto
            </Button>
          ) : null}
        </div>
      </div>
      <div className="space-y-1.5">
        <label htmlFor={`${ids}-handle`} className="block text-xs font-medium text-muted-foreground">
          @ do Instagram
        </label>
        <div className="relative">
          <span aria-hidden="true" className="pointer-events-none absolute inset-y-0 left-3 flex items-center text-sm text-muted-foreground">
            @
          </span>
          <Input
            id={`${ids}-handle`}
            value={handle}
            onChange={(event) => setHandle(event.target.value.replace(/^@+/, "").replace(/\s/g, ""))}
            maxLength={HANDLE_MAX}
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            placeholder="perfildocliente"
            className="h-9 pl-7"
          />
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="flex items-baseline justify-between">
          <label htmlFor={`${ids}-bio`} className="block text-xs font-medium text-muted-foreground">
            Bio
          </label>
          <span className="text-[11px] text-subtle-foreground tabular-nums">
            {bio.length}/{BIO_MAX}
          </span>
        </div>
        <Textarea
          id={`${ids}-bio`}
          value={bio}
          onChange={(event) => setBio(event.target.value)}
          maxLength={BIO_MAX}
          placeholder="A bio como está no Instagram"
          className="min-h-20 text-[13px] shadow-none"
        />
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button type="submit" size="sm" disabled={isPending || photoBusy}>
          {isPending ? "Salvando…" : "Salvar perfil"}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onDone} disabled={isPending}>
          Cancelar
        </Button>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : null}
      </div>
    </form>
  )
}
