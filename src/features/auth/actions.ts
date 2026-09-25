"use server"

import type { AuthError } from "@supabase/supabase-js"
import { redirect } from "next/navigation"

import { createClient } from "@/lib/supabase/server"

export interface SignInState {
  error: string | null
  email: string
}

function signInErrorMessage(error: AuthError): string {
  if (error.code === "invalid_credentials") return "E-mail ou senha incorretos."
  if (error.code === "email_not_confirmed") return "Esta conta ainda não foi confirmada."
  if (error.status === 429) return "Muitas tentativas. Aguarde um pouco e tente de novo."
  return "Não foi possível entrar agora. Tente de novo."
}

/** Login com e-mail e senha no Supabase Auth. Só contas com perfil (a equipe) entram. */
export async function signIn(_previous: SignInState, formData: FormData): Promise<SignInState> {
  const email = String(formData.get("email") ?? "").trim().toLowerCase()
  const password = String(formData.get("password") ?? "")

  if (!email || !password) {
    return { error: "Informe e-mail e senha.", email }
  }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signInWithPassword({ email, password })
  if (error) return { error: signInErrorMessage(error), email }

  const { data: profile } = await supabase
    .from("profiles")
    .select("id")
    .eq("id", data.user.id)
    .maybeSingle()
  if (!profile) {
    await supabase.auth.signOut({ scope: "local" })
    return { error: "Esta conta não tem acesso ao Boop Admin.", email }
  }

  redirect("/hoje")
}

/** Sai só deste navegador; as sessões em outros aparelhos continuam. */
export async function signOut(): Promise<void> {
  const supabase = await createClient()
  await supabase.auth.signOut({ scope: "local" })
  redirect("/login")
}
