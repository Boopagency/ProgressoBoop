"use client"

import { ChevronDown, MoreHorizontal, Pencil, Trash2 } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Textarea } from "@/components/ui/textarea"
import { addComment, deleteComment, editComment } from "@/features/activity/actions"
import { describeActivity, groupFeed, relativeTime, type FeedItem } from "@/features/activity/logic"
import { firstName } from "@/features/tasks/logic"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { todayKey } from "@/lib/dates"
import type { ActivityEntry, DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

type CommentTarget = { type: "task" | "project" | "decision" | "deal"; id: string }

function currentTime(): number {
  return Date.now()
}

/**
 * Linha do tempo: o que mudou (gravado pelo banco) e comentários. Em linhas
 * que misturam itens (projeto, cliente), cada registro diz de qual item é.
 */
export function ActivityFeed({
  entries,
  target,
  withTitles = false,
  emptyText = "Nada registrado ainda.",
  onChanged,
  limit,
  className,
}: {
  entries: ActivityEntry[]
  /** Item que recebe comentários (sem ele, a linha do tempo é só leitura). */
  target?: CommentTarget
  withTitles?: boolean
  emptyText?: string
  /** Avisado depois de comentar, editar ou apagar (ex.: recarregar o painel). */
  onChanged?: () => void
  /** Mostra os N mais recentes, com "ver tudo". */
  limit?: number
  className?: string
}) {
  const [now] = useState(currentTime)
  const [today] = useState<DateKey>(() => todayKey())
  const [added, setAdded] = useState<ActivityEntry[]>([])
  const [removed, setRemoved] = useState<ReadonlySet<string>>(() => new Set())
  const [showAll, setShowAll] = useState(false)

  // Comentários recém-escritos aparecem na hora; quando o servidor devolve a
  // lista nova, a versão dele vale.
  const known = new Set(entries.map((entry) => entry.id))
  const merged = [...added.filter((entry) => !known.has(entry.id)), ...entries]
    .filter((entry) => !removed.has(entry.id))
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
  const items = groupFeed(merged)
  const visible = limit && !showAll ? items.slice(0, limit) : items

  return (
    <div className={className}>
      {target ? (
        <CommentComposer
          target={target}
          onAdded={(entry) => {
            setAdded((current) => [entry, ...current])
            onChanged?.()
          }}
        />
      ) : null}
      {items.length === 0 ? (
        <p className={cn("text-[13px] text-muted-foreground", target && "mt-4")}>{emptyText}</p>
      ) : (
        <ol className={cn("space-y-3", target && "mt-4")}>
          {visible.map((item) => (
            <FeedRow
              key={item.kind === "entry" ? item.entry.id : item.key}
              item={item}
              withTitles={withTitles}
              now={now}
              today={today}
              onRemoved={(id) => {
                setRemoved((current) => new Set(current).add(id))
                onChanged?.()
              }}
              onEdited={() => onChanged?.()}
            />
          ))}
        </ol>
      )}
      {limit && items.length > limit ? (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowAll((current) => !current)}
          className="mt-2 h-7 gap-1 px-2 text-xs text-muted-foreground"
        >
          {showAll ? "Mostrar menos" : `Ver tudo (${items.length})`}
          <ChevronDown className={cn("size-3.5 transition-transform", showAll && "rotate-180")} />
        </Button>
      ) : null}
    </div>
  )
}

function Actor({ id, size = "sm" }: { id: string | null; size?: "sm" | "xs" }) {
  const { profiles } = useWorkspace()
  const index = profiles.findIndex((profile) => profile.id === id)
  const profile = index >= 0 ? profiles[index] : undefined
  if (!profile) {
    return <span aria-hidden="true" className="mt-1.5 block size-2 shrink-0 rounded-full bg-muted-foreground/30" />
  }
  return (
    <PersonAvatar
      name={profile.full_name}
      avatarUrl={profile.avatar_url}
      colorIndex={index}
      size="sm"
      className={cn(
        "shrink-0 [&_[data-slot=avatar-fallback]]:text-[9px]",
        size === "xs" ? "size-5" : "size-6"
      )}
    />
  )
}

