import "server-only"

import { requireUser } from "@/features/auth/session"
import { instagramApp } from "@/features/instagram/config"
import { requirePortalUser } from "@/features/portal/session"
import { loadError } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { InstagramAccountType, SocialAccountStatus, Timestamp } from "@/lib/types"

/** Conta do Instagram conectada a um cliente, sem o token (que nunca sai do banco). */
export interface InstagramAccount {
  username: string
  displayName: string | null
  pictureUrl: string | null
  accountType: InstagramAccountType
  permissions: string[]
  status: SocialAccountStatus
  tokenExpiresAt: Timestamp
  connectedAt: Timestamp
  connectedByName: string
}

/** O que o cartão "Instagram" precisa: se a integração está configurada e a conta, se houver. */
export interface InstagramCardData {
  configured: boolean
  account: InstagramAccount | null
}

async function loadAccount(clientId: string): Promise<InstagramAccount | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("social_accounts")
    .select(
      "username, display_name, profile_picture_url, account_type, permissions, status, token_expires_at, connected_at, connected_by_name"
    )
    .eq("client_id", clientId)
    .eq("network", "instagram")
    .maybeSingle()
  if (error) throw loadError(error, "a conta do Instagram")
  if (!data) return null
  return {
    username: data.username,
    displayName: data.display_name,
    pictureUrl: data.profile_picture_url,
    accountType: data.account_type as InstagramAccountType,
    permissions: data.permissions,
    status: data.status as SocialAccountStatus,
    tokenExpiresAt: data.token_expires_at,
    connectedAt: data.connected_at,
    connectedByName: data.connected_by_name,
  }
}

/** Página do cliente (equipe). */
export async function getClientInstagram(clientId: string): Promise<InstagramCardData> {
  await requireUser()
  return { configured: instagramApp() !== null, account: await loadAccount(clientId) }
}

/** Portal: a conta do cliente escolhido (o RLS só mostra a dos clientes da conta). */
export async function getPortalInstagram(clientId: string): Promise<InstagramCardData> {
  const user = await requirePortalUser()
  if (!user.clients.some((client) => client.id === clientId)) return { configured: false, account: null }
  return { configured: instagramApp() !== null, account: await loadAccount(clientId) }
}
