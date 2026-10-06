"use client"

import {
  AlarmClock,
  Check,
  ChevronLeft,
  Copy,
  History,
  Link2,
  ListTodo,
  MoreHorizontal,
  Pin,
  PinOff,
  Trash2,
  TriangleAlert,
} from "lucide-react"
import dynamic from "next/dynamic"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useOptimistic, useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { PageContainer } from "@/components/layout/page"
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
import { Skeleton } from "@/components/ui/skeleton"
import {
  deleteDoc,
  duplicateDoc,
  markDocReviewed,
  restoreDocVersion,
  updateDoc,
} from "@/features/docs/actions"
import { DocDetails } from "@/features/docs/doc-details"
import type { Conflict, EditorController, Outline, SaveState } from "@/features/docs/doc-editor"
import { DOC_KIND_ICON, DocStatusBadge, effectiveStatus, reviewInfo, sinceLabel } from "@/features/docs/doc-meta"
import { DocHistoryCard, DocOutline, DocTasksCard } from "@/features/docs/doc-side"
import { GenerateTasksDialog, type GenerateTasksState } from "@/features/docs/generate-tasks-dialog"
import { checklistItems } from "@/features/docs/logic"
import { SUMMARY_MAX, TITLE_MAX, type DocPatch } from "@/features/docs/validation"
import { VersionsSheet } from "@/features/docs/versions-sheet"
import { useUnsavedWarning } from "@/features/meetings/summary-card"
import { firstName } from "@/features/tasks/logic"
import { useTasks } from "@/features/tasks/tasks-provider"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { addMonthsToKey, toTimeLabel } from "@/lib/dates"
import { DOC_KIND_LABEL, TASK_AREA_LABEL } from "@/lib/labels"
import type { Doc, DocVersion } from "@/lib/types"
import { cn } from "@/lib/utils"

const DocEditor = dynamic(() => import("@/features/docs/doc-editor").then((mod) => mod.DocEditor), {
  ssr: false,
  loading: () => <EditorSkeleton />,
})

function EditorSkeleton() {
  return (
    <div className="space-y-3 pt-1" aria-label="Carregando o editor">
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
      <Skeleton className="mt-6 h-6 w-1/3" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-3/4" />
    </div>
  )
}

const SAVE_LABEL: Record<SaveState | "idle", string> = {
  idle: "",
  dirty: "Salvando…",
  saving: "Salvando…",
  saved: "Salvo",
  error: "Não salvo, tentando de novo",
  conflict: "Não salvo",
}

