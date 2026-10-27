"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { instagramApp } from "@/features/instagram/config"
import { cancelInstagramPublish, scheduleInstagramPublish, type PublishState } from "@/features/instagram/publish"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult, SocialAccountStatus } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Publicação automática no Instagram, no post (admin). Só a equipe: as
 * funções do banco conferem de novo (is_team_member) e o RLS do Storage
 * também. As regras e a preparação das imagens ficam em publish.ts.
 */

const NOT_FOUND = { ok: false, error: "Esse post não existe mais." } as const

/** O que o painel precisa além do post: se a integração está configurada e a conta do cliente. */
export interface AutoPublishContext {
  configured: boolean
  account: { username: string; status: SocialAccountStatus; tokenExpiresAt: string } | null
}

export async function loadAutoPublishContext(clientId: string): Promise<ActionResult<AutoPublishContext>> {
  await requireUser()
  if (!isUuid(clientId)) return { ok: false, error: "Cliente inválido." }
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("social_accounts")
    .select("username, status, token_expires_at")
    .eq("client_id", clientId)
    .eq("network", "instagram")
    .maybeSingle()
  if (error) return { ok: false, error: "Não foi possível ler a conta do Instagram." }
  return {
    ok: true,
    data: {
      configured: instagramApp() !== null,
      account: data
        ? { username: data.username, status: data.status as SocialAccountStatus, tokenExpiresAt: data.token_expires_at }
        : null,
    },
  }
}

/**
 * Liga ("Publicar automaticamente", também para tentar de novo depois de uma
 * falha) ou desliga. Ligar leva o post para "Agendado".
 */
export async function setAutoPublish(postId: string, on: boolean): Promise<ActionResult<PublishState>> {
  await requireUser()
  if (!isUuid(postId)) return NOT_FOUND
  const supabase = await createClient()
  const result = on ? await scheduleInstagramPublish(supabase, postId) : await cancelInstagramPublish(supabase, postId)
  if (result.ok) revalidatePath("/", "layout")
  return result
}
