"use client"

import { useActionState, useRef } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { signIn, type SignInState } from "@/features/auth/actions"

const INITIAL_STATE: SignInState = { error: null, email: "" }

/** E-mails aceitos pelo login simulado da etapa 1. */
const PROTOTYPE_EMAILS = [
  "jabez@deumboop.com.br",
  "renatha@deumboop.com.br",
  "leo@deumboop.com.br",
]

export function LoginForm() {
  const [state, formAction, isPending] = useActionState(signIn, INITIAL_STATE)
  const emailRef = useRef<HTMLInputElement>(null)
  const passwordRef = useRef<HTMLInputElement>(null)

  function fillEmail(email: string) {
    if (emailRef.current) emailRef.current.value = email
    passwordRef.current?.focus()
  }

  return (
    <div className="space-y-6">
      <form action={formAction} className="space-y-4" noValidate>
        <div className="space-y-1.5">
          <Label htmlFor="email">E-mail</Label>
          <Input
            ref={emailRef}
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            placeholder="voce@deumboop.com.br"
            defaultValue={state.email}
            aria-invalid={state.error ? true : undefined}
            required
            autoFocus
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Senha</Label>
          <Input
            ref={passwordRef}
            id="password"
            name="password"
            type="password"
            autoComplete="current-password"
            aria-invalid={state.error ? true : undefined}
            required
          />
        </div>

        {state.error ? (
          <p role="alert" className="text-sm text-destructive">
            {state.error}
          </p>
        ) : null}

        <Button type="submit" className="w-full" disabled={isPending}>
          {isPending ? "Entrando…" : "Entrar"}
        </Button>
      </form>

      <div className="rounded-lg border border-dashed bg-muted/50 p-3 text-xs text-muted-foreground">
        <p className="font-medium text-foreground">Protótipo</p>
        <p className="mt-1">Entre com um dos e-mails abaixo e qualquer senha.</p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {PROTOTYPE_EMAILS.map((email) => (
            <button
              key={email}
              type="button"
              onClick={() => fillEmail(email)}
              className="rounded-md border bg-background px-2 py-1 text-foreground transition-colors hover:bg-accent"
            >
              {email}
            </button>
          ))}
        </div>
      </div>
    </div>
  )
}
