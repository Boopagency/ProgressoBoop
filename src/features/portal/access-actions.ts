"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Acesso do cliente ao portal (lado da equipe). A conta é criada antes no
 * painel do Supabase (Add user, com senha; o app ainda não recebe o link de
 * convite); aqui ela só é ligada ao cliente, pela função
 * `link_client_member`, que confere no banco quem chama e recusa contas da
 * equipe.
 */

const NAME_MAX = 120
const EMAIL_MAX = 320
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/

const CLIENT_GONE = "Esse cliente não existe mais."
const NAME_REQUIRED = "Informe o nome de quem vai acessar."

/** Erros de `link_client_member` (a mensagem do banco é o código). */
const LINK_ERRORS: Partial<Record<string, string>> = {
  account_not_found:
    "Não há conta com esse e-mail. Crie a conta antes no Supabase (Authentication → Users → Add user, com senha).",
  account_is_team: "Esse e-mail é de alguém da equipe, que já vê tudo no admin.",
  client_not_found: CLIENT_GONE,
  invalid_name: NAME_REQUIRED,
}

function refreshClient(clientId: string) {
  revalidatePath(`/clientes/${clientId}`)
}

export async function linkClientMember(
  clientId: string,
  input: { email: string; name: string }
): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId)) return { ok: false, error: CLIENT_GONE }
  const email = String(input.email ?? "").trim().toLowerCase()
  const name = String(input.name ?? "").trim()
  if (!name || name.length > NAME_MAX) return { ok: false, error: NAME_REQUIRED }
  if (email.length > EMAIL_MAX || !EMAIL_PATTERN.test(email)) return { ok: false, error: "Informe um e-mail válido." }

  const supabase = await createClient()
  const { error } = await supabase.rpc("link_client_member", {
    target_client: clientId,
    member_email: email,
    member_name: name,
  })
  if (error) {
    const known = LINK_ERRORS[error.message]
    if (known) return { ok: false, error: known }
    return dbFailure(error, "Não foi possível dar o acesso.")
  }
  refreshClient(clientId)
  return { ok: true, data: null }
}

export async function removeClientMember(clientId: string, memberId: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId) || !isUuid(memberId)) return { ok: false, error: "Esse acesso não existe mais." }

  const supabase = await createClient()
  const { error } = await supabase.from("client_members").delete().eq("id", memberId).eq("client_id", clientId)
  if (error) return dbFailure(error, "Não foi possível tirar o acesso.")
  refreshClient(clientId)
  return { ok: true, data: null }
}
