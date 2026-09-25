"use server"

import { cookies, headers } from "next/headers"
import { redirect } from "next/navigation"

import { SESSION_COOKIE } from "@/features/auth/constants"
import { mockDb } from "@/server/mock/db"

export interface SignInState {
  error: string | null
  email: string
}

/**
 * Login simulado (etapa 1): aceita os e-mails da equipe com qualquer senha.
 * Etapa 2: `supabase.auth.signInWithPassword`.
 */
export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { error: "Informe e-mail e senha.", email }
  }

  const user = mockDb().users.find((candidate) => candidate.email === email)
  if (!user) {
    return { error: "E-mail ou senha incorretos.", email }
  }

  const [store, requestHeaders] = await Promise.all([cookies(), headers()])
  store.set(SESSION_COOKIE, user.id, {
    httpOnly: true,
    sameSite: "lax",
    // Secure só em HTTPS (Vercel); em http://localhost alguns navegadores descartariam o cookie.
    secure: requestHeaders.get("x-forwarded-proto") === "https",
    path: "/",
    maxAge: 60 * 60 * 24 * 30,
  })

  redirect("/")
}

export async function signOut(): Promise<void> {
  const store = await cookies()
  store.delete(SESSION_COOKIE)
  redirect("/login")
}
