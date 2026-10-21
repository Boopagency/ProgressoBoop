import { timingSafeEqual } from "node:crypto"

import webpush, { WebPushError } from "web-push"

import { pushMessage, type PushAudience, type PushWebhookBody } from "@/features/push/logic"
import { createClient } from "@/lib/supabase/server"

/**
 * Envio das notificações no celular, chamado só pelo banco (pg_net, trigger
 * em `notifications` e `client_notifications`; veja a migration
 * push_subscriptions). Vem sem sessão: vale o segredo compartilhado
 * (PUSH_WEBHOOK_SECRET aqui, `push_webhook_secret` no Vault). O banco manda os
 * avisos com as inscrições de quem recebe; a rota monta a frase, assina com
 * as chaves VAPID e avisa o banco dos aparelhos encerrados. Não lê nada do
 * banco.
 */

const MAX_SENDS = 200
/** O push vale por um dia: aparelho desligado mais tempo que isso não recebe aviso velho. */
const TTL_SECONDS = 24 * 60 * 60

function sameSecret(given: string, expected: string): boolean {
  const a = Buffer.from(given)
  const b = Buffer.from(expected)
  return a.length === b.length && timingSafeEqual(a, b)
}

function isBody(value: unknown): value is PushWebhookBody {
  if (!value || typeof value !== "object") return false
  const { audience, notifications } = value as Partial<PushWebhookBody>
  return (audience === "team" || audience === "client") && Array.isArray(notifications)
}

export async function POST(request: Request) {
  const secret = process.env.PUSH_WEBHOOK_SECRET
  const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const privateKey = process.env.VAPID_PRIVATE_KEY
  if (!secret || !publicKey || !privateKey) {
    return Response.json({ error: "Push não configurado." }, { status: 503 })
  }

  const given = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? ""
  if (!sameSecret(given, secret)) return Response.json({ error: "Não autorizado." }, { status: 401 })

  const body: unknown = await request.json().catch(() => null)
  if (!isBody(body)) return Response.json({ error: "Corpo inválido." }, { status: 400 })

  const audience: PushAudience = body.audience
  const sends = body.notifications.flatMap((row) => {
    if (!row || typeof row !== "object" || !Array.isArray(row.subscriptions)) return []
    const payload = JSON.stringify(pushMessage(audience, row))
    return row.subscriptions.map((subscription) => ({ subscription, payload }))
  })

  const options = {
    vapidDetails: {
      subject: process.env.VAPID_SUBJECT || "https://admin.deumboop.com.br",
      publicKey,
      privateKey,
    },
    TTL: TTL_SECONDS,
    urgency: "high" as const,
  }

  const gone: string[] = []
  let sent = 0
  await Promise.all(
    sends.slice(0, MAX_SENDS).map(async ({ subscription, payload }) => {
      try {
        await webpush.sendNotification(
          { endpoint: subscription.endpoint, keys: { p256dh: subscription.p256dh, auth: subscription.auth } },
          payload,
          options
        )
        sent++
      } catch (error) {
        // 404/410: o aparelho tirou a permissão ou desinstalou o app.
        if (error instanceof WebPushError && (error.statusCode === 404 || error.statusCode === 410)) {
          gone.push(subscription.endpoint)
        } else {
          console.error(`[push] ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    })
  )

  if (gone.length > 0) {
    const supabase = await createClient()
    const { error } = await supabase.rpc("forget_push_endpoints", { p_secret: secret, p_endpoints: gone })
    if (error) console.error(`[push] limpeza: ${error.message}`)
  }

  return Response.json({ sent, gone: gone.length }, { headers: { "Cache-Control": "no-store" } })
}