function FeedRow({
  item,
  withTitles,
  now,
  today,
  onRemoved,
  onEdited,
}: {
  item: FeedItem
  withTitles: boolean
  now: number
  today: DateKey
  onRemoved: (id: string) => void
  onEdited: () => void
}) {
  const { profileById, clientById, projectById } = useWorkspace()
  const names = { profileById, clientById, projectById, today }
  const [open, setOpen] = useState(false)

  if (item.kind === "batch") {
    const actor = item.actorId ? profileById.get(item.actorId) : undefined
    return (
      <li className="flex gap-2.5">
        <Actor id={item.actorId} size="xs" />
        <div className="min-w-0 flex-1 text-[13px] leading-5">
          <p className="text-muted-foreground">
            <span className="font-medium text-foreground">{actor ? firstName(actor.full_name) : "O sistema"}</span>{" "}
            criou {item.entries.length} tarefas ·{" "}
            <span className="text-xs text-subtle-foreground">{relativeTime(item.at, now, today)}</span>
          </p>
          <button
            type="button"
            aria-expanded={open}
            onClick={() => setOpen((current) => !current)}
            className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
          >
            {open ? "Esconder" : "Ver quais"}
            <ChevronDown className={cn("size-3 transition-transform", open && "rotate-180")} />
          </button>
          {open ? (
            <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs text-muted-foreground">
              {item.entries.map((entry) => (
                <li key={entry.id}>{entry.entity_title}</li>
              ))}
            </ul>
          ) : null}
        </div>
      </li>
    )
  }

  const { entry } = item
  const actor = entry.actor_id ? profileById.get(entry.actor_id) : undefined
  const who = actor ? firstName(actor.full_name) : "O sistema"
  if (entry.action === "comment") {
    return <CommentRow entry={entry} who={who} withTitles={withTitles} now={now} today={today} onRemoved={onRemoved} onEdited={onEdited} />
  }
  return (
    <li className="flex gap-2.5">
      <Actor id={entry.actor_id} size="xs" />
      <p className="min-w-0 flex-1 text-[13px] leading-5 text-muted-foreground">
        <span className="font-medium text-foreground">{who}</span> {describeActivity(entry, names, withTitles)} ·{" "}
        <span className="text-xs whitespace-nowrap text-subtle-foreground">{relativeTime(entry.created_at, now, today)}</span>
      </p>
    </li>
  )
}

function CommentRow({
  entry,
  who,
  withTitles,
  now,
  today,
  onRemoved,
  onEdited,
}: {
  entry: ActivityEntry
  who: string
  withTitles: boolean
  now: number
  today: DateKey
  onRemoved: (id: string) => void
  onEdited: () => void
}) {
  const { currentUser } = useWorkspace()
  const [editing, setEditing] = useState(false)
  const [body, setBody] = useState(entry.body ?? "")
  const [shown, setShown] = useState(entry.body ?? "")
  const [isPending, startTransition] = useTransition()
  const mine = entry.actor_id === currentUser.id

  function save() {
    const next = body.trim()
    if (!next || next === shown) {
      setEditing(false)
      setBody(shown)
      return
    }
    startTransition(async () => {
      const result = await editComment(entry.id, next)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setShown(next)
      setEditing(false)
      onEdited()
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteComment(entry.id)
      if (!result.ok) toast.error(result.error)
      else onRemoved(entry.id)
    })
  }

  return (
    <li className="flex gap-2.5">
      <Actor id={entry.actor_id} />
      <div className="min-w-0 flex-1 rounded-lg border bg-card px-3 py-2">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{who}</span>
          {withTitles ? <span className="truncate">em “{entry.entity_title}”</span> : null}
          <span className="whitespace-nowrap text-subtle-foreground">
            {relativeTime(entry.created_at, now, today)}
            {entry.edited_at ? " · editado" : ""}
          </span>
          {mine && !editing ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label="Opções do comentário"
                  disabled={isPending}
                  className="ml-auto inline-flex size-6 items-center justify-center rounded-md text-subtle-foreground outline-none hover:bg-accent hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
                >
                  <MoreHorizontal className="size-3.5" />
                </button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onSelect={() => setEditing(true)}>
                  <Pencil />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem variant="destructive" onSelect={remove}>
                  <Trash2 />
                  Apagar
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : null}
        </div>
        {editing ? (
          <div className="mt-1.5">
            <Textarea
              autoFocus
              value={body}
              maxLength={5000}
              onChange={(event) => setBody(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
                  event.preventDefault()
                  save()
                }
                if (event.key === "Escape") {
                  setEditing(false)
                  setBody(shown)
                }
              }}
              aria-label="Editar comentário"
              className="min-h-16 resize-none text-[13px] shadow-none"
            />
            <div className="mt-1.5 flex justify-end gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7"
                onClick={() => {
                  setEditing(false)
                  setBody(shown)
                }}
              >
                Cancelar
              </Button>
              <Button type="button" size="sm" className="h-7" disabled={isPending} onClick={save}>
                Salvar
              </Button>
            </div>
          </div>
        ) : (
          <p className="mt-1 text-[13px] leading-5 break-words whitespace-pre-line text-foreground">{shown}</p>
        )}
      </div>
    </li>
  )
}

function CommentComposer({ target, onAdded }: { target: CommentTarget; onAdded: (entry: ActivityEntry) => void }) {
  const [body, setBody] = useState("")
  const [isPending, startTransition] = useTransition()

  function submit() {
    const text = body.trim()
    if (!text || isPending) return
    startTransition(async () => {
      const result = await addComment(target.type, target.id, text)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setBody("")
      onAdded(result.data)
    })
  }

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
      className="rounded-lg border bg-background focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/20"
    >
      <Textarea
        value={body}
        maxLength={5000}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
            event.preventDefault()
            submit()
          }
        }}
        placeholder="Escreva um comentário… (Ctrl + Enter envia)"
        aria-label="Comentário"
        className="min-h-16 resize-none border-0 text-[13px] shadow-none focus-visible:ring-0"
      />
      <div className="flex justify-end px-2 pb-2">
        <Button type="submit" size="sm" className="h-7" disabled={isPending || !body.trim()}>
          {isPending ? "Enviando…" : "Comentar"}
        </Button>
      </div>
    </form>
  )
}
