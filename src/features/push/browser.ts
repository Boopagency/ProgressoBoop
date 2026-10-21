import { removePushSubscription, savePushSubscription } from "@/features/push/actions"
import { deviceLabel, REFRESH_EVERY_MS, vapidKeyBytes } from "@/features/push/logic"

/*
 * Notificações no celular, do lado do navegador: o service worker
 * (public/sw.js), a permissão e a inscrição deste aparelho. Só roda no
 * cliente. No iPhone, o push só existe com o app instalado na tela de início
 * (iOS 16.4 ou mais novo).
 */

const SW_URL = "/sw.js"
const REFRESHED_KEY = "boop:push:refreshed"

export type PushSupport =
  /** Pode ativar aqui. */
  | "ready"
  /** iPhone/iPad no Safari: precisa instalar o app primeiro. */
  | "install-first"
  /** Navegador sem push. */
  | "unsupported"
  /** O app ainda está sem as chaves do push (variáveis da Vercel). */
  | "not-configured"

export function isStandalone(): boolean {
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (navigator as Navigator & { standalone?: boolean }).standalone === true
  )
}

export function isAppleMobile(): boolean {
  // O iPad novo se apresenta como Mac; o toque denuncia.
  return /iPhone|iPad|iPod/.test(navigator.userAgent) || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
}

export function isAndroid(): boolean {
  return /Android/.test(navigator.userAgent)
}

function vapidPublicKey(): string | null {
  return process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY || null
}

export function pushSupport(): PushSupport {
  const hasPush = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window
  if (!hasPush) return isAppleMobile() && !isStandalone() ? "install-first" : "unsupported"
  return vapidPublicKey() ? "ready" : "not-configured"
}

/** Registra o service worker (abrir o app, em qualquer tela). */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null
  try {
    return await navigator.serviceWorker.register(SW_URL, { scope: "/", updateViaCache: "none" })
  } catch {
    return null
  }
}

async function registration(): Promise<ServiceWorkerRegistration | null> {
  if (!("serviceWorker" in navigator)) return null
  return (await navigator.serviceWorker.getRegistration("/")) ?? (await registerServiceWorker())
}

export async function currentSubscription(): Promise<PushSubscription | null> {
  if (!("PushManager" in window)) return null
  const reg = await registration()
  return reg ? reg.pushManager.getSubscription() : null
}

function payload(subscription: PushSubscription) {
  return { ...subscription.toJSON(), device: deviceLabel(navigator.userAgent) }
}

function markRefreshed(): void {
  try {
    window.localStorage.setItem(REFRESHED_KEY, String(Date.now()))
  } catch {
    // Sem localStorage: renova de novo na próxima vez.
  }
}

/** Pede a permissão (precisa vir de um toque) e inscreve este aparelho. */
export async function enablePush(): Promise<{ ok: true } | { ok: false; error: string }> {
  const key = vapidPublicKey()
  if (!key) return { ok: false, error: "As notificações no celular ainda não foram configuradas." }
  const permission = await Notification.requestPermission()
  if (permission !== "granted") {
    return {
      ok: false,
      error:
        permission === "denied"
          ? "As notificações estão bloqueadas para a Boop. Libere nos ajustes do aparelho e tente de novo."
          : "Toque em Permitir para receber as notificações.",
    }
  }
  const reg = await registration()
  if (!reg) return { ok: false, error: "Este navegador não aceita notificações." }
  await navigator.serviceWorker.ready
  try {
    const subscription =
      (await reg.pushManager.getSubscription()) ??
      (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: vapidKeyBytes(key) }))
    const result = await savePushSubscription(payload(subscription))
    if (!result.ok) return result
    markRefreshed()
    return { ok: true }
  } catch {
    return { ok: false, error: "Não foi possível ativar as notificações neste aparelho." }
  }
}

/** Tira as notificações deste aparelho. */
export async function disablePush(): Promise<void> {
  const subscription = await currentSubscription()
  if (!subscription) return
  const endpoint = subscription.endpoint
  await subscription.unsubscribe().catch(() => false)
  await removePushSubscription(endpoint)
}

/**
 * Ao sair da conta: o aparelho deixa de receber os avisos dela (outra pessoa
 * pode entrar nele depois). Nunca impede a saída.
 */
export async function forgetThisDevice(): Promise<void> {
  try {
    await disablePush()
  } catch {
    // Sai de qualquer jeito; a inscrição antiga vence sozinha.
  }
}

/**
 * Ao abrir o app logado: renova a inscrição deste aparelho no banco (no
 * máximo uma vez por dia), o que também a passa para quem está logado agora
 * e cobre a troca de endereço que o navegador às vezes faz.
 */
export async function refreshPushSubscription(): Promise<void> {
  try {
    await registerServiceWorker()
    if (pushSupport() !== "ready" || Notification.permission !== "granted") return
    const last = Number(window.localStorage.getItem(REFRESHED_KEY) ?? 0)
    if (Date.now() - last < REFRESH_EVERY_MS) return
    const subscription = await currentSubscription()
    if (!subscription) return
    const result = await savePushSubscription(payload(subscription))
    if (result.ok) markRefreshed()
  } catch {
    // Tenta de novo na próxima vez que o app abrir.
  }
}
