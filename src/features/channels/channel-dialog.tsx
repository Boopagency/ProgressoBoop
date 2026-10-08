"use client"

import { useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { createChannel, openDirectChannel, setChannelMembers, updateChannel } from "@/features/channels/actions"
import { CHANNEL_NAME_MAX, type ChannelEntry } from "@/features/channels/logic"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"

export type ChannelDialogState =
  | { open: false }
  | { open: true; mode: "new" }
  | { open: true; mode: "direct" }
  | { open: true; mode: "edit"; channel: ChannelEntry }

/** Novo canal interno, nova conversa direta ou nome e participantes de um canal. */
export function ChannelDialog({
  state,
  onClose,
  onSelect,
}: {
  state: ChannelDialogState
  onClose: () => void
  /** Abre o canal criado (ou a conversa). */
  onSelect: (channelId: string) => void
}) {
  const title = !state.open ? "" : state.mode === "new" ? "Novo canal" : state.mode === "direct" ? "Nova conversa" : "Canal"
  return (
    <Dialog open={state.open} onOpenChange={(open) => (open ? null : onClose())}>
      <DialogContent className="gap-0 p-0 sm:max-w-[440px]">
        <DialogTitle className="px-5 pt-5 text-base">{title}</DialogTitle>
        <DialogDescription className="px-5 pt-1 text-[13px]">
          {!state.open
            ? ""
            : state.mode === "direct"
              ? "Conversa só entre você e outra pessoa da equipe."
              : "Canal da equipe por assunto. Só quem participa vê."}
        </DialogDescription>
        {state.open && state.mode === "direct" ? (
          <DirectPicker onClose={onClose} onSelect={onSelect} />
        ) : state.open ? (
          <ChannelForm key={state.mode === "edit" ? state.channel.id : "new"} channel={state.mode === "edit" ? state.channel : null} onClose={onClose} onSelect={onSelect} />
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function DirectPicker({ onClose, onSelect }: { onClose: () => void; onSelect: (channelId: string) => void }) {
  const { profiles, currentUser } = useWorkspace()
  const [isPending, startTransition] = useTransition()
  const others = profiles.filter((profile) => profile.id !== currentUser.id)

  function open(profileId: string) {
    startTransition(async () => {
      const result = await openDirectChannel(profileId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onClose()
      onSelect(result.data.id)
    })
  }

  return (
    <ul className="px-3 pt-3 pb-4">
      {others.map((profile) => (
        <li key={profile.id}>
          <button
            type="button"
            disabled={isPending}
            onClick={() => open(profile.id)}
            className="flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left text-sm transition-colors hover:bg-muted disabled:opacity-60"
          >
            <PersonAvatar name={profile.full_name} avatarUrl={profile.avatar_url} colorIndex={profiles.indexOf(profile)} />
            <span className="font-medium text-foreground">{profile.full_name}</span>
          </button>
        </li>
      ))}
      {others.length === 0 ? <li className="px-2 py-2 text-sm text-muted-foreground">Ninguém mais na equipe.</li> : null}
    </ul>
  )
}

function ChannelForm({
  channel,
  onClose,
  onSelect,
}: {
  channel: ChannelEntry | null
  onClose: () => void
  onSelect: (channelId: string) => void
}) {
  const { profiles, currentUser } = useWorkspace()
  const [name, setName] = useState(channel?.name ?? "")
  const [members, setMembers] = useState<string[]>(channel?.member_ids ?? profiles.map((profile) => profile.id))
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    if (!name.trim()) {
      setError("Dê um nome ao canal.")
      return
    }
    startTransition(async () => {
      if (!channel) {
        const result = await createChannel({ name, member_ids: members })
        if (!result.ok) {
          setError(result.error)
          return
        }
        toast.success("Canal criado", { description: name.trim() })
        onClose()
        onSelect(result.data.id)
        return
      }
      if (name.trim() !== channel.name) {
        const renamed = await updateChannel(channel.id, { name })
        if (!renamed.ok) {
          setError(renamed.error)
          return
        }
      }
      const saved = await setChannelMembers(channel.id, members)
      if (!saved.ok) {
        setError(saved.error)
        return
      }
      toast.success("Canal salvo")
      onClose()
    })
  }

  return (
    <form
      className="flex flex-col"
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="space-y-4 px-5 pt-4 pb-5">
        <label className="block space-y-1.5">
          <span className="text-xs font-medium text-muted-foreground">Nome</span>
          <Input
            autoFocus
            value={name}
            maxLength={CHANNEL_NAME_MAX}
            onChange={(event) => {
              setName(event.target.value)
              setError(null)
            }}
            placeholder="Ex.: Financeiro"
            className="h-9"
          />
        </label>
        <fieldset className="space-y-1.5">
          <legend className="text-xs font-medium text-muted-foreground">Participantes</legend>
          <ul className="space-y-0.5">
            {profiles.map((profile) => {
              const me = profile.id === currentUser.id
              const checked = me || members.includes(profile.id)
              return (
                <li key={profile.id}>
                  <label className="flex cursor-pointer items-center gap-3 rounded-lg px-1 py-1.5 text-sm hover:bg-muted/60">
                    <Checkbox
                      checked={checked}
                      disabled={me}
                      onCheckedChange={(value) =>
                        setMembers((current) =>
                          value === true ? [...new Set([...current, profile.id])] : current.filter((id) => id !== profile.id)
                        )
                      }
                    />
                    <PersonAvatar name={profile.full_name} avatarUrl={profile.avatar_url} colorIndex={profiles.indexOf(profile)} size="sm" />
                    <span className="text-foreground">{profile.full_name}</span>
                    {me ? <span className="text-xs text-muted-foreground">(você)</span> : null}
                  </label>
                </li>
              )
            })}
          </ul>
        </fieldset>
      </div>
      <div className="flex items-center justify-between gap-3 border-t bg-muted/40 px-5 py-3">
        <p className={error ? "text-xs text-destructive" : "text-xs text-muted-foreground"} role={error ? "alert" : undefined}>
          {error ?? ""}
        </p>
        <div className="flex shrink-0 gap-2">
          <Button type="button" variant="ghost" size="sm" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" size="sm" disabled={isPending}>
            {isPending ? "Salvando…" : channel ? "Salvar" : "Criar canal"}
          </Button>
        </div>
      </div>
    </form>
  )
}
