"use client"

import {
  Check,
  CheckCheck,
  Copy,
  Eye,
  FolderKanban,
  ListPlus,
  Lock,
  MessageSquare,
  MessageSquareWarning,
  MoreHorizontal,
  Pencil,
  RotateCcw,
  Trash2,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { Fragment, useMemo, useState, useTransition, type ReactNode } from "react"
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
import { MoreSheet, MoreSheetSection, MoreSheetItem } from "@/components/layout/more-sheet"
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
  setMessageInternal,
  setMessageKind,
  setMessageResolved,
} from "@/features/channels/actions"
import {
  BODY_MAX,
  isPending,
  messageTime,
  readersByMessage,
  seenByMessage,
  taskTitleFrom,
  type ChannelRead,
  type MessagePost,
  type MessageProject,
  type ThreadMessage,
} from "@/features/channels/logic"
import { ContentImage } from "@/features/content/content-image"
import { applyMentions, mentionPlainText, mentionsForEditing } from "@/features/mentions/logic"
import { MentionText } from "@/features/mentions/mention-text"
import { FormatIcon, StageDot } from "@/features/content/post-meta"
import { AssigneePicker } from "@/features/tasks/assignee-picker"
import { DueDatePicker } from "@/features/tasks/due-date-picker"
import { firstName } from "@/features/tasks/logic"
import { StatusDot } from "@/features/tasks/task-meta"
import { useTasks } from "@/features/tasks/tasks-provider"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { useLongPress } from "@/hooks/use-long-press"
import { formatShortDate, toDateKey, toTimeLabel } from "@/lib/dates"
import { CONTENT_STAGE_LABEL, MESSAGE_KIND_LABEL } from "@/lib/labels"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Quem escreveu: alguém da equipe, uma pessoa do cliente (pelo portal, com o
 * nome e a foto de Minha conta) ou uma conta que saiu.
 */
export function useAuthor(authorId: string | null) {
  const { profiles, profileById, clientPersonById } = useWorkspace()
  const profile = authorId ? profileById.get(authorId) : undefined
  const person = authorId && !profile ? clientPersonById.get(authorId) : undefined
  const fullName = profile?.full_name ?? person?.full_name ?? null
  return {
    name: fullName ? firstName(fullName) : authorId ? "Cliente" : "Conta removida",
    fullName,
    avatarUrl: profile?.avatar_url ?? person?.avatar_url ?? null,
    profile,
    colorIndex: profile ? profiles.indexOf(profile) : -1,
  }
}

export function MessageAvatar({ authorId, className }: { authorId: string | null; className?: string }) {
  const author = useAuthor(authorId)
  return (
    <PersonAvatar
      name={author.fullName ?? author.name}
      avatarUrl={author.avatarUrl}
      colorIndex={author.colorIndex}
      className={cn("size-8", className)}
    />
  )
}

/**
 * Quem viu o quê num fio: o "Visto por" (em qual mensagem aparece cada
 * pessoa, ver `seenByMessage`) e, por mensagem, todo mundo que já a viu (os
 * tiques no celular, ver `readersByMessage`).
 */
export function useReadReceipts(messages: readonly ThreadMessage[] | null, reads: readonly ChannelRead[]) {
  const { currentUser, profileById, clientPersonById } = useWorkspace()
  return useMemo(() => {
    // Só quem a tela conhece (equipe e pessoas do cliente).
    const known = reads.filter((read) => profileById.has(read.user_id) || clientPersonById.has(read.user_id))
    const isClient = (userId: string) => !profileById.has(userId)
    return {
      seenBy: seenByMessage(messages ?? [], known, currentUser.id, isClient),
      readers: readersByMessage(messages ?? [], known, currentUser.id, isClient),
    }
  }, [messages, reads, currentUser.id, profileById, clientPersonById])
}

function SeenName({ id }: { id: string }) {
  return <>{useAuthor(id).name}</>
}