/** Página de um documento: título, propriedades, editor e a lateral. */
export function DocView({ doc: serverDoc, versions }: { doc: Doc; versions: DocVersion[] }) {
  const router = useRouter()
  const { tasks, today } = useTasks()
  const { currentUser, profileById } = useWorkspace()
  const [doc, applyPatch] = useOptimistic(serverDoc, (current: Doc, patch: Partial<Doc>) => ({
    ...current,
    ...patch,
  }))
  const [, startTransition] = useTransition()
  const controller = useRef<EditorController | null>(null)
  const [saveState, setSaveState] = useState<SaveState | "idle">("idle")
  const [conflict, setConflict] = useState<Conflict | null>(null)
  const [outline, setOutline] = useState<Outline>(() => ({
    headings: [],
    checklist: checklistItems(serverDoc.content),
  }))
  const [versionsOpen, setVersionsOpen] = useState(false)
  const [tasksDialog, setTasksDialog] = useState<GenerateTasksState>({ open: false, key: 0 })

  useUnsavedWarning(saveState === "dirty" || saveState === "saving" || saveState === "error" || saveState === "conflict")

  const generatedTasks = tasks.filter((task) => task.doc_id === doc.id)
  const canGenerate = outline.checklist.length > 0

  function update(patch: DocPatch, optimistic: Partial<Doc> = patch) {
    startTransition(async () => {
      applyPatch(optimistic)
      const result = await updateDoc(doc.id, patch)
      if (!result.ok) toast.error(result.error)
    })
  }

  function changeDetails(patch: DocPatch) {
    // A próxima revisão é calculada pelo banco; aqui só para a tela responder na hora.
    if ("review_every_months" in patch) {
      const months = patch.review_every_months ?? null
      update(patch, {
        review_every_months: months,
        next_review_on: months && doc.reviewed_on ? addMonthsToKey(doc.reviewed_on, months) : null,
      })
      return
    }
    update(patch)
  }

  function markReviewed() {
    startTransition(async () => {
      applyPatch({
        reviewed_on: today,
        status: "active",
        next_review_on: doc.review_every_months ? addMonthsToKey(today, doc.review_every_months) : null,
      })
      const result = await markDocReviewed(doc.id)
      if (result.ok) toast.success("Revisão registrada", { description: doc.title })
      else toast.error(result.error)
    })
  }

  async function restore(versionId: string): Promise<boolean> {
    const saved = (await controller.current?.flush()) ?? true
    if (!saved) {
      toast.error("Resolva as alterações não salvas antes de restaurar uma versão.")
      return false
    }
    const result = await restoreDocVersion(versionId)
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    controller.current?.load(result.data.content, result.data.stamp)
    toast.success("Versão restaurada", { description: "O texto anterior ficou guardado no histórico." })
    return true
  }

  const author = doc.content_updated_by ? profileById.get(doc.content_updated_by) : undefined

  return (
    <PageContainer className="max-w-[1240px]">
      <nav aria-label="Navegação" className="flex flex-wrap items-center justify-between gap-2 text-[13px]">
        <div className="flex min-w-0 items-center gap-1 text-muted-foreground">
          <Link
            href="/processos"
            className="inline-flex items-center gap-1 transition-colors hover:text-foreground"
          >
            <ChevronLeft className="size-3.5" aria-hidden="true" />
            Processos
          </Link>
          {doc.area ? (
            <>
              <span aria-hidden="true" className="text-subtle-foreground">
                /
              </span>
              <span className="truncate">{TASK_AREA_LABEL[doc.area]}</span>
            </>
          ) : null}
        </div>
        <div className="flex items-center gap-1">
          <span
            aria-live="polite"
            className={cn(
              "mr-2 inline-flex items-center gap-1 text-xs text-muted-foreground",
              saveState === "error" && "text-destructive",
              saveState === "conflict" && "text-amber-800"
            )}
          >
            {saveState === "saved" ? <Check className="size-3.5" aria-hidden="true" /> : null}
            {SAVE_LABEL[saveState]}
          </span>
          {canGenerate ? (
            <Button
              variant="outline"
              size="sm"
              aria-label="Gerar tarefas"
              onClick={() => setTasksDialog((current) => ({ open: true, key: current.key + 1 }))}
              className="gap-1.5 shadow-none"
            >
              <ListTodo />
              <span className="hidden sm:inline">Gerar tarefas</span>
            </Button>
          ) : null}
          <DocActions
            doc={doc}
            onTogglePin={() => update({ pinned: !doc.pinned })}
            onOpenHistory={() => setVersionsOpen(true)}
            onDeleted={() => router.push("/processos")}
          />
        </div>
      </nav>

      {/*
        Telas grandes: texto à esquerda, detalhes e lateral à direita (fixos).
        Celular: uma coluna (as colunas viram "contents" e cada bloco tem a sua
        ordem): cabeçalho, detalhes (fechados), texto, tarefas e histórico.
      */}
      <div className="mt-6 flex flex-col gap-6 xl:grid xl:grid-cols-[minmax(0,1fr)_300px] xl:items-start xl:gap-x-14">
        <div className="contents xl:block xl:min-w-0">
          <div className="order-1 min-w-0">
            <ReviewBanner doc={doc} today={today} onMarkReviewed={markReviewed} />
            <DocHeader doc={doc} onUpdate={update} />
            <p className="mt-3 text-xs text-muted-foreground">
              Editado {sinceLabel(doc.content_updated_at, today)}
              {author ? ` por ${firstName(author.full_name)}` : null}
              {doc.status === "draft" ? (
                <>
                  {" · "}
                  <button
                    type="button"
                    onClick={() => update({ status: "active" })}
                    className="font-medium text-foreground underline decoration-foreground/30 underline-offset-2 hover:decoration-foreground"
                  >
                    Marcar como em vigor
                  </button>
                </>
              ) : null}
            </p>
          </div>
          <div className="order-3 min-w-0 xl:mt-8">
            {conflict && saveState === "conflict" ? (
              <ConflictBanner
                conflict={conflict}
                mine={conflict.by === currentUser.id}
                onKeepMine={async () => {
                  if (await controller.current?.overwrite()) {
                    setConflict(null)
                    toast.success("Suas alterações foram salvas", {
                      description: "A outra versão ficou guardada no histórico.",
                    })
                  }
                }}
                onLoadTheirs={async () => {
                  if (await controller.current?.reload()) setConflict(null)
                }}
              />
            ) : null}
            <div className="min-h-[40svh] pb-6 xl:min-h-[50svh] xl:pb-24">
              <DocEditor
                key={serverDoc.id}
                docId={serverDoc.id}
                content={serverDoc.content}
                stamp={serverDoc.content_updated_at}
                controller={controller}
                onSaveState={(state, next) => {
                  setSaveState(state)
                  setConflict(next ?? null)
                }}
                onOutline={setOutline}
              />
            </div>
          </div>
        </div>

        <aside aria-label="Sobre o documento" className="contents xl:sticky xl:top-6 xl:block xl:space-y-6">
          <div className="order-2 min-w-0">
            <DocDetails doc={doc} today={today} onChange={changeDetails} onMarkReviewed={markReviewed} />
          </div>
          <div className="order-4 hidden min-w-0 xl:block">
            <DocOutline headings={outline.headings} onSelect={(id) => controller.current?.scrollTo(id)} />
          </div>
          <div className="order-5 min-w-0">
            <DocTasksCard
              tasks={generatedTasks}
              onGenerate={canGenerate ? () => setTasksDialog((current) => ({ open: true, key: current.key + 1 })) : null}
            />
          </div>
          <div className="order-6 min-w-0">
            <DocHistoryCard versions={versions} today={today} onOpen={() => setVersionsOpen(true)} />
          </div>
        </aside>
      </div>

      <VersionsSheet
        open={versionsOpen}
        onOpenChange={setVersionsOpen}
        versions={versions}
        current={{ by: doc.content_updated_by, at: doc.content_updated_at }}
        today={today}
        onRestore={restore}
      />
      <GenerateTasksDialog
        state={tasksDialog}
        onOpenChange={(open) => setTasksDialog((current) => ({ ...current, open }))}
        docId={doc.id}
        docTitle={doc.title}
        items={outline.checklist}
        clientId={doc.client_id}
        today={today}
      />
    </PageContainer>
  )
}

