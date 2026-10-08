"use client"

import { Plus, X } from "lucide-react"
import { useState, useTransition } from "react"
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
import { Button } from "@/components/ui/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { linkClientMember, removeClientMember } from "@/features/portal/access-actions"
import type { ClientMember } from "@/features/portal/access-queries"

/**
 * Página do cliente: quem do cliente entra no portal (`/portal`). Dar acesso
 * liga uma conta já convidada no Supabase; tirar acesso só desliga do cliente.
 */
export function ClientAccessCard({
  clientId,
  clientName,
  members,
}: {
  clientId: string
  clientName: string
  members: ClientMember[]
}) {
  const [dialogOpen, setDialogOpen] = useState(false)
  const [dialogKey, setDialogKey] = useState(0)
  const [removing, setRemoving] = useState<ClientMember | null>(null)
  const [isPending, startTransition] = useTransition()

  function openDialog() {
    setDialogKey((key) => key + 1)
    setDialogOpen(true)
  }

  function confirmRemove() {
    const member = removing
    if (!member) return
    startTransition(async () => {
      const result = await removeClientMember(clientId, member.id)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setRemoving(null)
      toast.success(`${member.full_name} não acessa mais o portal.`)
    })
  }

  return (
    <PanelCard
      id="acesso-cliente"
      title={
        <>
          Acesso do cliente
          <PanelCount value={members.length} />
        </>
      }
      action={
        <Button variant="ghost" size="sm" onClick={openDialog} className="h-7 gap-1 px-2 text-xs">
          <Plus className="size-3.5" />
          Dar acesso
        </Button>
      }
    >
      {members.length === 0 ? (
        <p className="px-4 py-4 text-[13px] leading-5 text-muted-foreground">
          Ninguém do cliente entra no portal ainda. Quem tiver acesso vê só o que é deste cliente.
        </p>
      ) : (
        <ul className="py-1">
          {members.map((member) => (
            <li key={member.id} className="flex items-center gap-3 px-4 py-2">
              <div className="min-w-0 flex-1">
                <p className="truncate text-[13px] font-medium text-foreground">{member.full_name}</p>
                <p className="truncate text-xs text-muted-foreground">{member.email}</p>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="size-7 text-muted-foreground"
                onClick={() => setRemoving(member)}
                aria-label={`Tirar o acesso de ${member.full_name}`}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      )}

      <GrantAccessDialog
        key={dialogKey}
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        clientId={clientId}
        clientName={clientName}
      />

      <AlertDialog open={removing !== null} onOpenChange={(open) => (open ? null : setRemoving(null))}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Tirar o acesso de {removing?.full_name}?</AlertDialogTitle>
            <AlertDialogDescription>
              A pessoa deixa de ver {clientName} no portal. A conta continua no Supabase; para apagá-la, use o painel
              do Supabase.
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
              {isPending ? "Tirando…" : "Tirar acesso"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </PanelCard>
  )
}

function GrantAccessDialog({
  open,
  onOpenChange,
  clientId,
  clientName,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  clientId: string
  clientName: string
}) {
  const [name, setName] = useState("")
  const [email, setEmail] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await linkClientMember(clientId, { name, email })
      if (!result.ok) {
        setError(result.error)
        return
      }
      onOpenChange(false)
      toast.success(`${name.trim()} já pode entrar no portal.`)
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Dar acesso ao portal</DialogTitle>
          <DialogDescription>
            A pessoa vai ver só o que é de {clientName}. Convide o e-mail antes no Supabase (Authentication → Users →
            Invite user) e depois ligue a conta aqui.
          </DialogDescription>
        </DialogHeader>
        <form
          id="dar-acesso"
          className="space-y-4"
          noValidate
          onSubmit={(event) => {
            event.preventDefault()
            submit()
          }}
        >
          <div className="space-y-1.5">
            <Label htmlFor="acesso-nome">Nome</Label>
            <Input
              id="acesso-nome"
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Ex.: Barbara"
              maxLength={120}
              autoFocus
              required
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="acesso-email">E-mail da conta</Label>
            <Input
              id="acesso-email"
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              placeholder="nome@empresa.com.br"
              maxLength={320}
              autoComplete="off"
              aria-invalid={error ? true : undefined}
              required
            />
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </form>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
            Cancelar
          </Button>
          <Button type="submit" form="dar-acesso" disabled={isPending || !name.trim() || !email.trim()}>
            {isPending ? "Liberando…" : "Dar acesso"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