/** Fotos pequenas e os nomes de quem já viu até a mensagem. */
function SeenBy({ ids, className }: { ids: readonly string[]; className?: string }) {
  return (
    <p className={cn("mt-1 flex items-center gap-1.5 text-[11px] text-muted-foreground", className)}>
      <span className="flex -space-x-1" aria-hidden="true">
        {ids.slice(0, 5).map((id) => (
          <MessageAvatar key={id} authorId={id} className="size-4 ring-1 ring-background [&_[data-slot=avatar-fallback]]:text-[8px]" />
        ))}
      </span>
      <span>
        Visto por{" "}
        {ids.map((id, index) => (
          <Fragment key={id}>
            {index > 0 ? (index === ids.length - 1 ? " e " : ", ") : null}
            <SeenName id={id} />
          </Fragment>
        ))}
      </span>
    </p>
  )
}

/**
 * Dentro do balão, no canto de baixo (só no celular): a hora e, nas próprias
 * mensagens, os tiques: um quando foi enviada, dois na cor da marca quando
 * alguém já viu (o "Visto por" com os nomes fica na folha de ações).
 */
function BubbleMeta({ message, own, seen }: { message: ThreadMessage; own: boolean; seen: boolean }) {
  return (
    <span className="float-right mt-[7px] -mb-1 ml-2.5 flex items-center gap-0.5 text-[11px] leading-4 text-muted-foreground tabular-nums md:hidden">
      <time dateTime={message.created_at}>
        {toTimeLabel(message.created_at)}
      </time>
      {own ? (
        seen ? (
          <CheckCheck className="size-3.5 text-brand-ink" aria-label="Vista" />
        ) : (
          <Check className="size-3.5" aria-label="Enviada" />
        )
      ) : null}
    </span>
  )
}

/** Uma ação da mensagem: no menu "…" do computador e na folha do celular. */
interface MessageAction {
  key: string
  label: string
  icon?: LucideIcon
  /** Ícone só na folha do celular (no menu do computador, a linha não tem). */
  sheetIcon?: LucideIcon
  onSelect: () => void
  destructive?: boolean
  /** Linha separada das de cima. */
  separated?: boolean
  /** Só na folha do celular. */
  sheetOnly?: boolean
}