/* ------------------------------------------------------------------ */
/* Cabeçalho                                                           */
/* ------------------------------------------------------------------ */

function DocHeader({ doc, onUpdate }: { doc: Doc; onUpdate: (patch: DocPatch) => void }) {
  const { today } = useTasks()
  const [title, setTitle] = useState(doc.title)
  const [summary, setSummary] = useState(doc.summary ?? "")
  // Título e resumo mudaram fora daqui (outra pessoa, versão restaurada): acompanha.
  const [synced, setSynced] = useState({ title: doc.title, summary: doc.summary })
  if (synced.title !== doc.title || synced.summary !== doc.summary) {
    setSynced({ title: doc.title, summary: doc.summary })
    setTitle(doc.title)
    setSummary(doc.summary ?? "")
  }
  const KindIcon = DOC_KIND_ICON[doc.kind]

  function commitTitle() {
    const next = title.replace(/\s+/g, " ").trim()
    if (!next) {
      setTitle(doc.title)
      return
    }
    if (next !== doc.title) onUpdate({ title: next })
  }

  function commitSummary() {
    const next = summary.replace(/\s+/g, " ").trim()
    if (next !== (doc.summary ?? "")) onUpdate({ summary: next || null })
  }

  return (
    <header>
      <div className="flex flex-wrap items-center gap-2 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-1.5">
          <KindIcon className="size-3.5" aria-hidden="true" />
          {DOC_KIND_LABEL[doc.kind]}
        </span>
        <DocStatusBadge doc={doc} today={today} />
        {doc.pinned ? (
          <span className="inline-flex items-center gap-1">
            <Pin className="size-3" aria-hidden="true" />
            Em “Comece por aqui”
          </span>
        ) : null}
      </div>
      <textarea
        value={title}
        onChange={(event) => setTitle(event.target.value.replace(/\n/g, ""))}
        onBlur={commitTitle}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            event.currentTarget.blur()
          }
          if (event.key === "Escape") {
            setTitle(doc.title)
            event.currentTarget.blur()
          }
        }}
        rows={1}
        maxLength={TITLE_MAX}
        aria-label="Título do documento"
        placeholder="Sem título"
        className="mt-2 field-sizing-content w-full resize-none bg-transparent font-display text-[26px] leading-9 font-semibold tracking-tight text-foreground outline-none placeholder:text-subtle-foreground sm:text-[30px] sm:leading-10"
      />
      <textarea
        value={summary}
        onChange={(event) => setSummary(event.target.value.replace(/\n/g, " "))}
        onBlur={commitSummary}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault()
            event.currentTarget.blur()
          }
        }}
        rows={1}
        maxLength={SUMMARY_MAX}
        aria-label="Para que serve"
        placeholder="Para que serve? Uma frase que aparece na lista de processos."
        className="mt-1 field-sizing-content w-full resize-none bg-transparent text-[15px] leading-6 text-muted-foreground outline-none placeholder:text-subtle-foreground"
      />
    </header>
  )
}

