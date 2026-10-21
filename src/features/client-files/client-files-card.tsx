"use client"

import { Download, Eye, EyeOff, MoreHorizontal, Pencil, Trash2, Upload } from "lucide-react"
import { useRef, useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { PanelCard, PanelCount } from "@/components/panel-card"
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
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { deleteClientFile, saveClientFile, updateClientFile } from "@/features/client-files/actions"
import { FileKindTile } from "@/features/client-files/file-icon"
import {
  CLIENT_FILE_ACCEPT,
  CLIENT_FILE_DESCRIPTION_MAX,
  CLIENT_FILE_NAME_MAX,
  CLIENT_FILE_TYPES_HINT,
  clientFileHref,
  formatFileSize,
  opensInBrowser,
  suggestedName,
  type ClientFile,
} from "@/features/client-files/logic"
import { discardClientFile, uploadClientFile } from "@/features/client-files/upload"
import { formatShortDate, toDateKey } from "@/lib/dates"
import { CLIENT_FILE_CATEGORIES, CLIENT_FILE_CATEGORY_LABEL, isClientFileCategory } from "@/lib/labels"
import type { ClientFileCategory, DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

type DialogState =
  | { open: false; key: number }
  | { open: true; key: number; mode: "new"; file: File }
  | { open: true; key: number; mode: "edit"; item: ClientFile }

/**
 * Página do cliente: os arquivos que a equipe envia para ele (contrato,
 * briefing, manual da marca, relatórios…). Os marcados como visíveis
 * aparecem para o cliente em Documentos, no portal, para ver e baixar.
 */
export function ClientFilesCard({ clientId, files, today }: { clientId: string; files: ClientFile[]; today: DateKey }) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dialog, setDialog] = useState<DialogState>({ open: false, key: 0 })
  const [removing, setRemoving] = useState<ClientFile | null>(null)
  const [isPending, startTransition] = useTransition()

  function chooseFile(file: File | undefined) {
    if (!file) return
    setDialog((current) => ({ open: true, key: current.key + 1, mode: "new", file }))
  }

  function toggleVisible(item: ClientFile) {
    startTransition(async () => {
      const result = await updateClientFile(item.id, { client_visible: !item.client_visible })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success(result.data.client_visible ? "O cliente já vê este documento." : "O cliente não vê mais este documento.")
    })
  }

  function confirmRemove() {
    const item = removing
    if (!item) return
    startTransition(async () => {
      const result = await deleteClientFile(item.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setRemoving(null)
      toast.success("Documento excluído.")
    })
  }

  return (
    <PanelCard
      id="arquivos-cliente"
      title={
        <>
          Arquivos do cliente
          <PanelCount value={files.length} />
        </>
      }
      action={
        <Button variant="ghost" size="sm" onClick={() => inputRef.current?.click()} className="h-7 gap-1 px-2 text-xs">
          <Upload className="size-3.5" />
          Enviar
        </Button>
      }
    >
      <input
        ref={inputRef}
        type="file"
        accept={CLIENT_FILE_ACCEPT}
        className="sr-only"
        tabIndex={-1}
        aria-label="Escolher o arquivo"
        onChange={(event) => {
          chooseFile(event.target.files?.[0])
          event.target.value = ""
        }}
      />
      {files.length === 0 ? (
        <p className="px-4 py-4 text-[13px] leading-5 text-muted-foreground">
          Contrato, briefing, manual da marca, relatórios: o que for enviado aqui o cliente vê e baixa no portal, em
          Documentos. Até 25 MB por arquivo.
        </p>
      ) : (
        <ul className="py-1">
          {files.map((item) => (
            <li key={item.id} className="flex items-center gap-3 px-4 py-2 transition-colors hover:bg-muted/50">
              <FileKindTile mimeType={item.mime_type} className="size-7" />
              <a
                href={clientFileHref(item.id, !opensInBrowser(item.mime_type))}
                target="_blank"
                rel="noopener noreferrer"
                className="min-w-0 flex-1 outline-none"
              >
                <span className="block truncate text-[13px] font-medium text-foreground">{item.name}</span>
                <span className="block truncate text-xs text-muted-foreground">
                  {CLIENT_FILE_CATEGORY_LABEL[item.category]} · {formatFileSize(item.size_bytes)} ·{" "}
                  {formatShortDate(toDateKey(item.created_at), today)}
                </span>
              </a>
              {!item.client_visible ? (
                <Badge variant="outline" className="shrink-0 gap-1 font-normal text-muted-foreground">
                  <EyeOff className="size-3" />
                  Só a equipe
                </Badge>
              ) : null}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground"
                    aria-label={`Mais ações de ${item.name}`}
                  >
                    <MoreHorizontal className="size-3.5" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuItem asChild>
                    <a href={clientFileHref(item.id, true)}>
                      <Download />
                      Baixar
                    </a>
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={() => setDialog((current) => ({ open: true, key: current.key + 1, mode: "edit", item }))}
                  >
                    <Pencil />
                    Editar
                  </DropdownMenuItem>
                  <DropdownMenuItem onSelect={() => toggleVisible(item)} disabled={isPending}>
                    {item.client_visible ? <EyeOff /> : <Eye />}
                    {item.client_visible ? "Esconder do cliente" : "Mostrar ao cliente"}
                  </DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive" onSelect={() => setRemoving(item)}>
                    <Trash2 />
                    Excluir…
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </li>
          ))}
        </ul>
      )}

      {dialog.open ? (
        <FileDialog
          key={dialog.key}
          clientId={clientId}
          state={dialog}
          onClose={() => setDialog((current) => ({ open: false, key: current.key }))}
        />
      ) : null}

      <AlertDialog open={removing !== null} onOpenChange={(open) => (open ? null : setRemoving(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir {removing?.name}?</AlertDialogTitle>
            <AlertDialogDescription>
              O arquivo sai do sistema e o cliente deixa de ver no portal. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              disabled={isPending}
              onClick={(event) => {
                event.preventDefault()
                confirmRemove()
              }}
            >
              {isPending ? "Excluindo…" : "Excluir"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelCard>
  )
}

function Field({ label, htmlFor, children, className }: { label: string; htmlFor?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={htmlFor} className="block text-xs font-medium text-muted-foreground">
        {label}
      </label>
      {children}
    </div>
  )
}

/** Envio (com o arquivo já escolhido) ou edição do documento. */
function FileDialog({
  clientId,
  state,
  onClose,
}: {
  clientId: string
  state: Extract<DialogState, { open: true }>
  onClose: () => void
}) {
  const editing = state.mode === "edit" ? state.item : null
  const file = state.mode === "new" ? state.file : null
  const [name, setName] = useState(editing?.name ?? (file ? suggestedName(file.name) : ""))
  const [category, setCategory] = useState<ClientFileCategory>(editing?.category ?? "other")
  const [description, setDescription] = useState(editing?.description ?? "")
  const [visible, setVisible] = useState(editing?.client_visible ?? true)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    const fields = { name, category, description, client_visible: visible }
    startTransition(async () => {
      if (editing) {
        const result = await updateClientFile(editing.id, fields)
        if (!result.ok) {
          setError(result.error)
          return
        }
        toast.success("Documento salvo.")
        onClose()
        return
      }
      if (!file) return
      let path: string
      try {
        path = await uploadClientFile(clientId, file)
      } catch (failure) {
        setError(failure instanceof Error ? failure.message : "Não foi possível enviar o arquivo.")
        return
      }
      const result = await saveClientFile(clientId, { path, fileName: file.name }, fields)
      if (!result.ok) {
        await discardClientFile(clientId, path)
        setError(result.error)
        return
      }
      toast.success(visible ? "Documento enviado. O cliente já vê no portal." : "Documento enviado.")
      onClose()
    })
  }

  return (
    <Dialog open onOpenChange={(open) => (open || isPending ? null : onClose())}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Editar documento" : "Enviar documento"}</DialogTitle>
          <DialogDescription>
            {file
              ? `${file.name} · ${formatFileSize(file.size)}`
              : editing
                ? `${editing.file_name} · ${formatFileSize(editing.size_bytes)}`
                : CLIENT_FILE_TYPES_HINT}
          </DialogDescription>
        </DialogHeader>
        <form
          id="documento-cliente"
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <Field label="Nome" htmlFor="documento-nome">
            <Input
              id="documento-nome"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Contrato 2026"
              maxLength={CLIENT_FILE_NAME_MAX}
              autoFocus
              required
            />
          </Field>
          <Field label="Tipo">
            <Select
              value={category}
              onValueChange={(value) => {
                if (isClientFileCategory(value)) setCategory(value)
              }}
            >
              <SelectTrigger aria-label="Tipo" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                {CLIENT_FILE_CATEGORIES.map((option) => (
                  <SelectItem key={option} value={option}>
                    {CLIENT_FILE_CATEGORY_LABEL[option]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field label="Descrição (opcional)" htmlFor="documento-descricao">
            <Textarea
              id="documento-descricao"
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              maxLength={CLIENT_FILE_DESCRIPTION_MAX}
              placeholder="O que é e para que serve"
              className="min-h-16 resize-none text-[13px]"
            />
          </Field>
          <label className="flex items-center gap-2 text-[13px] text-foreground">
            <Checkbox checked={visible} onCheckedChange={(checked) => setVisible(checked === true)} />
            O cliente vê no portal
          </label>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="documento-cliente" disabled={isPending || !name.trim()}>
            {isPending ? (editing ? "Salvando…" : "Enviando…") : editing ? "Salvar" : "Enviar"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
