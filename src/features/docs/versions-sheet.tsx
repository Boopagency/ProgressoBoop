"use client"

import { ChevronLeft, RotateCcw } from "lucide-react"
import dynamic from "next/dynamic"
import { useState, useTransition } from "react"
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
import { Sheet, SheetContent, SheetDescription, SheetTitle } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { getVersionContent } from "@/features/docs/actions"
import { whenLabel } from "@/features/docs/doc-side"
import { firstName } from "@/features/tasks/logic"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import type { DateKey, DocVersion, Timestamp } from "@/lib/types"
import { cn } from "@/lib/utils"

const DocPreview = dynamic(() => import("@/features/docs/doc-editor").then((mod) => mod.DocPreview), {
  ssr: false,
  loading: () => <PreviewSkeleton />,
})

function PreviewSkeleton() {
  return (
    <div className="space-y-3" aria-hidden="true">
      <Skeleton className="h-6 w-1/2" />
      <Skeleton className="h-4 w-full" />
      <Skeleton className="h-4 w-11/12" />
      <Skeleton className="h-4 w-4/5" />
    </div>
  )
}

type Preview =
  | { status: "idle" }
  | { status: "loading"; id: string }
  | { status: "ready"; id: string; title: string; content: unknown[] }

/**
 * Histórico de versões: lista à esquerda, o texto da versão à direita
 * (somente leitura) e "Restaurar". No celular, a lista e a versão se revezam.
 */
export function VersionsSheet({
  open,
  onOpenChange,
  versions,
  current,
  today,
  onRestore,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  versions: DocVersion[]
  /** Quem escreveu o texto atual, e quando. */
  current: { by: string | null; at: Timestamp }
  today: DateKey
  /** Restaura e fecha; devolve false se não deu certo. */
  onRestore: (versionId: string) => Promise<boolean>
}) {
  const { profileById } = useWorkspace()
  const [preview, setPreview] = useState<Preview>({ status: "idle" })
  const [confirm, setConfirm] = useState(false)
  const [isRestoring, startRestore] = useTransition()
  const currentAuthor = current.by ? profileById.get(current.by) : undefined
  const selected = preview.status === "idle" ? null : versions.find((version) => version.id === preview.id)

  function show(version: DocVersion) {
    setPreview({ status: "loading", id: version.id })
    void getVersionContent(version.id).then((result) => {
      if (!result.ok) {
        toast.error(result.error)
        setPreview({ status: "idle" })
        return
      }
      setPreview((state) =>
        state.status === "loading" && state.id === version.id
          ? { status: "ready", id: version.id, ...result.data }
          : state
      )
    })
  }

  function restore() {
    if (!selected) return
    startRestore(async () => {
      const ok = await onRestore(selected.id)
      setConfirm(false)
      if (ok) {
        setPreview({ status: "idle" })
        onOpenChange(false)
      }
    })
  }

  return (
    <Sheet
      open={open}
      onOpenChange={(next) => {
        onOpenChange(next)
        if (!next) setPreview({ status: "idle" })
      }}
    >
      <SheetContent side="right" className="w-full gap-0 p-0 sm:max-w-[860px]">
        <SheetTitle className="border-b px-5 py-4 text-base font-semibold">Histórico de versões</SheetTitle>
        <SheetDescription className="sr-only">
          Versões anteriores do documento. Escolha uma para ver o texto e restaurar.
        </SheetDescription>

        <div className="flex min-h-0 flex-1">
          <div
            className={cn(
              "w-full shrink-0 overflow-y-auto border-r sm:w-60",
              preview.status !== "idle" && "hidden sm:block"
            )}
          >
            <div className="px-4 py-3">
              <p className="text-[13px] font-medium text-foreground">Versão atual</p>
              <p className="text-xs text-muted-foreground">
                {whenLabel(current.at, today)}
                {currentAuthor ? ` · ${firstName(currentAuthor.full_name)}` : null}
              </p>
            </div>
            <ul className="border-t py-1.5">
              {versions.map((version) => {
                const author = version.saved_by ? profileById.get(version.saved_by) : undefined
                const active = preview.status !== "idle" && preview.id === version.id
                return (
                  <li key={version.id} className="px-2">
                    <button
                      type="button"
                      aria-current={active ? "true" : undefined}
                      onClick={() => show(version)}
                      className={cn(
                        "w-full rounded-md px-2 py-2 text-left transition-colors outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                        active ? "bg-accent" : "hover:bg-accent/60"
                      )}
                    >
                      <span className="block text-[13px] text-foreground tabular-nums">
                        {whenLabel(version.saved_at, today)}
                      </span>
                      <span className="block truncate text-xs text-muted-foreground">
                        {author ? author.full_name : "Alguém da equipe"}
                        {version.title ? ` · ${version.title}` : null}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
            {versions.length >= 100 ? (
              <p className="px-4 pb-4 text-xs text-muted-foreground">Mostrando as 100 versões mais recentes.</p>
            ) : null}
          </div>

          <div className={cn("min-w-0 flex-1 flex-col", preview.status === "idle" ? "hidden sm:flex" : "flex")}>
            {preview.status === "idle" ? (
              <div className="m-auto max-w-xs px-6 text-center">
                <p className="text-sm font-medium text-foreground">Escolha uma versão</p>
                <p className="mt-1 text-[13px] text-muted-foreground">
                  Uma versão é guardada a cada meia hora de edição, e sempre que outra pessoa edita.
                </p>
              </div>
            ) : (
              <>
                <div className="flex items-center gap-2 border-b px-4 py-2.5">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setPreview({ status: "idle" })}
                    className="-ml-2 gap-1 sm:hidden"
                  >
                    <ChevronLeft />
                    Versões
                  </Button>
                  <p className="min-w-0 flex-1 truncate text-[13px] text-muted-foreground">
                    {selected ? whenLabel(selected.saved_at, today) : null}
                  </p>
                  <Button
                    size="sm"
                    onClick={() => setConfirm(true)}
                    disabled={preview.status !== "ready" || isRestoring}
                    className="gap-1.5"
                  >
                    <RotateCcw />
                    Restaurar esta versão
                  </Button>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-8">
                  {preview.status === "ready" ? (
                    <>
                      <h3 className="mb-4 font-display text-2xl leading-8 font-semibold tracking-tight text-foreground">
                        {preview.title}
                      </h3>
                      <DocPreview key={preview.id} content={preview.content} />
                    </>
                  ) : (
                    <PreviewSkeleton />
                  )}
                </div>
              </>
            )}
          </div>
        </div>

        <AlertDialog open={confirm} onOpenChange={setConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Restaurar esta versão?</AlertDialogTitle>
              <AlertDialogDescription>
                O documento volta ao texto desta versão
                {selected ? ` (${whenLabel(selected.saved_at, today)})` : null}. O texto atual fica guardado no
                histórico, então dá para desfazer.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel disabled={isRestoring}>Cancelar</AlertDialogCancel>
              <AlertDialogAction
                onClick={(event) => {
                  event.preventDefault()
                  restore()
                }}
                disabled={isRestoring}
              >
                {isRestoring ? "Restaurando…" : "Restaurar"}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </SheetContent>
    </Sheet>
  )
}
