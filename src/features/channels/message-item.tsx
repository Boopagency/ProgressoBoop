"use client"

import { Check, ListPlus, MoreHorizontal, Pencil, RotateCcw, Trash2 } from "lucide-react"
import Link from "next/link"
import { Fragment, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

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
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  createTaskFromMessage,
  deleteMessage,
  editMessage,
  setMessageKind,
  setMessageResolved,
} from "@/features/channels/actions"
import { BODY_MAX, isPending, messageTime, taskTitleFrom, type MessagePost, type ThreadMessage } from "@/features/channels/logic"
import { ContentImage } from "@/features/content/content-image"
import { FormatIcon, StageDot } from "@/features/content/post-meta"
import { AssigneePicker } from "@/features/tasks/assignee-picker"
import { DueDatePicker } from "@/features/tasks/due-date-picker"
import { firstName } from "@/features/tasks/logic"
import { StatusDot } from "@/features/tasks/task-meta"
import { useTasks } from "@/features/tasks/tasks-provider"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate, toDateKey, toTimeLabel } from "@/lib/dates"
import { CONTENT_STAGE_LABEL, MESSAGE_KIND_LABEL } from "@/lib/labels"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g

/** Texto da mensagem com os links clicáveis. */
function MessageText({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN)
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a key={index} href={part} target="_blank" rel="noreferrer" className="break-all text-brand-ink underline underline-offset-2">
            {part}
          </a>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  )
}

/** Quem escreveu: alguém da equipe, o cliente (fase 3) ou uma conta que saiu. */
export function useAuthor(authorId: string | null) {
  const { profiles, profileById } = useWorkspace()
  const profile = authorId ? profileById.get(authorId) : undefined
  return {
    name: profile ? firstName(profile.full_name) : authorId ? "Cliente" : "Conta removida",
    profile,
    colorIndex: profile ? profiles.indexOf(profile) : -1,
  }
}

export function MessageAvatar({ authorId, className }: { authorId: string | null; className?: string }) {
  const author = useAuthor(authorId)
  return (
    <PersonAvatar
      name={author.profile?.full_name ?? author.name}
      avatarUrl={author.profile?.avatar_url}
      colorIndex={author.colorIndex}
      className={cn("size-8", className)}
    />
  )
}

