import type { RealtimeChannel, SupabaseClient } from "@supabase/supabase-js"

import { getRealtimeToken } from "@/features/notifications/actions"
import { jwtExpiry, TOKEN_MARGIN_MS } from "@/features/notifications/logic"
import { supabaseEnv } from "@/lib/supabase/env"

/*
 * Avisos na hora: o navegador escuta pelo Realtime do Supabase as linhas novas
 * (e as lidas) de `notifications` da pessoa. É só o sinal de que algo mudou: a
 * lista continua vindo do servidor (loadNotifications), com a sessão e o RLS.
 * O Realtime aplica o RLS de quem escuta, então cada pessoa recebe só os
 * próprios avisos.
 *
 * O navegador não guarda sessão nem renova token (o cliente do Supabase daqui
 * não tem auth): o token da sessão vem do servidor (getRealtimeToken) e é
 * pedido de novo perto de vencer. A biblioteca só carrega depois da página.
 */

interface Handlers {
  /** Chegou ou mudou um aviso da pessoa. */
  onChange: () => void
  /** A escuta está no ar (true) ou caiu (false). */
  onStatus: (live: boolean) => void
}

/** Começa a escutar os avisos da pessoa; devolve como parar. */
export function listenToNotifications(userId: string, handlers: Handlers): () => void {
  let stopped = false
  let client: SupabaseClient | null = null
  let channel: RealtimeChannel | null = null
  let token: { value: string; expiresAt: number } | null = null

  async function accessToken(): Promise<string | null> {
    if (token && token.expiresAt - Date.now() > TOKEN_MARGIN_MS) return token.value
    const result = await getRealtimeToken()
    if (!result.ok) return null
    token = { value: result.data, expiresAt: jwtExpiry(result.data) ?? Date.now() + 5 * 60 * 1000 }
    return token.value
  }

  void (async () => {
    let env: ReturnType<typeof supabaseEnv>
    try {
      env = supabaseEnv()
    } catch {
      // Sem configuração (ex.: build local): fica a consulta periódica.
      handlers.onStatus(false)
      return
    }
    const { createClient } = await import("@supabase/supabase-js")
    if (stopped) return
    client = createClient(env.url, env.publishableKey, { accessToken })
    // O token precisa estar no lugar antes de entrar no canal: a inscrição
    // fica com o papel de quem entrou, e sem ele seria `anon` (o RLS barra tudo).
    await client.realtime.setAuth()
    if (stopped || !token) {
      handlers.onStatus(false)
      return
    }
    const filter = `user_id=eq.${userId}`
    channel = client
      .channel(`notifications:${userId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "notifications", filter }, handlers.onChange)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "notifications", filter }, handlers.onChange)
      .subscribe((status) => {
        if (!stopped) handlers.onStatus(status === "SUBSCRIBED")
      })
  })()

  return () => {
    stopped = true
    if (client && channel) void client.removeChannel(channel)
    void client?.realtime.disconnect()
  }
}