/** Folha de baixo com as ações da mensagem (segurar a mensagem, no celular). */
function MessageActionsSheet({
  open,
  onOpenChange,
  message,
  own,
  readers,
  actions,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  message: ThreadMessage
  own: boolean
  readers: readonly string[]
  actions: MessageAction[]
}) {
  const author = useAuthor(message.author_id)
  // A separação do menu do computador vira dois grupos na folha.
  const cut = actions.findIndex((action) => action.separated)
  const main = cut < 0 ? actions : actions.slice(0, cut)
  const rest = cut < 0 ? [] : actions.slice(cut)
  return (
    <MoreSheet open={open} onOpenChange={onOpenChange} title="Mensagem" description="O que fazer com esta mensagem.">
      <div className="rounded-xl bg-muted/60 px-3 py-2.5">
        <p className="text-xs text-muted-foreground">
          <span className="font-medium text-foreground">{own ? "Você" : author.name}</span> · {messageTime(message)}
        </p>
        <p className="mt-0.5 line-clamp-4 text-[14px] leading-5 break-words whitespace-pre-wrap text-foreground">{mentionPlainText(message.body)}</p>
        {readers.length > 0 ? (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            <CheckCheck className="size-3.5 shrink-0 text-brand-ink" aria-hidden="true" />
            <span>
              Visto por{" "}
              {readers.map((id, index) => (
                <Fragment key={id}>
                  {index > 0 ? (index === readers.length - 1 ? " e " : ", ") : null}
                  <SeenName id={id} />
                </Fragment>
              ))}
            </span>
          </p>
        ) : own ? (
          <p className="mt-1.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Check className="size-3.5 shrink-0" aria-hidden="true" />
            Ninguém viu ainda
          </p>
        ) : null}
      </div>
      {main.length > 0 ? (
        <MoreSheetSection>
          {main.map((action) => (
            <MoreSheetItem
              key={action.key}
              title={action.label}
              icon={action.icon ?? action.sheetIcon}
              destructive={action.destructive}
              onClick={action.onSelect}
            />
          ))}
        </MoreSheetSection>
      ) : null}
      {rest.length > 0 ? (
        <MoreSheetSection>
          {rest.map((action) => (
            <MoreSheetItem
              key={action.key}
              title={action.label}
              icon={action.icon ?? action.sheetIcon}
              destructive={action.destructive}
              onClick={action.onSelect}
            />
          ))}
        </MoreSheetSection>
      ) : null}
    </MoreSheet>
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

/** Projeto de que a mensagem fala (a conversa do projeto com o cliente). */
export function ProjectChip({ project }: { project: MessageProject }) {
  return (
    <Link
      href={`/projetos/${project.id}`}
      className="mt-1.5 inline-flex max-w-xs items-center gap-1.5 rounded-full border bg-background px-2.5 py-0.5 text-xs text-foreground transition-colors hover:bg-muted/50"
    >
      <FolderKanban className="size-3.5 shrink-0 text-muted-foreground" aria-hidden="true" />
      <span className="truncate">{project.name}</span>
    </Link>
  )
}

/** Pedido de ajuste: pendente (laranja) ou resolvido (verde, por quem e quando). */
export function RequestStatus({ message, className }: { message: ThreadMessage; className?: string }) {
  const resolver = useAuthor(message.resolved_by)
  if (message.kind !== "change_request") return null
  return (
    <span className={cn("inline-flex flex-wrap items-center gap-1.5 text-xs", className)}>
      <span className="inline-flex h-5 items-center rounded-full border border-attention-line/15 bg-attention-soft px-2 text-[11px] font-medium text-attention-ink">
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

/** Mensagem interna no canal do cliente: só a equipe vê. */
export function InternalBadge({ className }: { className?: string }) {
  return (
    <span
      title="Só a equipe vê: a mensagem não aparece no portal do cliente"
      className={cn(
        "inline-flex h-5 items-center gap-1 rounded-full border border-dashed border-foreground/25 bg-muted px-1.5 text-[11px] font-medium text-muted-foreground",
        className
      )}
    >
      <Lock className="size-3" aria-hidden="true" />
      Interno
    </span>
  )
}

/**
 * Uma mensagem do fio: quem, quando, o texto, o tipo (pedido de ajuste ou
 * aprovação), o post, a tarefa e as ações (virar tarefa, resolver, marcar
 * como pedido, editar e apagar as próprias e, no canal do cliente, deixar
 * interna ou mostrar ao cliente). No celular, como nos aplicativos de
 * conversa: todas em balões, com a hora (e os tiques) no canto e o "rabinho"
 * na primeira de cada sequência; segurar a mensagem abre as ações numa folha.
 */
export function MessageItem({
  message,
  continued = false,
  showPost = true,
  showProject = true,
  canWrite = true,
  allowInternal = false,
  oneToOne = false,
  onChanged,
  onRemoved,
  onOpenPost,
  extra,
  seenBy,
  readers,
}: {
  message: ThreadMessage
  /** Mensagem seguida da mesma pessoa: sem nome nem foto. */
  continued?: boolean
  /** Quem viu até esta mensagem (ids), para o "Visto por". */
  seenBy?: readonly string[]
  /** Todo mundo que já viu a mensagem (ids): os tiques e a folha do celular. */
  readers?: readonly string[]
  showPost?: boolean
  /** Etiqueta do projeto (some na própria conversa do projeto). */
  showProject?: boolean
  /** Canal arquivado: só leitura das ações que mudam o texto. */
  canWrite?: boolean
  /** Canal do cliente: quem escreveu pode deixar a mensagem interna (ou mostrar ao cliente). */
  allowInternal?: boolean
  /** Conversa a dois: no celular, sem a foto e o nome da outra pessoa em cada balão. */
  oneToOne?: boolean
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
  // Editando, as menções aparecem como "@Título" e voltam a ser marcas ao salvar.
  const editable = mentionsForEditing(message.body)
  const [draft, setDraft] = useState(editable.text)
  const [taskOpen, setTaskOpen] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [sheetOpen, setSheetOpen] = useState(false)
  const [saving, startTransition] = useTransition()
  const system = message.kind === "system"
  const longPress = useLongPress(() => setSheetOpen(true), !editing && !system)

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
    const body = applyMentions(draft.trim(), editable.picked)
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
  /** A própria mensagem: à direita, num balão, sem foto nem nome. */
  const own = mine && !system
  const seen = (readers?.length ?? 0) > 0

  const menuActions: MessageAction[] = []
  if (!message.task_id) menuActions.push({ key: "task", label: "Virar tarefa", icon: ListPlus, onSelect: () => setTaskOpen(true) })
  if (message.kind === "change_request") {
    menuActions.push(
      message.resolved_at
        ? {
            key: "resolve",
            label: "Reabrir o pedido",
            icon: RotateCcw,
            onSelect: () => run(() => setMessageResolved(message.id, false), "Pedido reaberto"),
          }
        : {
            key: "resolve",
            label: "Marcar como resolvido",
            icon: Check,
            onSelect: () => run(() => setMessageResolved(message.id, true), "Pedido resolvido"),
          }
    )
  }
  if (message.kind === "text") {
    menuActions.push({
      key: "kind",
      label: "Marcar como pedido de ajuste",
      sheetIcon: MessageSquareWarning,
      onSelect: () => run(() => setMessageKind(message.id, "change_request")),
    })
  } else if (message.kind === "change_request") {
    menuActions.push({
      key: "kind",
      label: "Não é pedido de ajuste",
      sheetIcon: MessageSquare,
      onSelect: () => run(() => setMessageKind(message.id, "text")),
    })
  }
  if (mine && canWrite && (allowInternal || message.internal)) {
    menuActions.push(
      message.internal
        ? {
            key: "internal",
            label: "Mostrar ao cliente",
            icon: Eye,
            onSelect: () => run(() => setMessageInternal(message.id, false), "O cliente passa a ver a mensagem"),
          }
        : {
            key: "internal",
            label: "Deixar interna",
            icon: Lock,
            onSelect: () => run(() => setMessageInternal(message.id, true), "Mensagem interna: o cliente não vê"),
          }
    )
  }
  if (mine && canWrite) {
    menuActions.push(
      {
        key: "edit",
        label: "Editar",
        icon: Pencil,
        separated: true,
        onSelect: () => {
          setDraft(editable.text)
          setEditing(true)
        },
      },
      { key: "delete", label: "Apagar", icon: Trash2, destructive: true, onSelect: () => setConfirmDelete(true) }
    )
  }

  // Na folha do celular: as mesmas ações e "Copiar texto" (segurar a mensagem não seleciona o texto).
  const copy: MessageAction = {
    key: "copy",
    label: "Copiar texto",
    icon: Copy,
    sheetOnly: true,
    onSelect: () =>
      void navigator.clipboard
        ?.writeText(mentionPlainText(message.body))
        .then(() => toast.success("Texto copiado"))
        .catch(() => toast.error("Não foi possível copiar.")),
  }
  const editAt = menuActions.findIndex((action) => action.separated)
  const sheetActions = (editAt < 0 ? [...menuActions, copy] : [...menuActions.slice(0, editAt), copy, ...menuActions.slice(editAt)]).map(
    (action) => ({
      ...action,
      // A folha fecha antes (uma confirmação ou a edição abrem depois dela).
      onSelect: () => {
        setSheetOpen(false)
        window.setTimeout(action.onSelect, 150)
      },
    })
  )

  /** Ações da mensagem: no alto, do lado oposto ao balão (no celular, segurar a mensagem). */
  const actions = editing ? null : (
    <div
      className={cn(
        "absolute top-0 flex -translate-y-1/2 items-center gap-0.5 rounded-md border bg-background p-0.5 opacity-0 shadow-sm transition-opacity group-hover/message:opacity-100 focus-within:opacity-100 has-[[data-state=open]]:opacity-100 max-md:hidden",
        own ? "left-3" : "right-3"
      )}
    >
      {pending ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={saving}
          onClick={() => run(() => setMessageResolved(message.id, true), "Pedido resolvido")}
          className="h-7 gap-1 px-2 text-xs"
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
          {menuActions.map((action) => (
            <Fragment key={action.key}>
              {action.separated ? <DropdownMenuSeparator /> : null}
              <DropdownMenuItem variant={action.destructive ? "destructive" : "default"} onSelect={action.onSelect}>
                {action.icon ? <action.icon /> : null}
                {action.label}
              </DropdownMenuItem>
            </Fragment>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )

  /** No celular, para quem não segura o dedo (leitor de tela): o mesmo que segurar a mensagem. */
  const sheetTrigger =
    editing || system ? null : (
      <button type="button" onClick={() => setSheetOpen(true)} className="sr-only md:hidden">
        Ações da mensagem
      </button>
    )

  const body = editing ? (
    <div className="mt-1 w-full space-y-1.5">
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
            setDraft(editable.text)
            setEditing(false)
          }
        }}
        aria-label="Editar mensagem"
        className="field-sizing-content max-h-60 min-h-16 w-full resize-none rounded-md border border-input bg-background px-2.5 py-1.5 text-[14px] leading-6 outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30"
      />
      <div className={cn("flex gap-1.5 text-xs text-muted-foreground", own && "flex-row-reverse")}>
        <Button type="button" size="sm" className="h-7" disabled={saving} onClick={saveEdit}>
          Salvar
        </Button>
        <Button type="button" variant="ghost" size="sm" className="h-7" onClick={() => setEditing(false)}>
          Cancelar
        </Button>
        <span className="self-center max-md:hidden">Enter salva · Esc cancela</span>
      </div>
    </div>
  ) : (
    <p
      className={cn(
        "text-[14px] leading-6 break-words whitespace-pre-wrap text-foreground max-md:flow-root max-md:text-[15px] max-md:leading-[1.4]",
        system && "text-muted-foreground italic"
      )}
    >
      <MentionText text={message.body} />
      {message.edited_at ? <span className="ml-1 text-[11px] text-muted-foreground">(editada)</span> : null}
      {system ? null : <BubbleMeta message={message} own={own} seen={seen} />}
    </p>
  )

  const details =
    message.kind === "change_request" || message.kind === "approval" || message.task_id || extra || (showPost && message.post) || (showProject && message.project) ? (
      <>
        {message.kind === "change_request" || message.kind === "approval" || message.task_id || extra ? (
          <div className={cn("mt-1 flex flex-wrap items-center gap-x-3 gap-y-1", own && "justify-end")}>
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
        {showProject && message.project ? <ProjectChip project={message.project} /> : null}
      </>
    ) : null

  const taskForm = taskOpen ? (
    <MessageTaskForm
      message={message}
      onDone={(created) => {
        setTaskOpen(false)
        if (created) onChanged()
      }}
    />
  ) : null

  if (system) {
    return (
      <li className="flex flex-col items-center px-4 py-1.5 text-center" aria-label={`Aviso, ${messageTime(message)}`}>
        <p className="max-w-[85%] text-[12px] leading-5 text-muted-foreground max-md:rounded-lg max-md:bg-card/80 max-md:px-2.5 max-md:py-1 max-md:shadow-xs">
          <span className="italic">{message.body}</span>
          <time dateTime={message.created_at} className="ml-1.5 text-[11px] tabular-nums">
            {toTimeLabel(message.created_at)}
          </time>
        </p>
        {details}
        {taskForm}
      </li>
    )
  }

  /** O balão do celular (do `md` para cima, `contents`: some do layout e nada muda). */
  const bubble = cn(
    "md:contents",
    !editing &&
      "max-md:relative max-md:rounded-2xl max-md:px-2.5 max-md:pt-1 max-md:pb-1.5 max-md:shadow-[0_1px_0.5px_rgb(0_0_0/0.12)]",
    // O "rabinho": na primeira mensagem de cada sequência, no canto de cima, para o lado de quem escreveu.
    !editing &&
      !continued &&
      "max-md:before:absolute max-md:before:top-0 max-md:before:h-2.5 max-md:before:w-2 max-md:before:bg-inherit",
    !editing && !continued && own && "max-md:rounded-tr-none max-md:before:-right-2 max-md:before:[clip-path:polygon(0_0,100%_0,0_100%)]",
    !editing && !continued && !own && "max-md:rounded-tl-none max-md:before:-left-2 max-md:before:[clip-path:polygon(0_0,100%_0,100%_100%)]"
  )

  return (
    <li
      {...longPress}
      className={cn(
        "group/message relative flex gap-2.5 px-4 py-1 transition-colors hover:bg-muted/40",
        own && "justify-end",
        !continued && "mt-2 pt-1.5",
        pending && "bg-attention-soft/40",
        message.internal && !pending && "bg-muted/30",
        // Celular: o fundo vai para o balão; segurar não seleciona o texto (a folha tem "Copiar texto").
        "max-md:gap-1.5 max-md:bg-transparent max-md:px-3 max-md:py-0.5 max-md:select-none max-md:[-webkit-touch-callout:none]",
        !continued && "max-md:mt-1.5 max-md:pt-0.5"
      )}
      aria-label={`${own ? "Você" : author.name}, ${messageTime(message)}`}
    >
      {own ? (
        continued ? (
          <span className="invisible shrink-0 self-center text-[10px] text-muted-foreground tabular-nums group-hover/message:visible max-md:hidden">
            {messageTime(message)}
          </span>
        ) : null
      ) : (
        <div className={cn("w-8 shrink-0 max-md:w-7", oneToOne && "max-md:hidden")}>
          {continued ? (
            <span className="invisible block pt-0.5 text-right text-[10px] text-muted-foreground tabular-nums group-hover/message:visible max-md:hidden">
              {messageTime(message)}
            </span>
          ) : (
            <MessageAvatar authorId={message.author_id} className="max-md:size-7" />
          )}
        </div>
      )}

      {own ? actions : null}

      {own ? (
        <div className={cn("flex min-w-0 max-w-[85%] flex-col items-end md:max-w-[75%]", (editing || taskOpen) && "w-full")}>
          {continued ? null : (
            <p className={cn("mb-0.5 flex items-center gap-2", !message.internal && "max-md:hidden")}>
              {message.internal ? <InternalBadge /> : null}
              <time dateTime={message.created_at} className="text-[11px] text-muted-foreground tabular-nums max-md:hidden">
                {toTimeLabel(message.created_at)}
              </time>
            </p>
          )}
          {continued && message.internal ? <InternalBadge className="mb-0.5" /> : null}
          <div
            className={cn(
              bubble,
              !editing &&
                (pending
                  ? "max-md:bg-attention-soft"
                  : message.internal
                    ? "max-md:border max-md:border-dashed max-md:border-foreground/20 max-md:bg-muted"
                    : "max-md:bg-brand-soft")
            )}
          >
            {editing ? (
              body
            ) : (
              <div
                className={cn(
                  "max-w-full md:rounded-2xl md:rounded-tr-md md:px-3 md:py-1.5",
                  message.internal ? "md:border md:border-dashed md:border-foreground/20 md:bg-muted" : "md:bg-brand-soft"
                )}
              >
                {body}
              </div>
            )}
            {details}
          </div>
          {taskForm}
          {seenBy && seenBy.length > 0 ? <SeenBy ids={seenBy} className="justify-end max-md:hidden" /> : null}
        </div>
      ) : (
        <div className="min-w-0 flex-1">
          <div
            className={cn(
              bubble,
              "max-md:w-fit max-md:max-w-[85%]",
              pending ? "max-md:bg-attention-soft" : message.internal ? "max-md:border max-md:border-dashed max-md:border-foreground/20 max-md:bg-muted" : "max-md:bg-card"
            )}
          >
            {continued ? null : (
              <p className={cn("flex items-baseline gap-2", oneToOne && !message.internal && "max-md:hidden")}>
                <span className="text-[13px] font-semibold text-foreground max-md:text-[12.5px]">{author.name}</span>
                <time dateTime={message.created_at} className="text-[11px] text-muted-foreground tabular-nums max-md:hidden">
                  {toTimeLabel(message.created_at)}
                </time>
                {message.internal ? <InternalBadge className="self-center" /> : null}
              </p>
            )}
            {continued && message.internal ? <InternalBadge className="mt-0.5" /> : null}
            {body}
            {details}
          </div>
          {taskForm}
          {seenBy && seenBy.length > 0 ? <SeenBy ids={seenBy} className="max-md:hidden" /> : null}
        </div>
      )}

      {own ? null : actions}
      {sheetTrigger}

      <MessageActionsSheet
        open={sheetOpen}
        onOpenChange={setSheetOpen}
        message={message}
        own={own}
        readers={readers ?? []}
        actions={sheetActions}
      />
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