/** Cartão do post de que a mensagem fala: capa, título, etapa e data. */
export function PostCard({ post, today, onOpen }: { post: MessagePost; today: DateKey; onOpen?: (postId: string) => void }) {
  const content = (
    <>
      <span className="relative flex h-12 w-9 shrink-0 items-center justify-center overflow-hidden rounded bg-muted">
        {post.cover_path ? (
          <ContentImage path={post.cover_path} fallback={<FormatIcon format={post.format} className="text-muted-foreground" />} />
        ) : (
          <FormatIcon format={post.format} className="text-muted-foreground" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-foreground">{post.title}</span>
        <span className="mt-0.5 flex items-center gap-1.5 text-xs text-muted-foreground">
          <StageDot stage={post.stage} />
          {CONTENT_STAGE_LABEL[post.stage]}
          {post.publish_on ? <span className="tabular-nums">· {formatShortDate(post.publish_on, today)}</span> : null}
        </span>
      </span>
    </>
  )
  const className = "mt-1.5 flex w-full max-w-xs items-center gap-2.5 rounded-lg border bg-background p-1.5 pr-3 text-left transition-colors hover:bg-muted/50"
  return onOpen ? (
    <button type="button" onClick={() => onOpen(post.id)} className={className} aria-label={`Abrir o post ${post.title}`}>
      {content}
    </button>
  ) : (
    <Link href={`/conteudo?post=${post.id}`} className={className}>
      {content}
    </Link>
  )
}

/** Pedido de ajuste: pendente (laranja) ou resolvido (verde, por quem e quando). */
export function RequestStatus({ message, className }: { message: ThreadMessage; className?: string }) {
  const resolver = useAuthor(message.resolved_by)
  if (message.kind !== "change_request") return null
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5 text-xs", className)}>
      <span className="inline-flex h-5 items-center rounded-full border border-amber-600/15 bg-amber-50 px-2 text-[11px] font-medium text-amber-800">
        {MESSAGE_KIND_LABEL.change_request}
      </span>
      {message.resolved_at ? (
        <span className="inline-flex items-center gap-1 text-success-ink">
          <Check className="size-3" aria-hidden="true" />
          Resolvido{message.resolved_by ? ` por ${resolver.name}` : ""} · {formatShortDate(toDateKey(message.resolved_at))}
        </span>
      ) : (
        <span className="font-medium text-warning-ink">Pendente</span>
      )}
    </span>
  )
}

function TaskLink({ taskId }: { taskId: string }) {
  const { tasks, openTask } = useTasks()
  const task = tasks.find((candidate) => candidate.id === taskId)
  if (!task) {
    return (
      <Link href={`/tarefas?tarefa=${taskId}`} className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground hover:underline">
        Ver a tarefa
      </Link>
    )
  }
  return (
    <button
      type="button"
      onClick={() => openTask(task.id)}
      className="inline-flex max-w-full items-center gap-1.5 rounded-md border bg-background px-2 py-0.5 text-xs text-foreground transition-colors hover:bg-muted"
    >
      <StatusDot status={task.status} />
      <span className={cn("truncate", task.status === "done" && "text-muted-foreground line-through")}>{task.title}</span>
    </button>
  )
}

/**
 * Uma mensagem do fio: quem, quando, o texto, o tipo (pedido de ajuste ou
 * aprovação), o post, a tarefa e as ações (virar tarefa, resolver, marcar
 * como pedido, editar e apagar as próprias).
 */
export function MessageItem({
  message,
  continued = false,
  showPost = true,
  canWrite = true,
  onChanged,
  onRemoved,
  onOpenPost,
  extra,
}: {
  message: ThreadMessage
  /** Mensagem seguida da mesma pessoa: sem nome nem foto. */
  continued?: boolean
  showPost?: boolean
  /** Canal arquivado: só leitura das ações que mudam o texto. */
  canWrite?: boolean
  onChanged: () => void
  onRemoved: (id: string) => void
  onOpenPost?: (postId: string) => void
  /** Linha extra no rodapé (ex.: o canal, na lista de pendentes). */
  extra?: ReactNode
}) {
  const { currentUser } = useWorkspace()
  const { today } = useTasks()
  const author = useAuthor(message.author_id)
  const mine = message.author_id === currentUser.id
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(message.body)
  const [taskOpen, setTaskOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [saving, startTransition] = useTransition()
  const system = message.kind === "system"

  function run(action: () => Promise<{ ok: boolean; error?: string }>, success?: string) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) {
        toast.error(result.error ?? "Não foi possível salvar.")
        return
      }
      if (success) toast.success(success)
      onChanged()
    })
  }

  function saveEdit() {
    const body = draft.trim()
    if (!body || body === message.body) {
      setEditing(false)
      return
    }
    startTransition(async () => {
      const result = await editMessage(message.id, body)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setEditing(false)
      onChanged()
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteMessage(message.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onRemoved(message.id)
      onChanged()
    })
  }

  const pending = isPending(message)

  return (
    <li
      className={cn(
        "group/message relative flex gap-2.5 px-4 py-1 transition-colors hover:bg-muted/40",
        !continued && "mt-2 pt-1.5",
        pending && "bg-amber-50/40"
      )}
      aria-label={`${author.name}, ${messageTime(message)}`}
    >
      <div className="w-8 shrink-0">
        {continued ? (
          <span className="invisible block pt-0.5 text-right text-[10px] text-muted-foreground tabular-nums group-hover/message:visible">
            {messageTime(message)}
          </span>
        ) : (
          <MessageAvatar authorId={message.author_id} />
        )}
      </div>
      <div className="min-w-0 flex-1">
        {continued ? null : (
          <p className="flex items-baseline gap-2">
            <span className="text-[13px] font-semibold text-foreground">{system ? "Aviso" : author.name}</span>
            <time dateTime={message.created_at} className="text-[11px] text-muted-foreground tabular-nums">
              {toTimeLabel(message.created_at)}
            </time>
          </p>
        )}

        {editing ? (
          <div className="mt-1 space-y-1.5">
            <textarea
              autoFocus
              value={draft}
              maxLength={BODY_MAX}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault()
                  saveEdit()
                }
                if (event.key === "Escape") {
                  event.preventDefault()
                  setDraft(message.body)
                  setEditing(false)
                }
              }}
              aria-label="Editar mensagem"
              className="field-sizing-content max-h-60 min-h-16 w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-[14px] leading-6 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
            />
            <div className="flex gap-1.5 text-xs text-muted-foreground">
              <Button type="button" size="sm" className="h-7" disabled={saving} onClick={saveEdit}>
                Salvar
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setEditing(false)}>
                Cancelar
              </Button>
              <span className="self-center">Enter salva · Esc cancela</span>
            </div>
          </div>
        ) : (
          <p className={cn("text-[14px] leading-6 break-words whitespace-pre-wrap text-foreground", system && "text-muted-foreground italic")}>
            <MessageText text={message.body} />
            {message.edited_at ? <span className="ml-1 text-[11px] text-muted-foreground">(editada)</span> : null}
          </p>
        )}

        {message.kind === "change_request" || message.kind === "approval" || message.task_id || extra ? (
          <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1">
            <RequestStatus message={message} />
            {message.kind === "approval" ? (
              <span className="inline-flex h-5 items-center rounded-full border border-success/20 bg-success/10 px-2 text-[11px] font-medium text-success">
                {MESSAGE_KIND_LABEL.approval}
              </span>
            ) : null}
            {message.task_id ? <TaskLink taskId={message.task_id} /> : null}
            {extra}
          </div>
        ) : null}

        {showPost && message.post ? <PostCard post={message.post} today={today} onOpen={onOpenPost} /> : null}

        {taskOpen ? (
          <MessageTaskForm
            message={message}
            onDone={(created) => {
              setTaskOpen(false)
              if (created) onChanged()
            }}
          />
        ) : null}
      </div>

      {system || editing ? null : (
        <div
          className={cn(
            "absolute top-0 right-3 flex -translate-y-1/2 items-center gap-0.5 rounded-md border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100",
            "max-md:static max-md:ml-1 max-md:translate-y-0 max-md:self-start max-md:border-0 max-md:p-0 max-md:opacity-100 max-md:shadow-none"
          )}
        >
          {pending ? (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              disabled={saving}
              onClick={() => run(() => setMessageResolved(message.id, true), "Pedido resolvido")}
              className="h-7 gap-1 px-2 text-xs max-md:hidden"
            >
              <Check className="size-3.5" />
              Resolver
            </Button>
          ) : null}
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button type="button" variant="ghost" size="icon-sm" aria-label="Ações da mensagem" className="size-7 text-muted-foreground">
                <MoreHorizontal />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56">
              {message.task_id ? null : (
                <DropdownMenuItem onSelect={() => setTaskOpen(true)}>
                  <ListPlus />
                  Virar tarefa
                </DropdownMenuItem>
              )}
              {message.kind === "change_request" ? (
                message.resolved_at ? (
                  <DropdownMenuItem onSelect={() => run(() => setMessageResolved(message.id, false), "Pedido reaberto")}>
                    <RotateCcw />
                    Reabrir o pedido
                  </DropdownMenuItem>
                ) : (
                  <DropdownMenuItem onSelect={() => run(() => setMessageResolved(message.id, true), "Pedido resolvido")}>
                    <Check />
                    Marcar como resolvido
                  </DropdownMenuItem>
                )
              ) : null}
              {message.kind === "text" ? (
                <DropdownMenuItem onSelect={() => run(() => setMessageKind(message.id, "change_request"))}>
                  Marcar como pedido de ajuste
                </DropdownMenuItem>
              ) : message.kind === "change_request" ? (
                <DropdownMenuItem onSelect={() => run(() => setMessageKind(message.id, "text"))}>
                  Não é pedido de ajuste
                </DropdownMenuItem>
              ) : null}
              {mine && canWrite ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem
                    onSelect={() => {
                      setDraft(message.body)
                      setEditing(true)
                    }}
                  >
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
                    <Trash2 />
                    Apagar
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      )}

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Apagar esta mensagem?</AlertDialogTitle>
            <AlertDialogDescription>
              Ela sai do canal para todo mundo. {message.task_id ? "A tarefa criada a partir dela continua." : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction variant="destructive" onClick={remove}>
              Apagar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </li>
  )
}

