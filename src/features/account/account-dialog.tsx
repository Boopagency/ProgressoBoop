"use client"

import { Camera, Trash2 } from "lucide-react"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Separator } from "@/components/ui/separator"
import { changeMyEmail, changeMyPassword, saveMyAvatar, updateMyName } from "@/features/account/actions"
import { uploadAvatar } from "@/features/account/avatar-upload"
import { EMAIL_MAX, NAME_MAX, PASSWORD_MAX, PASSWORD_MIN, passwordProblem } from "@/features/account/logic"
import { PushSection } from "@/features/push/push-section"
import { PersonAvatar } from "@/features/workspace/person-avatar"

export interface AccountDialogUser {
  name: string
  email: string
  avatarUrl: string | null
}

/**
 * Minha conta, aberta pelo nome no menu lateral (admin e portal): a própria
 * pessoa troca a foto, o nome, o e-mail e a senha e ativa as notificações no
 * celular. Cada parte salva sozinha.
 */
export function AccountDialog({
  open,
  onOpenChange,
  user,
  colorIndex = 0,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  user: AccountDialogUser
  colorIndex?: number
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90svh] overflow-y-auto sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Minha conta</DialogTitle>
          <DialogDescription>Sua foto, seu nome, os dados de acesso e as notificações no celular. Só você vê esta tela.</DialogDescription>
        </DialogHeader>
        {open ? (
          <div className="space-y-5">
            <PhotoSection user={user} colorIndex={colorIndex} />
            <Separator />
            <NameSection current={user.name} />
            <Separator />
            <EmailSection current={user.email} />
            <Separator />
            <PasswordSection />
            <Separator />
            <PushSection />
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  )
}

function ErrorLine({ error }: { error: string | null }) {
  if (!error) return null
  return (
    <p role="alert" className="text-sm text-destructive">
      {error}
    </p>
  )
}

function PhotoSection({ user, colorIndex }: { user: AccountDialogUser; colorIndex: number }) {
  const [avatarUrl, setAvatarUrl] = useState(user.avatarUrl)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const input = useRef<HTMLInputElement>(null)

  function save(file: File | null) {
    setError(null)
    startTransition(async () => {
      try {
        const path = file ? await uploadAvatar(file) : null
        const result = await saveMyAvatar(path)
        if (!result.ok) {
          setError(result.error)
          return
        }
        setAvatarUrl(result.data.avatarUrl)
        toast.success(file ? "Foto atualizada." : "Foto removida.")
      } catch (problem) {
        setError(problem instanceof Error ? problem.message : "Não foi possível enviar a foto.")
      }
    })
  }

  return (
    <section className="flex items-center gap-4" aria-label="Foto">
      <PersonAvatar
        name={user.name}
        avatarUrl={avatarUrl}
        colorIndex={colorIndex}
        size="lg"
        className="size-16 [&_[data-slot=avatar-fallback]]:text-lg"
      />
      <div className="min-w-0 flex-1 space-y-2">
        <div className="flex flex-wrap gap-2">
          <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={() => input.current?.click()}>
            <Camera />
            {isPending ? "Salvando…" : avatarUrl ? "Trocar foto" : "Colocar foto"}
          </Button>
          {avatarUrl ? (
            <Button type="button" variant="ghost" size="sm" disabled={isPending} onClick={() => save(null)}>
              <Trash2 />
              Tirar
            </Button>
          ) : null}
        </div>
        <p className="text-xs text-muted-foreground">PNG, JPG ou WebP. A foto aparece para a equipe e nas conversas.</p>
        <ErrorLine error={error} />
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null
            event.target.value = ""
            if (file) save(file)
          }}
        />
      </div>
    </section>
  )
}

function NameSection({ current }: { current: string }) {
  const [name, setName] = useState(current)
  const [saved, setSaved] = useState(current)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const changed = name.trim() !== saved.trim()

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await updateMyName(name)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setSaved(name.trim())
      toast.success("Nome atualizado.")
    })
  }

  return (
    <form
      className="space-y-1.5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Label htmlFor="conta-nome">Nome</Label>
      <div className="flex gap-2">
        <Input
          id="conta-nome"
          value={name}
          onChange={(event) => setName(event.target.value)}
          maxLength={NAME_MAX}
          autoComplete="name"
          aria-invalid={error ? true : undefined}
        />
        <Button type="submit" variant="outline" disabled={isPending || !changed || !name.trim()}>
          {isPending ? "Salvando…" : "Salvar"}
        </Button>
      </div>
      <ErrorLine error={error} />
    </form>
  )
}

function EmailSection({ current }: { current: string }) {
  const [email, setEmail] = useState(current)
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()
  const changed = email.trim().toLowerCase() !== current.toLowerCase()

  function submit() {
    setError(null)
    startTransition(async () => {
      const result = await changeMyEmail(email)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setPending(result.data.email)
    })
  }

  return (
    <form
      className="space-y-1.5"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <Label htmlFor="conta-email">E-mail de login</Label>
      <div className="flex gap-2">
        <Input
          id="conta-email"
          type="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          maxLength={EMAIL_MAX}
          autoComplete="email"
          aria-invalid={error ? true : undefined}
        />
        <Button type="submit" variant="outline" disabled={isPending || !changed || !email.trim()}>
          {isPending ? "Enviando…" : "Trocar"}
        </Button>
      </div>
      {pending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Mandamos um link de confirmação para {pending} (e para o e-mail atual). O e-mail de login muda depois que você
          clicar no link. Até lá, continue entrando com {current}.
        </p>
      ) : null}
      <ErrorLine error={error} />
    </form>
  )
}

function PasswordSection() {
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const [repeat, setRepeat] = useState("")
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  function submit() {
    setError(null)
    const problem = passwordProblem(next)
    if (problem) {
      setError(problem)
      return
    }
    if (next !== repeat) {
      setError("A senha nova e a repetição não são iguais.")
      return
    }
    startTransition(async () => {
      const result = await changeMyPassword({ current, next })
      if (!result.ok) {
        setError(result.error)
        return
      }
      setCurrent("")
      setNext("")
      setRepeat("")
      toast.success("Senha trocada. Use a nova no próximo login.")
    })
  }

  return (
    <form
      className="space-y-3"
      noValidate
      onSubmit={(event) => {
        event.preventDefault()
        submit()
      }}
    >
      <div className="space-y-1.5">
        <Label htmlFor="conta-senha-atual">Senha atual</Label>
        <Input
          id="conta-senha-atual"
          type="password"
          value={current}
          onChange={(event) => setCurrent(event.target.value)}
          maxLength={PASSWORD_MAX}
          autoComplete="current-password"
        />
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1.5">
          <Label htmlFor="conta-senha-nova">Senha nova</Label>
          <Input
            id="conta-senha-nova"
            type="password"
            value={next}
            onChange={(event) => setNext(event.target.value)}
            maxLength={PASSWORD_MAX}
            autoComplete="new-password"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="conta-senha-repetir">Repita a senha nova</Label>
          <Input
            id="conta-senha-repetir"
            type="password"
            value={repeat}
            onChange={(event) => setRepeat(event.target.value)}
            maxLength={PASSWORD_MAX}
            autoComplete="new-password"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">Pelo menos {PASSWORD_MIN} caracteres, com letras e números.</p>
      <ErrorLine error={error} />
      <Button type="submit" variant="outline" disabled={isPending || !current || !next || !repeat}>
        {isPending ? "Trocando…" : "Trocar senha"}
      </Button>
    </form>
  )
}
