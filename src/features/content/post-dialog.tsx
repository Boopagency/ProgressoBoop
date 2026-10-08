"use client"

import { CalendarDays, ExternalLink, ImagePlus, ListPlus, Loader2, Plus, Trash2, X } from "lucide-react"
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { DatePicker } from "@/components/date-picker"
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
import { Button, buttonVariants } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { loadActivity } from "@/features/activity/actions"
import { ActivityFeed } from "@/features/activity/activity-feed"
import { PostSidePanel } from "@/features/channels/post-side-panel"
import { createFrontTasks, createPost, deletePost, loadPost, updatePost } from "@/features/content/actions"
import { ContentImage, ImagePick } from "@/features/content/content-image"
import { discardUploads, uploadContentImage } from "@/features/content/image-upload"
import {
  defaultFronts,
  formatUses,
  frontOfTaskTitle,
  frontTaskDue,
  FRONT_TASK_LEAD_DAYS,
  isVideoFormat,
  MAX_PINNED,
  MAX_SLIDES,
  pendingFronts,
  postImagePaths,
  type PostSummary,
  type PostTexts,
} from "@/features/content/logic"
import { ClientMark, FrontStatusDot } from "@/features/content/post-meta"
import {
  BRIEF_MAX,
  CAPTION_MAX,
  DESIGN_NOTES_MAX,
  DRIVE_URL_MAX,
  SCRIPT_MAX,
  SLIDE_TEXT_MAX,
  TITLE_MAX,
  type PostInput,
} from "@/features/content/validation"
import { isOpenProject } from "@/features/projects/logic"
import { AssigneePicker } from "@/features/tasks/assignee-picker"
import { DueDatePicker } from "@/features/tasks/due-date-picker"
import { firstName } from "@/features/tasks/logic"
import { StatusDot, TaskDateLabel } from "@/features/tasks/task-meta"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { formatShortDate, todayKey } from "@/lib/dates"
import {
  CONTENT_FORMAT_LABEL,
  CONTENT_FORMATS,
  CONTENT_FRONT_LABEL,
  CONTENT_FRONT_STATUS_LABEL,
  CONTENT_FRONT_STATUSES,
  CONTENT_FRONTS,
  CONTENT_INTENT_LABEL,
  CONTENT_INTENTS,
  CONTENT_NETWORK_LABEL,
  CONTENT_NETWORKS,
  CONTENT_STAGE_LABEL,
  CONTENT_STAGES,
} from "@/lib/labels"
import type {
  ActivityEntry,
  ContentFormat,
  ContentFront,
  ContentFrontStatus,
  ContentIntent,
  ContentNetwork,
  ContentSlide,
  ContentStage,
  DateKey,
  Task,
} from "@/lib/types"
import { cn } from "@/lib/utils"

export interface PostDialogState {
  open: boolean
  key: number
  /** Post a abrir (sem ele, um post novo). */
  post?: PostSummary
  defaults?: { client_id?: string | null; publish_on?: DateKey | null }
}

/** Estado do diálogo do post para quem o hospeda (tela Conteúdo, Hoje, Calendário, cliente). */
export function usePostDialog() {
  const [state, setState] = useState<PostDialogState>({ open: false, key: 0 })
  return {
    state,
    openPost: (post: PostSummary) => setState((current) => ({ open: true, key: current.key + 1, post })),
    openNew: (defaults?: PostDialogState["defaults"]) => setState((current) => ({ open: true, key: current.key + 1, defaults })),
    onOpenChange: (open: boolean) => setState((current) => ({ ...current, open })),
  }
}

