"use server"

import type { AuthError } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"

import {
  AVATAR_BUCKET,
  AVATAR_MAX,
  AVATAR_TYPES,
  avatarPublicUrl,
  cleanEmail,
  cleanName,
  isOwnAvatarPath,
  ownAvatarPathFromUrl,
  passwordProblem,
} from "@/features/account/logic"
import { requireAccount, type AccountUser } from "@/features/account/session"
import { supabaseEnv } from "@/lib/supabase/env"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient, type SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"

/*
 * Minha conta (equipe e portal): cada pessoa troca o próprio nome, a foto, o
 * e-mail e a senha. A equipe grava em `profiles` (política "cada um edita o
 * próprio perfil"); a conta de cliente, por `portal_update_me`. E-mail e
 * senha são do Supabase Auth, com a sessão da própria pessoa.
 */

const NAME_REQUIRED = "Informe o seu nome."

/** O nome e a foto aparecem no menu lateral e nas conversas de todas as telas. */
function refreshAll() {
  revalidatePath("/", "layout")
}

/** Grava a foto (`avatarPath` no bucket, ou null sem foto). */
async function saveAvatar(
  supabase: SupabaseServerClient,
  account: AccountUser,
  avatarPath: string | null
): Promise<ActionResult> {
  if (account.kind === "team") {
    const avatarUrl = avatarPath ? avatarPublicUrl(supabaseEnv().url, avatarPath) : null
    const { error } = await supabase
      .from("profiles")
      .update({ avatar_url: avatarUrl })
      .eq("id", account.id)
    if (error) return dbFailure(error, "Não foi possível salvar.")
    return { ok: true, data: null }
  }
  const { error } = await supabase.rpc("portal_update_me", {
    new_name: account.name,
    new_avatar_path: avatarPath ?? "",
  })
  if (error) return dbFailure(error, "Não foi possível salvar.")
  return { ok: true, data: null }
}

export async function updateMyName(input: string): Promise<ActionResult> {
  const account = await requireAccount()
  const name = cleanName(input)
  if (!name) return { ok: false, error: NAME_REQUIRED }

  const supabase = await createClient()
  // A foto fica como está (uma foto antiga, de fora do bucket, também).
  const result =
    account.kind === "team"
      ? await supabase.from("profiles").update({ full_name: name }).eq("id", account.id)
      : await supabase.rpc("portal_update_me", {
          new_name: name,
          new_avatar_path: ownAvatarPathFromUrl(account.id, account.avatarUrl) ?? "",
        })
  if (result.error) return dbFailure(result.error, "Não foi possível salvar.")
  refreshAll()
  return { ok: true, data: null }
}

/**
 * URL assinada para enviar a foto direto ao Storage (sem passar pelo limite
 * das Server Actions), na pasta da própria conta.
 */
export async function createAvatarUpload(
  contentType: string,
  size: number
): Promise<ActionResult<{ uploadUrl: string; path: string }>> {
  const account = await requireAccount()
  if (!(AVATAR_TYPES as readonly string[]).includes(contentType)) {
    return { ok: false, error: "Use uma imagem PNG, JPG ou WebP." }
  }
  if (!Number.isFinite(size) || size <= 0 || size > AVATAR_MAX) {
    return { ok: false, error: "A foto precisa ter até 1 MB." }
  }

  const path = `${account.id}/${crypto.randomUUID()}`
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(AVATAR_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error(`[storage] ${error?.message ?? "sem dados"}`)
    return { ok: false, error: "Não foi possível enviar a foto." }
  }
  return { ok: true, data: { uploadUrl: data.signedUrl, path } }
}

/**
 * Troca a foto pela que acabou de ser enviada (`path`) ou tira a foto
 * (`null`). A foto anterior sai do Storage.
 */
export async function saveMyAvatar(path: string | null): Promise<ActionResult<{ avatarUrl: string | null }>> {
  const account = await requireAccount()
  if (path !== null && (typeof path !== "string" || !isOwnAvatarPath(account.id, path))) {
    return { ok: false, error: "Foto inválida." }
  }

  const supabase = await createClient()
  const result = await saveAvatar(supabase, account, path)
  if (!result.ok) return result

  const previous = ownAvatarPathFromUrl(account.id, account.avatarUrl)
  if (previous && previous !== path) {
    const { error } = await supabase.storage.from(AVATAR_BUCKET).remove([previous])
    if (error) console.error(`[storage] ${error.message}`)
  }
  refreshAll()
  return { ok: true, data: { avatarUrl: path ? avatarPublicUrl(supabaseEnv().url, path) : null } }
}

/** Endereço deste app, para o link de confirmação do e-mail voltar para cá. */
async function appOrigin(): Promise<string | null> {
  const list = await headers()
  const origin = list.get("origin")
  if (origin && /^https?:\/\/[^/]+$/.test(origin)) return origin
  const host = list.get("x-forwarded-host") ?? list.get("host")
  if (!host || !/^[A-Za-z0-9.:-]+$/.test(host)) return null
  return `${host.startsWith("localhost") ? "http" : "https"}://${host}`
}

function authFailure(error: AuthError, fallback: string): { ok: false; error: string } {
  console.error(`[auth] ${error.code ?? error.status ?? "?"}: ${error.message}`)
  if (error.code === "email_exists") return { ok: false, error: "Esse e-mail já é de outra conta." }
  if (error.code === "same_password") return { ok: false, error: "A senha nova precisa ser diferente da atual." }
  if (error.code === "weak_password") {
    return { ok: false, error: "Essa senha é fraca. Use pelo menos 8 caracteres, com letras e números." }
  }
  if (error.code === "over_email_send_rate_limit" || error.status === 429) {
    return { ok: false, error: "Muitas tentativas. Aguarde um pouco e tente de novo." }
  }
  return { ok: false, error: fallback }
}

/**
 * Pede a troca do e-mail de login. O Supabase manda um link de confirmação
 * (para o e-mail novo e, com "Secure email change", também para o atual); o
 * e-mail só muda depois de confirmado.
 */
export async function changeMyEmail(input: string): Promise<ActionResult<{ email: string }>> {
  const account = await requireAccount()
  const email = cleanEmail(input)
  if (!email) return { ok: false, error: "Informe um e-mail válido." }
  if (email === account.email.toLowerCase()) return { ok: false, error: "Esse já é o seu e-mail." }

  const origin = await appOrigin()
  const supabase = await createClient()
  const { error } = await supabase.auth.updateUser(
    { email },
    origin ? { emailRedirectTo: `${origin}/auth/confirmar` } : undefined
  )
  if (error) return authFailure(error, "Não foi possível pedir a troca do e-mail.")
  return { ok: true, data: { email } }
}

/** Troca a senha, depois de conferir a atual. A sessão deste navegador continua. */
export async function changeMyPassword(input: { current: string; next: string }): Promise<ActionResult> {
  const account = await requireAccount()
  const current = String(input.current ?? "")
  const next = String(input.next ?? "")
  if (!current) return { ok: false, error: "Informe a senha atual." }
  const problem = passwordProblem(next)
  if (problem) return { ok: false, error: problem }

  const supabase = await createClient()
  const check = await supabase.auth.signInWithPassword({ email: account.email, password: current })
  if (check.error) {
    if (check.error.code === "invalid_credentials") return { ok: false, error: "A senha atual não confere." }
    return authFailure(check.error, "Não foi possível conferir a senha atual.")
  }
  const { error } = await supabase.auth.updateUser({ password: next })
  if (error) return authFailure(error, "Não foi possível trocar a senha.")
  return { ok: true, data: null }
}
