"use client"

import { Bookmark, BookmarkPlus, Check, MoreHorizontal, Pencil, RefreshCw, Trash2 } from "lucide-react"
import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { sameQuery } from "@/features/tasks/filters"
import { createSavedView, deleteSavedView, updateSavedView } from "@/features/views/actions"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import type { SavedView } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Visões salvas da tela Tarefas: atalhos com nome para um conjunto de
 * filtros (e o modo Lista, Tabela ou Quadro). São da equipe toda.
 */
export function SavedViewsBar({
  query,
  onApply,
  className,
}: {
  /** Parâmetros atuais da tela (sem a tarefa aberta). */
  query: string
  onApply: (query: string) => void
  className?: string
}) {
  const { savedViews } = useWorkspace()
  // Última visão escolhida: permite "atualizar" quando os filtros mudam.
  const [baseId, setBaseId] = useState<string | null>(null)
  const active = savedViews.find((view) => sameQuery(view.query, query))
  const base = active ?? savedViews.find((view) => view.id === baseId)
  const dirty = query !== "" && !active

  if (savedViews.length === 0 && !dirty) return null

  return (
    <div className={cn("flex flex-wrap items-center gap-1.5", className)} aria-label="Visões salvas" role="group">
      <Bookmark className="mr-0.5 size-3.5 text-subtle-foreground" aria-hidden="true" />
      {savedViews.map((view) => (
        <ViewChip
          key={view.id}
          view={view}
          active={view.id === active?.id}
          onSelect={() => {
            setBaseId(view.id)
            onApply(view.query)
          }}
          onDeleted={() => {
            if (baseId === view.id) setBaseId(null)
          }}
        />
      ))}
      {dirty ? <SaveViewButton query={query} base={base} onSaved={setBaseId} /> : null}
    </div>
  )
}

function ViewChip({
  view,
  active,
  onSelect,
  onDeleted,
}: {
  view: SavedView
  active: boolean
  onSelect: () => void
  onDeleted: () => void
}) {
  const [renaming, setRenaming] = useState(false)
  const [name, setName] = useState(view.name)
  const [isPending, startTransition] = useTransition()

  function rename() {
    const next = name.trim()
    setRenaming(false)
    if (!next || next === view.name) {
      setName(view.name)
      return
    }
    startTransition(async () => {
      const result = await updateSavedView(view.id, { name: next })
      if (!result.ok) {
        toast.error(result.error)
        setName(view.name)
      }
    })
  }

  function remove() {
    startTransition(async () => {
      const result = await deleteSavedView(view.id)
      if (!result.ok) toast.error(result.error)
      else {
        onDeleted()
        toast("Visão excluída", { description: view.name })
      }
    })
  }

  if (renaming) {
    return (
      <form
        onSubmit={(event) => {
          event.preventDefault()
          rename()
        }}
      >
        <Input
          autoFocus
          value={name}
          maxLength={60}
          onChange={(event) => setName(event.target.value)}
          onBlur={rename}
          onKeyDown={(event) => {
            if (event.key === "Escape") {
              setName(view.name)
              setRenaming(false)
            }
          }}
          aria-label="Nome da visão"
          className="h-7 w-44 text-[13px]"
        />
      </form>
    )
  }

  return (
    <span
      className={cn(
        "inline-flex h-7 items-center rounded-full border text-[13px] transition-colors",
        active ? "border-foreground/20 bg-accent font-medium text-foreground" : "bg-background text-muted-foreground hover:text-foreground",
        isPending && "opacity-60"
      )}
    >
      <button
        type="button"
        onClick={onSelect}
        aria-pressed={active}
        className="inline-flex h-full items-center gap-1 rounded-full pr-1 pl-3 outline-none focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {active ? <Check className="size-3 text-brand-ink" aria-hidden="true" /> : null}
        {name}
      </button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={`Opções da visão ${name}`}
            className="mr-1 inline-flex size-5 items-center justify-center rounded-full text-subtle-foreground outline-none hover:bg-muted hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/40"
          >
            <MoreHorizontal className="size-3.5" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuItem onSelect={() => setRenaming(true)}>
            <Pencil />
            Renomear
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem variant="destructive" onSelect={remove}>
            <Trash2 />
            Excluir visão
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </span>
  )
}

function SaveViewButton({
  query,
  base,
  onSaved,
}: {
  query: string
  /** Visão escolhida antes de mudar os filtros (pode ser atualizada). */
  base: SavedView | undefined
  onSaved: (id: string) => void
}) {
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [isPending, startTransition] = useTransition()

  function save() {
    if (!name.trim()) return
    startTransition(async () => {
      const result = await createSavedView(name, query)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onSaved(result.data.id)
      setOpen(false)
      setName("")
      toast.success("Visão salva", { description: "Ela aparece aqui e no menu lateral, para toda a equipe." })
    })
  }

  function update() {
    if (!base) return
    startTransition(async () => {
      const result = await updateSavedView(base.id, { query })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setOpen(false)
      toast.success("Visão atualizada", { description: base.name })
    })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="sm" className="h-7 gap-1 rounded-full px-2.5 text-[13px] text-muted-foreground">
          <BookmarkPlus className="size-3.5" />
          Salvar visão
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-72 p-3">
        <form
          onSubmit={(event) => {
            event.preventDefault()
            save()
          }}
          className="space-y-2"
        >
          <label htmlFor="saved-view-name" className="text-xs font-medium text-muted-foreground">
            Nome da visão
          </label>
          <Input
            id="saved-view-name"
            autoFocus
            value={name}
            maxLength={60}
            onChange={(event) => setName(event.target.value)}
            placeholder="Ex.: Velmont, Minhas atrasadas"
            className="h-8 text-[13px]"
          />
          <p className="text-xs text-muted-foreground">Guarda os filtros e o modo de exibição atuais.</p>
          <div className="flex justify-end gap-2 pt-1">
            {base ? (
              <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={update} className="mr-auto gap-1 px-2">
                <RefreshCw className="size-3.5" />
                Atualizar “{base.name}”
              </Button>
            ) : null}
            <Button type="submit" size="sm" disabled={isPending || !name.trim()}>
              Salvar
            </Button>
          </div>
        </form>
      </PopoverContent>
    </Popover>
  )
}