export function PostDialog({ state, onOpenChange }: { state: PostDialogState; onOpenChange: (open: boolean) => void }) {
  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent
        showCloseButton={false}
        className={cn(
          "top-[3%] max-h-[94svh] translate-y-0 gap-0 overflow-hidden p-0 sm:top-[5%] sm:max-w-[760px]",
          state.post && "lg:top-[3%] lg:max-w-[1160px]"
        )}
      >
        <DialogTitle className="sr-only">{state.post ? "Post" : "Novo post"}</DialogTitle>
        <DialogDescription className="sr-only">
          Cliente, formato, redes, data, etapa, frentes, textos e tarefas do post.
        </DialogDescription>
        <PostForm key={state.key} post={state.post} defaults={state.defaults} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Formulário                                                          */
/* ------------------------------------------------------------------ */

const NONE = "none"
const TRIGGER = "h-9 w-full justify-between shadow-none"
const CHIP = "h-7 rounded-full border px-2.5 text-xs transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40"

/** Campos curtos do formulário (os textos longos chegam depois, ao abrir um post). */
interface Fields {
  title: string
  client_id: string | null
  project_id: string | null
  format: ContentFormat
  networks: ContentNetwork[]
  intents: ContentIntent[]
  publish_on: DateKey | null
  /** "HH:mm" ou "" (sem horário). */
  publish_time: string
  stage: ContentStage
  copy_status: ContentFrontStatus
  design_status: ContentFrontStatus
  video_status: ContentFrontStatus
  owner_id: string | null
  drive_url: string
  /** Capa no Storage (`<client_id>/<arquivo>`). */
  cover_path: string | null
  pinned: boolean
}

type TextFields = Omit<PostTexts, "brief" | "design_notes" | "script" | "caption"> & {
  brief: string
  design_notes: string
  script: string
  caption: string
}

const EMPTY_TEXTS: TextFields = { brief: "", design_notes: "", script: "", caption: "", slides: [] }

function fieldsOf(post: PostSummary): Fields {
  return {
    title: post.title,
    client_id: post.client_id,
    project_id: post.project_id,
    format: post.format,
    networks: post.networks,
    intents: post.intents,
    publish_on: post.publish_on,
    publish_time: post.publish_time?.slice(0, 5) ?? "",
    stage: post.stage,
    copy_status: post.copy_status,
    design_status: post.design_status,
    video_status: post.video_status,
    owner_id: post.owner_id,
    drive_url: post.drive_url ?? "",
    cover_path: post.cover_path,
    pinned: post.pinned,
  }
}

function newFields(defaults: PostDialogState["defaults"], ownerId: string): Fields {
  const format: ContentFormat = "reels"
  return {
    title: "",
    client_id: defaults?.client_id ?? null,
    project_id: null,
    format,
    networks: ["instagram"],
    intents: [],
    publish_on: defaults?.publish_on ?? null,
    publish_time: "",
    stage: "production",
    ...defaultFronts(format),
    owner_id: ownerId,
    drive_url: "",
    cover_path: null,
    pinned: false,
  }
}

function textsOf(post: PostTexts): TextFields {
  return {
    brief: post.brief ?? "",
    design_notes: post.design_notes ?? "",
    script: post.script ?? "",
    caption: post.caption ?? "",
    slides: post.slides,
  }
}

/** O que vai para o servidor (vazio vira null). */
function payloadOf(fields: Fields, clientId: string): Omit<PostInput, keyof PostTexts> {
  return {
    ...fields,
    client_id: clientId,
    publish_time: fields.publish_on && fields.publish_time ? fields.publish_time : null,
    drive_url: fields.drive_url.trim() || null,
  }
}

function textPayloadOf(texts: TextFields): PostTexts {
  return {
    brief: texts.brief.trim() || null,
    design_notes: texts.design_notes.trim() || null,
    script: texts.script.trim() || null,
    caption: texts.caption.trim() || null,
    slides: texts.slides.map((slide) => ({ text: slide.text.trim(), image_path: slide.image_path })),
  }
}

/** Chave da imagem que está subindo: a capa ou o slide (pela posição). */
type ImageTarget = "cover" | `slide-${number}`

/** Só o que mudou em relação ao que abriu (quem editou outra coisa ao mesmo tempo não é sobrescrito). */
function changes<T extends object>(before: T, after: T): Partial<T> {
  const patch: Partial<T> = {}
  for (const key of Object.keys(after) as (keyof T)[]) {
    if (JSON.stringify(before[key]) !== JSON.stringify(after[key])) patch[key] = after[key]
  }
  return patch
}

function toggle<T>(list: readonly T[], value: T): T[] {
  return list.includes(value) ? list.filter((item) => item !== value) : [...list, value]
}

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

function PostForm({
  post,
  defaults,
  onDone,
}: {
  post?: PostSummary
  defaults?: PostDialogState["defaults"]
  onDone: () => void
}) {
  const ids = useId()
  const { clients, profiles, projects, currentUser, clientById } = useWorkspace()
  const { tasks, openTask } = useTasks()
  const [today] = useState<DateKey>(() => todayKey())
  const [initial] = useState<Fields>(() => (post ? fieldsOf(post) : newFields(defaults, currentUser.id)))
  const [fields, setFields] = useState<Fields>(initial)
  const [frontsTouched, setFrontsTouched] = useState(false)
  // Posts novos já começam com os textos vazios; os existentes, ao carregar.
  const [initialTexts, setInitialTexts] = useState<TextFields | null>(post ? null : EMPTY_TEXTS)
  const [texts, setTexts] = useState<TextFields | null>(post ? null : EMPTY_TEXTS)
  const [loadError, setLoadError] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [generating, setGenerating] = useState(0)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [activity, setActivity] = useState<ActivityEntry[] | null>(null)
  const [activityVersion, setActivityVersion] = useState(0)
  const [uploading, setUploading] = useState<ImageTarget[]>([])
  // No celular, o post e a conversa dividem a tela por abas; no computador, lado a lado.
  const [pane, setPane] = useState<"post" | "chat">("post")
  const [isPending, startTransition] = useTransition()
  // Imagens enviadas com o post aberto e ainda não salvas: se o post fechar
  // sem salvar (ou a imagem for trocada antes), saem do Storage.
  const uploads = useRef({ pending: new Set<string>(), closed: false })

  useEffect(() => {
    const current = uploads.current
    current.closed = false
    return () => {
      current.closed = true
      if (current.pending.size > 0) void discardUploads([...current.pending])
      current.pending.clear()
    }
  }, [])

  useEffect(() => {
    if (!post) return
    let current = true
    loadPost(post.id)
      .then((result) => {
        if (!current) return
        if (!result.ok) {
          setLoadError(result.error)
          return
        }
        const loaded = textsOf(result.data)
        setInitialTexts(loaded)
        setTexts(loaded)
      })
      .catch(() => {
        if (current) setLoadError("Não foi possível carregar os textos. Feche e abra o post de novo.")
      })
    return () => {
      current = false
    }
  }, [post])

  useEffect(() => {
    if (!post) return
    let current = true
    void loadActivity("content_post", post.id).then((result) => {
      if (current && result.ok) setActivity(result.data)
    })
    return () => {
      current = false
    }
  }, [post, activityVersion])

  function set<K extends keyof Fields>(key: K, value: Fields[K]) {
    setFields((current) => ({ ...current, [key]: value }))
    if (error) setError(null)
  }

  function setText<K extends keyof TextFields>(key: K, value: TextFields[K]) {
    setTexts((current) => (current ? { ...current, [key]: value } : current))
  }

  /** Envia a imagem (reduzida no navegador) e devolve o caminho no Storage, ou null se falhou. */
  async function upload(target: ImageTarget, file: File): Promise<string | null> {
    if (!fields.client_id) {
      toast.error("Escolha o cliente antes de enviar imagens.")
      return null
    }
    setUploading((current) => [...current, target])
    try {
      const path = await uploadContentImage(fields.client_id, file)
      // Fechou enquanto enviava: a imagem não vai para lugar nenhum.
      if (uploads.current.closed) {
        void discardUploads([path])
        return null
      }
      uploads.current.pending.add(path)
      return path
    } catch (failure) {
      toast.error(failure instanceof Error ? failure.message : "Não foi possível enviar a imagem.")
      return null
    } finally {
      setUploading((current) => current.filter((item) => item !== target))
    }
  }

  async function pickCover(file: File) {
    const path = await upload("cover", file)
    if (path) set("cover_path", path)
  }

  async function pickSlideImage(index: number, file: File) {
    const path = await upload(`slide-${index}`, file)
    if (!path) return
    setTexts((current) =>
      current ? { ...current, slides: current.slides.map((slide, at) => (at === index ? { ...slide, image_path: path } : slide)) } : current
    )
  }

  /** Depois de salvar: as enviadas que ficaram de fora (trocadas antes de salvar) saem do Storage. */
  function settleUploads(saved: string[]) {
    const { pending } = uploads.current
    const orphans = [...pending].filter((path) => !saved.includes(path))
    pending.clear()
    if (orphans.length > 0) void discardUploads(orphans)
  }

  function changeFormat(format: ContentFormat) {
    setFields((current) => ({
      ...current,
      format,
      // Post novo: as frentes seguem o formato até alguém mexer nelas.
      ...(!post && !frontsTouched ? defaultFronts(format) : {}),
    }))
  }

  function changeClient(clientId: string) {
    setFields((current) => {
      const project = current.project_id ? projects.find((candidate) => candidate.id === current.project_id) : undefined
      return { ...current, client_id: clientId, project_id: project?.client_id === clientId ? current.project_id : null }
    })
    if (error) setError(null)
  }

  function validate(): string | null {
    if (!fields.title.trim()) return "Dê um título ao post (ex.: Carrossel — 5 dicas para o verão)."
    if (!fields.client_id) return "Escolha o cliente."
    if (fields.networks.length === 0) return "Escolha pelo menos uma rede."
    const drive = fields.drive_url.trim()
    if (drive && !/^https?:\/\/\S+$/i.test(drive)) return "Link do Drive inválido (comece com https://)."
    return null
  }

  function submit() {
    const problem = validate()
    const clientId = fields.client_id
    if (problem || !clientId) {
      setError(problem ?? "Escolha o cliente.")
      return
    }
    if (uploading.length > 0) {
      setError("Espere a imagem terminar de enviar.")
      return
    }
    setError(null)
    const payload = payloadOf(fields, clientId)
    const savedImages = postImagePaths({ cover_path: fields.cover_path, slides: texts?.slides ?? [] })
    startTransition(async () => {
      if (post) {
        const patch = {
          ...changes(payloadOf(initial, post.client_id), payload),
          ...(texts && initialTexts ? changes(textPayloadOf(initialTexts), textPayloadOf(texts)) : {}),
        }
        if (Object.keys(patch).length > 0) {
          const result = await updatePost(post.id, patch)
          if (!result.ok) {
            setError(result.error)
            return
          }
          toast.success("Post salvo", { description: fields.title.trim() })
        }
        settleUploads(savedImages)
        onDone()
        return
      }
      const created = await createPost({ ...payload, ...textPayloadOf(texts ?? EMPTY_TEXTS) })
      if (!created.ok) {
        setError(created.error)
        return
      }
      settleUploads(savedImages)
      const clientName = fields.client_id ? clientById.get(fields.client_id)?.name : null
      toast.success("Post criado", { description: [fields.title.trim(), clientName].filter(Boolean).join(" · ") })
      onDone()
    })
  }

  function remove() {
    if (!post) return
    startTransition(async () => {
      const result = await deletePost(post.id)
      if (!result.ok) toast.error(result.error)
      else {
        toast("Post excluído", { description: post.title })
        onDone()
      }
    })
  }

  const clientOptions = clients.filter((client) => client.active || client.id === fields.client_id)
  const projectOptions = projects.filter(
    (project) =>
      project.client_id !== null &&
      project.client_id === fields.client_id &&
      (isOpenProject(project) || project.id === fields.project_id)
  )
  const linkedTasks = post ? tasks.filter((task) => task.content_post_id === post.id) : []
  const drive = fields.drive_url.trim()

  const form = (
    <form
      className={cn("flex max-h-[94svh] min-h-0 flex-col", post && "lg:max-h-none lg:flex-1", post && pane === "chat" && "max-lg:hidden")}
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
        <div className="flex items-start gap-2.5">
          {fields.client_id ? <ClientMark clientId={fields.client_id} size="md" className="mt-0.5" /> : null}
          <input
            autoFocus={!post}
            value={fields.title}
            onChange={(event) => set("title", event.target.value)}
            maxLength={TITLE_MAX}
            placeholder="Ex.: Carrossel — 5 dicas para o verão"
            aria-label="Título do post"
            className="min-w-0 flex-1 bg-transparent text-lg leading-8 font-semibold tracking-tight text-foreground outline-none placeholder:font-normal placeholder:text-subtle-foreground"
          />
        </div>

        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          <Field label="Cliente">
            <Select value={fields.client_id ?? undefined} onValueChange={changeClient}>
              <SelectTrigger aria-label="Cliente" className={TRIGGER}>
                <SelectValue placeholder="Escolha o cliente" />
              </SelectTrigger>
              <SelectContent position="popper" align="start" className="max-h-80">
                {clientOptions.map((client) => (
                  <SelectItem key={client.id} value={client.id}>
                    {client.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Projeto">
            <Select
              value={fields.project_id ?? NONE}
              onValueChange={(value) => set("project_id", value === NONE ? null : value)}
              disabled={!fields.client_id}
            >
              <SelectTrigger aria-label="Projeto" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start" className="max-h-80">
                <SelectItem value={NONE}>Sem projeto</SelectItem>
                {projectOptions.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Formato">
            <Select value={fields.format} onValueChange={(value) => changeFormat(value as ContentFormat)}>
              <SelectTrigger aria-label="Formato" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {CONTENT_FORMATS.map((format) => (
                  <SelectItem key={format} value={format}>
                    {CONTENT_FORMAT_LABEL[format]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Etapa">
            <Select value={fields.stage} onValueChange={(value) => set("stage", value as ContentStage)}>
              <SelectTrigger aria-label="Etapa" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {CONTENT_STAGES.map((stage) => (
                  <SelectItem key={stage} value={stage}>
                    {CONTENT_STAGE_LABEL[stage]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <div className="grid grid-cols-[minmax(0,1fr)_7rem] gap-3">
            <Field label="Publicação">
              <DatePicker
                value={fields.publish_on}
                onChange={(value) => setFields((current) => ({ ...current, publish_on: value, publish_time: value ? current.publish_time : "" }))}
                today={today}
                placeholder="Sem data"
                clearLabel="Tirar a data"
                aria-label="Data de publicação"
                icon={<CalendarDays className="size-4 text-muted-foreground" />}
                renderValue={(value) => <span>{formatShortDate(value, today)}</span>}
                className="h-9 w-full justify-start border border-input px-3"
              />
            </Field>
            <Field label="Horário" htmlFor={`${ids}-time`}>
              <Input
                id={`${ids}-time`}
                type="time"
                value={fields.publish_time}
                disabled={!fields.publish_on}
                onChange={(event) => set("publish_time", event.target.value)}
                className="h-9 tabular-nums"
              />
            </Field>
          </div>
          <Field label="Responsável">
            <Select value={fields.owner_id ?? NONE} onValueChange={(value) => set("owner_id", value === NONE ? null : value)}>
              <SelectTrigger aria-label="Responsável" className={TRIGGER}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE}>Ninguém</SelectItem>
                {profiles.map((profile) => (
                  <SelectItem key={profile.id} value={profile.id}>
                    {firstName(profile.full_name)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">Redes</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CONTENT_NETWORKS.map((network) => {
                const on = fields.networks.includes(network)
                return (
                  <button
                    key={network}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("networks", toggle(fields.networks, network))}
                    className={cn(CHIP, on ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                  >
                    {CONTENT_NETWORK_LABEL[network]}
                  </button>
                )
              })}
            </div>
          </div>
          <div>
            <p className="text-xs font-medium text-muted-foreground">Intenção</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CONTENT_INTENTS.map((intent) => {
                const on = fields.intents.includes(intent)
                return (
                  <button
                    key={intent}
                    type="button"
                    aria-pressed={on}
                    onClick={() => set("intents", toggle(fields.intents, intent))}
                    className={cn(CHIP, on ? "border-foreground bg-foreground text-background" : "text-muted-foreground hover:text-foreground")}
                  >
                    {CONTENT_INTENT_LABEL[intent]}
                  </button>
                )
              })}
            </div>
          </div>
        </div>

        <div className="mt-4 grid gap-3 rounded-lg border bg-muted/30 p-3 sm:grid-cols-3">
          {CONTENT_FRONTS.map((front) => {
            const key = `${front}_status` as const
            return (
              <Field key={front} label={CONTENT_FRONT_LABEL[front]}>
                <Select
                  value={fields[key]}
                  onValueChange={(value) => {
                    setFrontsTouched(true)
                    set(key, value as ContentFrontStatus)
                  }}
                >
                  <SelectTrigger aria-label={`Situação: ${CONTENT_FRONT_LABEL[front]}`} className={cn(TRIGGER, "bg-background")}>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent position="popper" align="start">
                    {CONTENT_FRONT_STATUSES.map((status) => (
                      <SelectItem key={status} value={status}>
                        <FrontStatusDot status={status} />
                        {CONTENT_FRONT_STATUS_LABEL[status]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            )
          })}
        </div>

        <section aria-label="Capa e feed" className="mt-4 flex gap-3 rounded-lg border p-3">
          <CoverPicker
            path={fields.cover_path}
            uploading={uploading.includes("cover")}
            disabled={!fields.client_id}
            onPick={(file) => void pickCover(file)}
          />
          <div className="min-w-0 flex-1 space-y-2">
            <div>
              <p className="text-xs font-medium text-muted-foreground">Capa</p>
              <p className="mt-0.5 text-xs text-subtle-foreground">
                {fields.client_id
                  ? "Aparece no preview do feed, cortada em 3:4 como no Instagram. Vídeo não sobe: fica no link do Drive."
                  : "Escolha o cliente para enviar a capa."}
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <ImagePick
                label={fields.cover_path ? "Trocar a capa" : "Enviar a capa"}
                disabled={!fields.client_id || uploading.includes("cover")}
                onPick={(file) => void pickCover(file)}
                className={cn(buttonVariants({ variant: "outline", size: "sm" }), "h-7 px-2.5 text-xs shadow-none")}
              >
                <ImagePlus className="size-3.5" aria-hidden="true" />
                {fields.cover_path ? "Trocar" : "Enviar capa"}
              </ImagePick>
              {fields.cover_path ? (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => set("cover_path", null)}
                  className="h-7 px-2 text-xs text-muted-foreground"
                >
                  Tirar
                </Button>
              ) : null}
            </div>
            <label className="flex w-fit cursor-pointer items-center gap-2 text-[13px] text-foreground">
              <Checkbox checked={fields.pinned} onCheckedChange={(state) => set("pinned", state === true)} />
              Fixar no topo do feed
              <span className="text-xs text-muted-foreground">(até {MAX_PINNED})</span>
            </label>
          </div>
        </section>

        <section aria-label="Textos" className="mt-5 space-y-3">
          {texts === null ? (
            <p className="rounded-lg border border-dashed px-3 py-4 text-center text-xs text-muted-foreground">
              {loadError ?? "Carregando os textos…"}
            </p>
          ) : (
            <>
              <Field label="Conteúdo / ideia" htmlFor={`${ids}-brief`}>
                <Textarea
                  id={`${ids}-brief`}
                  value={texts.brief}
                  maxLength={BRIEF_MAX}
                  onChange={(event) => setText("brief", event.target.value)}
                  placeholder="Sobre o que é o post, referências, objetivo…"
                  className="min-h-16 text-[13px] shadow-none"
                />
              </Field>
              <Field label={isVideoFormat(fields.format) ? "Orientação de vídeo" : "Orientação de design"} htmlFor={`${ids}-notes`}>
                <Textarea
                  id={`${ids}-notes`}
                  value={texts.design_notes}
                  maxLength={DESIGN_NOTES_MAX}
                  onChange={(event) => setText("design_notes", event.target.value)}
                  placeholder={isVideoFormat(fields.format) ? "Cenário, enquadramento, cortes, trilha…" : "Cores, referências visuais, elementos…"}
                  className="min-h-16 text-[13px] shadow-none"
                />
              </Field>
              {formatUses(fields.format, "slides") ? (
                <SlidesEditor
                  slides={texts.slides}
                  onChange={(slides) => setText("slides", slides)}
                  canUpload={fields.client_id !== null}
                  uploading={uploading}
                  onPickImage={(index, file) => void pickSlideImage(index, file)}
                />
              ) : null}
              {formatUses(fields.format, "script") ? (
                <Field label="Roteiro" htmlFor={`${ids}-script`}>
                  <Textarea
                    id={`${ids}-script`}
                    value={texts.script}
                    maxLength={SCRIPT_MAX}
                    onChange={(event) => setText("script", event.target.value)}
                    placeholder="Gancho, desenvolvimento e chamada para ação…"
                    className="min-h-24 text-[13px] shadow-none"
                  />
                </Field>
              ) : null}
              {formatUses(fields.format, "caption") ? (
                <Field label="Legenda" htmlFor={`${ids}-caption`}>
                  <Textarea
                    id={`${ids}-caption`}
                    value={texts.caption}
                    maxLength={CAPTION_MAX}
                    onChange={(event) => setText("caption", event.target.value)}
                    placeholder="Texto que vai no post, com as hashtags"
                    className="min-h-20 text-[13px] shadow-none"
                  />
                </Field>
              ) : null}
            </>
          )}
          <Field label="Link do Drive" htmlFor={`${ids}-drive`}>
            <div className="flex gap-2">
              <Input
                id={`${ids}-drive`}
                type="url"
                inputMode="url"
                value={fields.drive_url}
                maxLength={DRIVE_URL_MAX}
                onChange={(event) => set("drive_url", event.target.value)}
                placeholder="https://drive.google.com/…"
                className="h-9 min-w-0 flex-1"
              />
              {/^https?:\/\/\S+$/i.test(drive) ? (
                <Button type="button" variant="outline" size="icon" asChild className="shrink-0 shadow-none">
                  <a href={drive} target="_blank" rel="noreferrer" aria-label="Abrir o link do Drive">
                    <ExternalLink />
                  </a>
                </Button>
              ) : null}
            </div>
          </Field>
        </section>

        {post ? (
          <section aria-label="Tarefas das frentes" className="mt-5 border-t pt-4">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-medium text-muted-foreground">Tarefas das frentes</h3>
              {generating === 0 ? (
                <Button type="button" variant="ghost" size="sm" onClick={() => setGenerating((value) => value + 1)} className="ml-auto h-7 gap-1 px-2 text-xs">
                  <ListPlus className="size-3.5" />
                  Gerar tarefas
                </Button>
              ) : null}
            </div>
            {generating > 0 ? (
              <FrontTasksPanel
                key={generating}
                postId={post.id}
                fields={fields}
                linked={linkedTasks}
                today={today}
                onClose={() => setGenerating(0)}
              />
            ) : null}
            {linkedTasks.length === 0 ? (
              generating === 0 ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Nenhuma tarefa ainda. “Gerar tarefas” cria uma por frente que falta, com prazo antes da publicação.
                </p>
              ) : null
            ) : (
              <ul className="mt-1.5 divide-y rounded-lg border">
                {linkedTasks.map((task) => (
                  <LinkedTask
                    key={task.id}
                    task={task}
                    today={today}
                    onOpen={() => {
                      onDone()
                      openTask(task.id)
                    }}
                  />
                ))}
              </ul>
            )}
          </section>
        ) : null}

      </div>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
        <div className="flex min-w-0 flex-wrap items-center gap-1">
          {post ? (
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              aria-label="Excluir post"
              onClick={() => setConfirmDelete(true)}
              disabled={isPending}
              className="text-muted-foreground hover:text-destructive"
            >
              <Trash2 />
            </Button>
          ) : null}
          {error ? (
            <p className="text-xs text-destructive" role="alert">
              {error}
            </p>
          ) : null}
        </div>
        <div className="ml-auto flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onDone}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending || uploading.length > 0}>
            {isPending ? "Salvando…" : uploading.length > 0 ? "Enviando imagem…" : post ? "Salvar" : "Criar post"}
          </Button>
        </div>
      </div>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir este post?</AlertDialogTitle>
            <AlertDialogDescription>
              “{post?.title}” sai do calendário, do quadro, do feed e da página do cliente, e as imagens dele são
              apagadas. As tarefas geradas por ele continuam, sem o vínculo com o post.
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

  if (!post) return form

  return (
    <div className="flex max-h-[94svh] flex-col lg:h-[94svh] lg:flex-row">
      <div role="tablist" aria-label="Post ou conversa" className="flex shrink-0 gap-1 border-b px-3 pt-2 lg:hidden">
        {(
          [
            ["post", "Post"],
            ["chat", "Conversa"],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={pane === value}
            onClick={() => setPane(value)}
            className={cn(
              "-mb-px h-9 border-b-2 px-3 text-[13px] transition-colors",
              pane === value ? "border-brand font-medium text-foreground" : "border-transparent text-muted-foreground"
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {form}
      <PostSidePanel
        postId={post.id}
        className={cn("h-[85svh] lg:h-auto lg:w-[400px] lg:shrink-0 lg:border-l", pane === "post" && "max-lg:hidden")}
        internal={
          activity ? (
            <ActivityFeed
              entries={activity}
              target={{ type: "content_post", id: post.id }}
              onChanged={() => setActivityVersion((value) => value + 1)}
              emptyText="Nada registrado ainda. Comentários da equipe ficam aqui; o cliente não vê."
            />
          ) : (
            <p className="text-xs text-muted-foreground">Carregando…</p>
          )
        }
      />
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Slides                                                              */
/* ------------------------------------------------------------------ */

/** Capa do post: a imagem em 3:4 (como o grid do Instagram) ou o espaço para enviar. */
function CoverPicker({
  path,
  uploading,
  disabled,
  onPick,
}: {
  path: string | null
  uploading: boolean
  disabled: boolean
  onPick: (file: File) => void
}) {
  return (
    <ImagePick
      label={path ? "Trocar a capa" : "Enviar a capa"}
      disabled={disabled || uploading}
      onPick={onPick}
      className="relative flex aspect-[3/4] w-20 shrink-0 items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/50 text-muted-foreground hover:bg-muted"
    >
      {path ? <ContentImage key={path} path={path} alt="Capa do post" /> : <ImagePlus className="size-5" aria-hidden="true" />}
      {uploading ? (
        <span className="absolute inset-0 flex items-center justify-center bg-background/70">
          <Loader2 className="size-4 animate-spin" aria-label="Enviando" />
        </span>
      ) : null}
    </ImagePick>
  )
}

function SlidesEditor({
  slides,
  onChange,
  canUpload,
  uploading,
  onPickImage,
}: {
  slides: ContentSlide[]
  onChange: (slides: ContentSlide[]) => void
  canUpload: boolean
  uploading: readonly ImageTarget[]
  onPickImage: (index: number, file: File) => void
}) {
  // Enquanto uma imagem sobe, os slides não mudam de posição (a imagem vai para o slide certo).
  const busy = uploading.some((target) => target !== "cover")
  return (
    <div className="space-y-1.5">
      <p className="text-xs font-medium text-muted-foreground">
        Slides <span className="font-normal tabular-nums">{slides.length > 0 ? `· ${slides.length}` : ""}</span>
      </p>
      {slides.length > 0 ? (
        <ol className="space-y-2">
          {slides.map((slide, index) => (
            <li key={index} className="flex items-start gap-2">
              <span className="mt-2 w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{index + 1}</span>
              <SlideImage
                index={index}
                path={slide.image_path}
                uploading={uploading.includes(`slide-${index}`)}
                disabled={!canUpload}
                onPick={(file) => onPickImage(index, file)}
                onRemove={() => onChange(slides.map((current, at) => (at === index ? { ...current, image_path: null } : current)))}
              />
              <Textarea
                value={slide.text}
                maxLength={SLIDE_TEXT_MAX}
                onChange={(event) => onChange(slides.map((current, at) => (at === index ? { ...current, text: event.target.value } : current)))}
                aria-label={`Texto do slide ${index + 1}`}
                placeholder={index === 0 ? "Capa: a frase que faz parar de rolar" : "Texto do slide"}
                className="min-h-10 flex-1 text-[13px] shadow-none"
              />
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                aria-label={`Tirar o slide ${index + 1}`}
                disabled={busy}
                onClick={() => onChange(slides.filter((_, at) => at !== index))}
                className="mt-0.5 shrink-0 text-muted-foreground"
              >
                <X />
              </Button>
            </li>
          ))}
        </ol>
      ) : null}
      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={slides.length >= MAX_SLIDES}
        onClick={() => onChange([...slides, { text: "", image_path: null }])}
        className="h-8 gap-1 text-xs shadow-none"
      >
        <Plus className="size-3.5" />
        {slides.length >= MAX_SLIDES ? `Máximo de ${MAX_SLIDES} slides` : "Slide"}
      </Button>
    </div>
  )
}

/** Imagem de um slide: miniatura (clicar troca) e o botão de tirar. */
function SlideImage({
  index,
  path,
  uploading,
  disabled,
  onPick,
  onRemove,
}: {
  index: number
  path: string | null
  uploading: boolean
  disabled: boolean
  onPick: (file: File) => void
  onRemove: () => void
}) {
  const label = `${path ? "Trocar a imagem" : "Imagem"} do slide ${index + 1}`
  return (
    <div className="relative shrink-0">
      <ImagePick
        label={disabled ? "Escolha o cliente para enviar imagens" : label}
        disabled={disabled || uploading}
        onPick={onPick}
        className="relative flex aspect-[3/4] w-10 items-center justify-center overflow-hidden rounded-md border border-dashed bg-muted/50 text-muted-foreground hover:bg-muted"
      >
        {path ? <ContentImage key={path} path={path} alt={`Imagem do slide ${index + 1}`} /> : <ImagePlus className="size-3.5" aria-hidden="true" />}
        {uploading ? (
          <span className="absolute inset-0 flex items-center justify-center bg-background/70">
            <Loader2 className="size-3.5 animate-spin" aria-label="Enviando" />
          </span>
        ) : null}
      </ImagePick>
      {path && !uploading ? (
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Tirar a imagem do slide ${index + 1}`}
          className="absolute -top-1.5 -right-1.5 flex size-4 items-center justify-center rounded-full border bg-background text-muted-foreground shadow-sm hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"
        >
          <X className="size-2.5" />
        </button>
      ) : null}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Tarefas das frentes                                                 */
/* ------------------------------------------------------------------ */

function LinkedTask({ task, today, onOpen }: { task: Task; today: DateKey; onOpen: () => void }) {
  const { profiles } = useWorkspace()
  const owners = profiles.filter((profile) => task.assignee_ids.includes(profile.id))
  return (
    <li>
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-muted/50">
        <StatusDot status={task.status} />
        <span
          className={cn(
            "min-w-0 flex-1 truncate text-[13px] text-foreground",
            task.status === "done" && "text-muted-foreground line-through decoration-muted-foreground/50"
          )}
        >
          {task.title}
        </span>
        <span className="hidden shrink-0 text-xs text-muted-foreground sm:inline">
          {owners.map((owner) => firstName(owner.full_name)).join(", ")}
        </span>
        <TaskDateLabel task={task} today={today} className="shrink-0 text-xs" />
      </button>
    </li>
  )
}

interface FrontTaskRow {
  front: ContentFront
  checked: boolean
  assignee_ids: string[]
  due_date: DateKey | null
}

/**
 * Uma tarefa por frente que ainda falta, com o responsável do post e o prazo
 * antes da publicação. Vêm marcadas as frentes que ainda não têm tarefa.
 */
function FrontTasksPanel({
  postId,
  fields,
  linked,
  today,
  onClose,
}: {
  postId: string
  fields: Fields
  linked: Task[]
  today: DateKey
  onClose: () => void
}) {
  const { currentUser } = useWorkspace()
  const [rows, setRows] = useState<FrontTaskRow[]>(() => {
    const taken = new Set(linked.map((task) => frontOfTaskTitle(task.title)))
    return pendingFronts(fields).map((front) => ({
      front,
      checked: !taken.has(front),
      assignee_ids: [fields.owner_id ?? currentUser.id],
      due_date: frontTaskDue(fields.publish_on, front, today),
    }))
  })
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const chosen = rows.filter((row) => row.checked)

  function update(front: ContentFront, patch: Partial<FrontTaskRow>) {
    setRows((current) => current.map((row) => (row.front === front ? { ...row, ...patch } : row)))
    setError(null)
  }

  function submit() {
    if (chosen.length === 0) {
      setError("Escolha pelo menos uma frente.")
      return
    }
    startTransition(async () => {
      const result = await createFrontTasks(
        postId,
        chosen.map(({ front, assignee_ids, due_date }) => ({ front, assignee_ids, due_date }))
      )
      if (!result.ok) {
        setError(result.error)
        return
      }
      const count = result.data.count
      toast.success(count === 1 ? "Tarefa criada" : `${count} tarefas criadas`, { description: "Aparecem em Tarefas e na tela Hoje." })
      onClose()
    })
  }

  if (rows.length === 0) {
    return (
      <div className="mt-2 flex items-center gap-2 rounded-lg border border-dashed px-3 py-3 text-xs text-muted-foreground">
        Nenhuma frente por fazer: todas finalizadas ou sem necessidade.
        <Button type="button" variant="ghost" size="sm" onClick={onClose} className="ml-auto h-7 px-2 text-xs">
          Fechar
        </Button>
      </div>
    )
  }

  return (
    <div className="mt-2 rounded-lg border p-3">
      <ul className="space-y-2">
        {rows.map((row) => (
          <li key={row.front} className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
            <label className="flex min-w-24 items-center gap-2 text-[13px] font-medium text-foreground">
              <Checkbox checked={row.checked} onCheckedChange={(state) => update(row.front, { checked: state === true })} />
              {CONTENT_FRONT_LABEL[row.front]}
              <span className="text-xs font-normal text-muted-foreground">D-{FRONT_TASK_LEAD_DAYS[row.front]}</span>
            </label>
            <AssigneePicker
              value={row.assignee_ids}
              onChange={(assignee_ids) => update(row.front, { assignee_ids })}
              className="h-8 max-w-48 px-2 text-[13px]"
            />
            <DueDatePicker
              value={row.due_date}
              onChange={(due_date) => update(row.front, { due_date })}
              today={today}
              className="h-8 px-2"
            />
          </li>
        ))}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button type="button" size="sm" onClick={submit} disabled={isPending || chosen.length === 0}>
          {isPending ? "Criando…" : chosen.length === 1 ? "Criar 1 tarefa" : `Criar ${chosen.length} tarefas`}
        </Button>
        <Button type="button" variant="ghost" size="sm" onClick={onClose}>
          Cancelar
        </Button>
        {error ? (
          <p className="text-xs text-destructive" role="alert">
            {error}
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">Ligadas ao post e ao cliente{fields.publish_on ? "" : " (sem data de publicação, sem prazo)"}.</p>
        )}
      </div>
    </div>
  )
}
