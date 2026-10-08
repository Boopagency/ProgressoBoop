"use client"

import { CalendarPlus, ChevronDown, ExternalLink, Trash2 } from "lucide-react"
import { useId, useState, useTransition, type ReactNode } from "react"
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
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { loadPost } from "@/features/content/actions"
import { convertIdeaToPost, createIdea, deleteIdea, updateIdea } from "@/features/content/ideas-actions"
import {
  IDEA_NOTES_MAX,
  IDEA_TITLE_MAX,
  normalizeReferenceUrl,
  REFERENCE_URL_MAX,
  type IdeaInput,
} from "@/features/content/ideas-validation"
import { publishLabel, type PostSummary } from "@/features/content/logic"
import { FormatIcon, StageDot } from "@/features/content/post-meta"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { todayKey } from "@/lib/dates"
import { CONTENT_FORMAT_LABEL, CONTENT_FORMATS, CONTENT_STAGE_LABEL, isContentFormat } from "@/lib/labels"
import type { ContentFormat, ContentIdea, DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/*
 * Ideia do banco de ideias (janela) e o "Virar post", usados na visão Ideias
 * do Conteúdo e no cartão de ideias da página do cliente. Quem hospeda abre
 * o post criado (ou o post da ideia) no próprio diálogo de post.
 */

export interface IdeaDialogState {
  open: boolean
  key: number
  /** Ideia a abrir (sem ela, uma ideia nova). */
  idea?: ContentIdea
  defaults?: { client_id?: string | null }
}

export function useIdeaDialog() {
  const [state, setState] = useState<IdeaDialogState>({ open: false, key: 0 })
  return {
    state,
    openIdea: (idea: ContentIdea) => setState((current) => ({ open: true, key: current.key + 1, idea })),
    openNew: (defaults?: IdeaDialogState["defaults"]) => setState((current) => ({ open: true, key: current.key + 1, defaults })),
    onOpenChange: (open: boolean) => setState((current) => ({ ...current, open })),
  }
}

/** Abre o post de uma ideia: o que a tela já tem ou, se não estiver carregado, busca. */
function openLinkedPost(postId: string, posts: readonly PostSummary[], onOpenPost: (post: PostSummary) => void) {
  const found = posts.find((post) => post.id === postId)
  if (found) {
    onOpenPost(found)
    return
  }
  void loadPost(postId).then((result) => {
    if (result.ok) onOpenPost(result.data)
    else toast.error(result.error)
  })
}

/** "Virar post" e "Ver post" direto das listas (sem abrir a ideia). */
export function useIdeaActions(posts: readonly PostSummary[], onOpenPost: (post: PostSummary) => void) {
  const [convertingId, setConvertingId] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function convert(idea: ContentIdea, format: ContentFormat) {
    if (isPending) return
    setConvertingId(idea.id)
    startTransition(async () => {
      const result = await convertIdeaToPost(idea.id, format)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("A ideia virou post", { description: result.data.title })
      onOpenPost(result.data)
    })
  }

  return {
    convert,
    openPost: (idea: ContentIdea) => {
      if (idea.post_id) openLinkedPost(idea.post_id, posts, onOpenPost)
    },
    convertingId: isPending ? convertingId : null,
  }
}

/**
 * Botão "Virar post". Com o formato da ideia, cria direto; sem formato,
 * abre a lista para escolher o formato do post.
 */
export function ConvertIdeaButton({
  format,
  onConvert,
  pending = false,
  disabled = false,
  variant = "outline",
  className,
}: {
  format: ContentFormat | null
  onConvert: (format: ContentFormat) => void
  pending?: boolean
  disabled?: boolean
  variant?: "outline" | "ghost" | "default"
  className?: string
}) {
  const label = pending ? "Criando post…" : "Virar post"
  const buttonClass = cn("gap-1.5 shadow-none", className)
  if (format) {
    return (
      <Button type="button" variant={variant} size="sm" disabled={disabled || pending} onClick={() => onConvert(format)} className={buttonClass}>
        <CalendarPlus />
        {label}
      </Button>
    )
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button type="button" variant={variant} size="sm" disabled={disabled || pending} className={buttonClass}>
          <CalendarPlus />
          {label}
          <ChevronDown className="opacity-60" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-48">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">Formato do post</DropdownMenuLabel>
        {CONTENT_FORMATS.map((option) => (
          <DropdownMenuItem key={option} onSelect={() => onConvert(option)}>
            <FormatIcon format={option} />
            {CONTENT_FORMAT_LABEL[option]}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  )
}

/** O post em que a ideia virou: etapa e quando sai (se a tela tiver o post), com "Ver post". */
export function LinkedPostLabel({ post, today, className }: { post: PostSummary | undefined; today: DateKey; className?: string }) {
  if (!post) return <span className={cn("text-xs text-muted-foreground", className)}>No cronograma</span>
  return (
    <span className={cn("inline-flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground", className)}>
      <StageDot stage={post.stage} />
      <span className="truncate">
        {CONTENT_STAGE_LABEL[post.stage]} · <span className="tabular-nums">{publishLabel(post, today)}</span>
      </span>
    </span>
  )
}

export function IdeaDialog({
  state,
  onOpenChange,
  posts,
  onOpenPost,
}: {
  state: IdeaDialogState
  onOpenChange: (open: boolean) => void
  /** Posts que a tela já tem (para mostrar e abrir o post da ideia sem buscar). */
  posts: readonly PostSummary[]
  onOpenPost: (post: PostSummary) => void
}) {
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className="top-[6%] max-h-[90svh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[10%] sm:max-w-[600px]"
      >
        <DialogTitle className="sr-only">{state.idea ? "Ideia" : "Nova ideia"}</DialogTitle>
        <DialogDescription className="sr-only">
          Título, notas, formato e link de referência da ideia. “Virar post” cria o post do cliente com esses dados.
        </DialogDescription>
        <IdeaForm
          key={state.key}
          idea={state.idea}
          defaults={state.defaults}
          posts={posts}
          onOpenPost={onOpenPost}
          onDone={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  )
}

const NONE = "none"
const TRIGGER = "h-9 w-full justify-between shadow-none"

function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("min-w-0 space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

interface Fields {
  client_id: string | null
  title: string
  notes: string
  format: ContentFormat | null
  reference_url: string
}

function fieldsOf(idea: ContentIdea | undefined, defaults: IdeaDialogState["defaults"]): Fields {
  return {
    client_id: idea?.client_id ?? defaults?.client_id ?? null,
    title: idea?.title ?? "",
    notes: idea?.notes ?? "",
    format: idea?.format ?? null,
    reference_url: idea?.reference_url ?? "",
  }
}

function IdeaForm({
  idea,
  defaults,
  posts,
  onOpenPost,
  onDone,
}: {
  idea?: ContentIdea
  defaults?: IdeaDialogState["defaults"]
  posts: readonly PostSummary[]
  onOpenPost: (post: PostSummary) => void
  onDone: () => void
}) {
  const ids = useId()
  const { clients } = useWorkspace()
  const [today] = useState<DateKey>(() => todayKey())
  const [fields, setFields] = useState<Fields>(() => fieldsOf(idea, defaults))
  const [error, setError] = useState<string | null>(null)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [converting, setConverting] = useState(false)
  const [isPending, startTransition] = useTransition()
  const linkedPost = idea?.post_id ? posts.find((post) => post.id === idea.post_id) : undefined
  const reference = normalizeReferenceUrl(fields.reference_url)

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((current) => ({ ...current, [key]: value }))
    if (error) setError(null)
  }

  function validate(): string | null {
    if (!fields.title.trim()) return "Dê um título à ideia (ex.: Bastidores da produção)."
    if (!fields.client_id) return "Escolha o cliente."
    if (reference === undefined) return "Link de referência inválido (comece com https://)."
    return null
  }

  /** Salva (cria ou só o que mudou) e devolve o id da ideia, ou null se não deu. */
  async function persist(format: ContentFormat | null): Promise<string | null> {
    const clientId = fields.client_id
    if (!clientId) return null
    const input: IdeaInput = {
      client_id: clientId,
      title: fields.title,
      notes: fields.notes.trim() || null,
      format,
      reference_url: reference ?? null,
    }
    if (!idea) {
      const result = await createIdea(input)
      if (!result.ok) {
        setError(result.error)
        return null
      }
      return result.data.id
    }
    const before = fieldsOf(idea, undefined)
    const patch: Partial<IdeaInput> = {}
    if (input.client_id !== before.client_id) patch.client_id = input.client_id
    if (input.title.replace(/\s+/g, " ").trim() !== before.title) patch.title = input.title
    if ((input.notes ?? "") !== before.notes) patch.notes = input.notes
    if (input.format !== before.format) patch.format = input.format
    if ((input.reference_url ?? "") !== before.reference_url) patch.reference_url = input.reference_url
    if (Object.keys(patch).length > 0) {
      const result = await updateIdea(idea.id, patch)
      if (!result.ok) {
        setError(result.error)
        return null
      }
    }
    return idea.id
  }

  function submit() {
    if (isPending) return
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    startTransition(async () => {
      const id = await persist(fields.format)
      if (!id) return
      toast.success(idea ? "Ideia salva" : "Ideia guardada", { description: fields.title.trim() })
      onDone()
    })
  }

  /** Salva o que mudou e cria o post com os dados da ideia; o post abre em seguida. */
  function convert(format: ContentFormat) {
    if (isPending) return
    setFields((current) => ({ ...current, format }))
    const problem = validate()
    if (problem) {
      setError(problem)
      return
    }
    setConverting(true)
    startTransition(async () => {
      const id = await persist(format)
      if (!id) {
        setConverting(false)
        return
      }
      const result = await convertIdeaToPost(id, format)
      if (!result.ok) {
        setConverting(false)
        if (idea) setError(result.error)
        else {
          // A ideia nova ficou salva; só o post não saiu.
          toast.error(result.error, { description: "A ideia ficou guardada." })
          onDone()
        }
        return
      }
      toast.success("A ideia virou post", { description: result.data.title })
      onDone()
      onOpenPost(result.data)
    })
  }

  function remove() {
    if (!idea) return
    startTransition(async () => {
      const result = await deleteIdea(idea.id)
      if (!result.ok) toast.error(result.error)
      else {
        toast("Ideia excluída", { description: idea.title })
        onDone()
      }
    })
  }

  return (
    <form
      className="flex max-h-[90svh] flex-col"
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
        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs font-medium text-muted-foreground">
          {idea ? "Ideia" : "Nova ideia"}
          {idea?.post_id ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border px-2 py-0.5 text-[11px] font-normal">
              <LinkedPostLabel post={linkedPost} today={today} />
            </span>
          ) : null}
        </div>
        <textarea
          autoFocus={!idea}
          value={fields.title}
          onChange={(event) => set("title", event.target.value)}
          rows={1}
          maxLength={IDEA_TITLE_MAX}
          placeholder="Qual é a ideia? (ex.: Bastidores da produção)"
          aria-label="Título"
          aria-invalid={error && !fields.title.trim() ? true : undefined}
          className="field-sizing-content w-full resize-none bg-transparent font-display text-lg leading-7 font-semibold tracking-tight text-foreground outline-none placeholder:font-sans placeholder:font-normal placeholder:text-subtle-foreground"
        />
        <Textarea
          value={fields.notes}
          onChange={(event) => set("notes", event.target.value)}
          maxLength={IDEA_NOTES_MAX}
          placeholder="Notas: o gancho, o que mostrar, de onde veio a ideia… (opcional)"
          aria-label="Notas"
          className="mt-2 min-h-24 text-[13px] shadow-none"
        />
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Cliente">
            <Select value={fields.client_id ?? undefined} onValueChange={(value) => set("client_id", value)}>
              <SelectTrigger aria-label="Cliente" className={TRIGGER}>
                <SelectValue placeholder="Escolha o cliente" />
              </SelectTrigger>
              <SelectContent position="popper" align="start" className="max-h-80">
                {clients
                  .filter((client) => client.active || client.id === fields.client_id)
                  .map((client) => (
                    <SelectItem key={client.id} value={client.id}>
                      {client.name}
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Formato">
            <Select value={fields.format ?? NONE} onValueChange={(value) => set("format", isContentFormat(value) ? value : null)}>
              <SelectTrigger aria-label="Formato" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE} className="text-muted-foreground">
                  Ainda não sei
                </SelectItem>
                {CONTENT_FORMATS.map((option) => (
                  <SelectItem key={option} value={option}>
                    <FormatIcon format={option} />
                    {CONTENT_FORMAT_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Link de referência" htmlFor={`${ids}-reference`} className="sm:col-span-2">
            <div className="flex gap-2">
              <Input
                id={`${ids}-reference`}
                type="url"
                inputMode="url"
                value={fields.reference_url}
                maxLength={REFERENCE_URL_MAX}
                onChange={(event) => set("reference_url", event.target.value)}
                placeholder="https://instagram.com/p/…"
                aria-invalid={error && reference === undefined ? true : undefined}
                className="h-9 min-w-0 flex-1"
              />
              {reference ? (
                <Button type="button" variant="outline" size="icon" asChild className="shrink-0 shadow-none">
                  <a href={reference} target="_blank" rel="noreferrer" aria-label="Abrir o link de referência">
                    <ExternalLink />
                  </a>
                </Button>
              ) : null}
            </div>
          </Field>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 border-t bg-muted/40 px-5 py-3">
        {idea ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            aria-label="Excluir ideia"
            onClick={() => setConfirmDelete(true)}
            disabled={isPending}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 />
          </Button>
        ) : null}
        <p
          className={cn("min-w-0 flex-1 text-xs", error ? "text-destructive" : "text-muted-foreground")}
          role={error ? "alert" : undefined}
        >
          {error ?? (idea?.post_id ? "Já está no cronograma." : "“Virar post” cria o post em produção, sem data.")}
        </p>
        <div className="ml-auto flex shrink-0 flex-wrap justify-end gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          {idea?.post_id ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="shadow-none"
              onClick={() => {
                if (!idea.post_id) return
                onDone()
                openLinkedPost(idea.post_id, posts, onOpenPost)
              }}
            >
              Ver post
            </Button>
          ) : (
            <ConvertIdeaButton format={fields.format} onConvert={convert} pending={converting} disabled={isPending} />
          )}
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending && !converting ? "Salvando…" : idea ? "Salvar" : "Guardar ideia"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir esta ideia?</AlertDialogTitle>
            <AlertDialogDescription>
              {idea?.post_id ? "O post que nasceu dela continua no cronograma." : "Ela sai do banco de ideias do cliente."}
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