function ReviewBanner({
  doc,
  today,
  onMarkReviewed,
}: {
  doc: Doc
  today: string
  onMarkReviewed: () => void
}) {
  if (effectiveStatus(doc, today) !== "review") return null
  const review = reviewInfo(doc, today)
  const manual = doc.status === "review"
  return (
    <div className="mb-6 flex flex-col gap-3 rounded-xl border border-amber-600/20 bg-amber-50/70 px-4 py-3 sm:flex-row sm:items-center">
      <AlarmClock className="hidden size-4 shrink-0 text-amber-700 sm:block" aria-hidden="true" />
      <p className="min-w-0 flex-1 text-[13px] leading-5 text-amber-900">
        <span className="font-medium">Hora de revisar.</span>{" "}
        {manual ? "Este documento foi marcado para revisão." : `${review.label}.`} Leia, ajuste o que mudou e
        registre a revisão.
      </p>
      <Button size="sm" variant="outline" onClick={onMarkReviewed} className="shrink-0 bg-background shadow-none">
        Revisado hoje
      </Button>
    </div>
  )
}

function ConflictBanner({
  conflict,
  mine,
  onKeepMine,
  onLoadTheirs,
}: {
  conflict: Conflict
  mine: boolean
  onKeepMine: () => Promise<void>
  onLoadTheirs: () => Promise<void>
}) {
  const { profileById } = useWorkspace()
  const [isPending, startTransition] = useTransition()
  const person = conflict.by ? profileById.get(conflict.by) : undefined
  const name = person ? firstName(person.full_name) : "Alguém"

  return (
    <div role="alert" className="mb-6 rounded-xl border border-amber-600/25 bg-amber-50 px-4 py-3">
      <p className="flex items-start gap-2 text-[13px] leading-5 text-amber-950">
        <TriangleAlert className="mt-0.5 size-4 shrink-0 text-amber-700" aria-hidden="true" />
        <span>
          {mine ? (
            <>
              <span className="font-medium">Este documento foi salvo em outra aba ou janela</span> às{" "}
              {toTimeLabel(conflict.at)}, enquanto você editava aqui.
            </>
          ) : (
            <>
              <span className="font-medium">{name} salvou este documento</span> às {toTimeLabel(conflict.at)},
              enquanto você editava.
            </>
          )}{" "}
          Suas últimas alterações ainda não foram salvas. O que fazer?
        </span>
      </p>
      <div className="mt-3 flex flex-wrap gap-2 pl-6">
        <Button
          size="sm"
          disabled={isPending}
          onClick={() => startTransition(onKeepMine)}
        >
          Salvar as minhas por cima
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={isPending}
          onClick={() => startTransition(onLoadTheirs)}
          className="bg-background shadow-none"
        >
          {mine ? "Descartar e carregar a outra" : `Descartar e ver a de ${name}`}
        </Button>
      </div>
      <p className="mt-2 pl-6 text-xs text-amber-900/80">
        {mine
          ? "Salvando por cima, o texto salvo na outra aba é substituído por este."
          : `Salvando por cima, a versão de ${name} continua no histórico.`}
      </p>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Menu do documento                                                   */
/* ------------------------------------------------------------------ */

function DocActions({
  doc,
  onTogglePin,
  onOpenHistory,
  onDeleted,
}: {
  doc: Doc
  onTogglePin: () => void
  onOpenHistory: () => void
  onDeleted: () => void
}) {
  const router = useRouter()
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [isPending, startTransition] = useTransition()

  function duplicate() {
    startTransition(async () => {
      const result = await duplicateDoc(doc.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Cópia criada", { description: "Ela começa como rascunho." })
      router.push(`/processos/${result.data.id}`)
    })
  }

  function copyLink() {
    void navigator.clipboard
      .writeText(window.location.href)
      .then(() => toast.success("Link copiado"))
      .catch(() => toast.error("Não foi possível copiar o link."))
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteDoc(doc.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setConfirmDelete(false)
      toast("Documento excluído", { description: doc.title })
      onDeleted()
    })
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" aria-label="Mais ações" className="size-8">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-60">
          <DropdownMenuItem onSelect={onTogglePin}>
            {doc.pinned ? <PinOff /> : <Pin />}
            {doc.pinned ? "Tirar de “Comece por aqui”" : "Fixar em “Comece por aqui”"}
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={onOpenHistory}>
            <History />
            Histórico de versões
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={duplicate} disabled={isPending}>
            <Copy />
            Duplicar
          </DropdownMenuItem>
          <DropdownMenuItem onSelect={copyLink}>
            <Link2 />
            Copiar link
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={() => setConfirmDelete(true)}>
            <Trash2 />
            Excluir…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <AlertDialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir “{doc.title}”?</AlertDialogTitle>
            <AlertDialogDescription>
              O documento, o histórico de versões e as imagens dele serão apagados. As tarefas geradas
              continuam existindo. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(event) => {
                event.preventDefault()
                remove()
              }}
              disabled={isPending}
              className="bg-destructive text-white hover:bg-destructive/90"
            >
              {isPending ? "Excluindo…" : "Excluir documento"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  )
}
