"use client"

import { Link2, Loader2, Paperclip } from "lucide-react"
import { useEffect, useState, useTransition, type FormEvent } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { addDeliverableLink, loadDeliverables, removeDeliverable } from "@/features/deliverables/actions"
import { DeliverableList } from "@/features/deliverables/deliverable-list"
import { DELIVERABLE_ACCEPT, DELIVERABLE_TITLE_MAX, type Deliverable } from "@/features/deliverables/logic"
import { uploadDeliverable } from "@/features/deliverables/upload"
import type { Task } from "@/lib/types"

/**
 * O bloco "Entregas para o cliente" no painel da tarefa (etapa de projeto de
 * cliente): o que o cliente vê no portal para aprovar a etapa, como o layout
 * da home em imagem ou PDF, ou o link do Figma.
 */
export function DeliverablesPanel({ task }: { task: Pick<Task, "id" | "client_visible" | "client_approval_required"> }) {
  const [loaded, setLoaded] = useState<{ taskId: string; items: Deliverable[] } | null>(null)
  const [uploading, setUploading] = useState(0)
  const [linkOpen, setLinkOpen] = useState(false)
  const [url, setUrl] = useState("")
  const [title, setTitle] = useState("")
  const [saving, startSaving] = useTransition()
  const items = loaded?.taskId === task.id ? loaded.items : null
  const visible = task.client_visible || task.client_approval_required

  useEffect(() => {
    let active = true
    void loadDeliverables(task.id).then((result) => {
      if (!active) return
      if (result.ok) setLoaded({ taskId: task.id, items: result.data })
      else toast.error(result.error)
    })
    return () => {
      active = false
    }
  }, [task.id])

  function append(item: Deliverable) {
    setLoaded((current) =>
      current?.taskId === item.task_id ? { ...current, items: [...current.items, item] } : current
    )
  }

  async function onFiles(files: File[]) {
    setUploading((count) => count + files.length)
    for (const file of files) {
      try {
        append(await uploadDeliverable(task.id, file))
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível enviar o arquivo.")
      } finally {
        setUploading((count) => count - 1)
      }
    }
  }

  function onAddLink(event: FormEvent) {
    event.preventDefault()
    startSaving(async () => {
      const result = await addDeliverableLink(task.id, { url, title })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      append(result.data)
      setUrl("")
      setTitle("")
      setLinkOpen(false)
    })
  }

  function onRemove(item: Deliverable) {
    const before = items
    setLoaded((current) => (current ? { ...current, items: current.items.filter((other) => other.id !== item.id) } : current))
    void removeDeliverable(item.id).then((result) => {
      if (result.ok) return
      toast.error(result.error)
      if (before) setLoaded({ taskId: task.id, items: before })
    })
  }

  return (
    <section aria-labelledby="task-deliverables" className="border-t px-5 pt-5 pb-1">
      <h3 id="task-deliverables" className="text-[13px] font-medium text-foreground">
        Entregas para o cliente
      </h3>
      <p className="mt-0.5 mb-3 text-xs leading-5 text-muted-foreground">
        {visible
          ? "O cliente vê estes arquivos e links nesta etapa, no portal (ex.: o layout para aprovar)."
          : "Marque “O cliente vê esta etapa” para ele ver estes arquivos e links no portal."}
      </p>

      {items === null ? (
        <p className="text-[13px] text-muted-foreground">Carregando…</p>
      ) : (
        <DeliverableList items={items} onRemove={onRemove} className="mb-3" />
      )}

      {uploading > 0 ? (
        <p className="mb-3 flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
          {uploading === 1 ? "Enviando 1 arquivo…" : `Enviando ${uploading} arquivos…`}
        </p>
      ) : null}

      {linkOpen ? (
        <form onSubmit={onAddLink} className="mb-3 space-y-2 rounded-lg border bg-muted/40 p-3">
          <Input
            value={url}
            onChange={(event) => setUrl(event.target.value)}
            placeholder="Link (Figma, Drive, prévia do site…)"
            aria-label="Link"
            inputMode="url"
            autoFocus
            required
          />
          <Input
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            placeholder="Nome (opcional), ex.: Layout da home"
            aria-label="Nome do link"
            maxLength={DELIVERABLE_TITLE_MAX}
          />
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" size="sm" onClick={() => setLinkOpen(false)}>
              Cancelar
            </Button>
            <Button type="submit" size="sm" disabled={saving || !url.trim()}>
              Adicionar
            </Button>
          </div>
        </form>
      ) : null}

      <div className="flex flex-wrap gap-2 pb-4">
        <Button asChild variant="outline" size="sm" className="cursor-pointer has-[:focus-visible]:ring-[3px] has-[:focus-visible]:ring-ring/40">
          <label>
            <Paperclip aria-hidden="true" />
            Enviar arquivo
            <input
              type="file"
              accept={DELIVERABLE_ACCEPT}
              multiple
              className="sr-only"
              onChange={(event) => {
                const files = [...(event.target.files ?? [])]
                // Limpa para o mesmo arquivo poder ser escolhido de novo.
                event.target.value = ""
                if (files.length > 0) void onFiles(files)
              }}
            />
          </label>
        </Button>
        {!linkOpen ? (
          <Button type="button" variant="outline" size="sm" onClick={() => setLinkOpen(true)}>
            <Link2 aria-hidden="true" />
            Adicionar link
          </Button>
        ) : null}
      </div>
    </section>
  )
}