/** "Virar tarefa": título (a primeira linha), responsáveis e prazo. */
function MessageTaskForm({ message, onDone }: { message: ThreadMessage; onDone: (created: boolean) => void }) {
  const { currentUser } = useWorkspace()
  const { today } = useTasks()
  const [title, setTitle] = useState(() => taskTitleFrom(message.body))
  const [assignees, setAssignees] = useState<string[]>([currentUser.id])
  const [due, setDue] = useState<DateKey | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    startTransition(async () => {
      const result = await createTaskFromMessage(message.id, { title, assignee_ids: assignees, due_date: due })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Tarefa criada", { description: title.trim() })
      onDone(true)
    })
  }

  return (
    <div className="mt-2 max-w-xl space-y-2 rounded-lg border bg-muted/30 p-2.5">
      <p className="text-xs font-medium text-muted-foreground">Virar tarefa</p>
      <input
        autoFocus
        value={title}
        onChange={(event) => setTitle(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            if (title.trim()) submit()
          }
          if (event.key === "Escape") onDone(false)
        }}
        maxLength={200}
        aria-label="Título da tarefa"
        className="h-8 w-full rounded-md border border-input bg-background px-2.5 text-[13px] outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
      />
      <div className="flex flex-wrap items-center gap-2">
        <AssigneePicker value={assignees} onChange={setAssignees} className="h-8 rounded-md border border-input bg-background px-2.5 text-[13px]" />
        <DueDatePicker value={due} onChange={setDue} today={today} className="h-8 rounded-md border border-input bg-background px-2.5 text-[13px]" />
        <div className="ml-auto flex gap-1.5">
          <Button type="button" variant="ghost" size="sm" className="h-8" onClick={() => onDone(false)}>
            Cancelar
          </Button>
          <Button type="button" size="sm" className="h-8" disabled={isPending || !title.trim() || assignees.length === 0} onClick={submit}>
            Criar tarefa
          </Button>
        </div>
      </div>
      {message.kind === "change_request" ? (
        <p className="text-xs text-muted-foreground">Quando a tarefa for concluída, o pedido fica resolvido.</p>
      ) : null}
    </div>
  )
}
