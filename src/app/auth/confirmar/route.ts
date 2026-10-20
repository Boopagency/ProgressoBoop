import type { EmailOtpType } from "@supabase/supabase-js"
import { NextResponse, type NextRequest } from "next/server"

import { getSessionUser } from "@/features/auth/session"
import { getPortalUser } from "@/features/portal/session"
import { createClient } from "@/lib/supabase/server"

const OTP_TYPES = new Set<EmailOtpType>(["email_change", "email", "recovery", "invite", "magiclink", "signup"])

/**
 * Volta do link de confirmação que o Supabase manda por e-mail (por enquanto,
 * a troca de e-mail em Minha conta). Troca o código pela sessão quando dá e
 * leva a pessoa para a tela dela; sem sessão, para o login. O e-mail já foi
 * confirmado pelo Supabase antes de chegar aqui, então um link aberto em
 * outro aparelho também vale.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get("code")
  const tokenHash = searchParams.get("token_hash")
  const type = searchParams.get("type") as EmailOtpType | null

  const supabase = await createClient()
  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code)
    if (error) console.error(`[auth] ${error.code ?? error.status ?? "?"}: ${error.message}`)
  } else if (tokenHash && type && OTP_TYPES.has(type)) {
    const { error } = await supabase.auth.verifyOtp({ token_hash: tokenHash, type })
    if (error) console.error(`[auth] ${error.code ?? error.status ?? "?"}: ${error.message}`)
  }

  const destination = (await getSessionUser()) ? "/hoje" : (await getPortalUser()) ? "/portal" : "/login"
  return NextResponse.redirect(new URL(destination, request.url))
}
