/*
 * O que a central de notificações faz no navegador: preferências (som e aviso
 * do sistema, por navegador), o som, o aviso com a aba em segundo plano e a
 * divisão entre abas (só uma anuncia cada aviso). Só roda no cliente.
 */

export interface NotificationPrefs {
  /** Som ao chegar aviso novo (padrão: ligado). */
  sound: boolean
  /** Aviso do navegador com a aba em segundo plano (padrão: desligado). */
  browser: boolean
}

export type BrowserPermission = NotificationPermission | "unsupported"

export const DEFAULT_PREFS: NotificationPrefs = { sound: true, browser: false }

const PREFS_KEY = "boop:notifications:prefs"
const ANNOUNCED_KEY = "boop:notifications:announced"
const ANNOUNCED_MAX = 100

/* ------------------------------------------------------------------ */
/* Preferências e permissão (useSyncExternalStore)                     */
/* ------------------------------------------------------------------ */

const listeners = new Set<() => void>()
let cachedPrefs: NotificationPrefs | null = null

function emit() {
  for (const listener of listeners) listener()
}

function onStorage(event: StorageEvent) {
  // Outra aba mudou as preferências.
  if (event.key === PREFS_KEY) {
    cachedPrefs = null
    emit()
  }
}

export function subscribeNotificationSettings(listener: () => void): () => void {
  listeners.add(listener)
  if (listeners.size === 1) window.addEventListener("storage", onStorage)
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) window.removeEventListener("storage", onStorage)
  }
}

function readPrefs(): NotificationPrefs {
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(PREFS_KEY) ?? "null")
    if (saved && typeof saved === "object") {
      const { sound, browser } = saved as Partial<Record<keyof NotificationPrefs, unknown>>
      return {
        sound: typeof sound === "boolean" ? sound : DEFAULT_PREFS.sound,
        browser: typeof browser === "boolean" ? browser : DEFAULT_PREFS.browser,
      }
    }
  } catch {
    // Sem localStorage (aba privada, bloqueado): fica o padrão.
  }
  return DEFAULT_PREFS
}

/** Sempre o mesmo objeto enquanto nada muda (exigência do useSyncExternalStore). */
export function getPrefs(): NotificationPrefs {
  cachedPrefs ??= readPrefs()
  return cachedPrefs
}

export function setPrefs(next: NotificationPrefs): void {
  cachedPrefs = next
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next))
  } catch {
    // Vale só nesta aba.
  }
  emit()
}

export function getBrowserPermission(): BrowserPermission {
  return "Notification" in window ? Notification.permission : "unsupported"
}

/** Pede a permissão (precisa vir de um clique). */
export async function requestBrowserPermission(): Promise<BrowserPermission> {
  if (!("Notification" in window)) return "unsupported"
  const result = await Notification.requestPermission()
  emit()
  return result
}

/* ------------------------------------------------------------------ */
/* Som                                                                 */
/* ------------------------------------------------------------------ */

let audio: AudioContext | null = null

/**
 * Os navegadores só deixam tocar som depois de um clique ou tecla na página:
 * o contexto de áudio nasce (ou volta) nesse momento.
 */
export function unlockSound(): void {
  try {
    audio ??= new AudioContext()
    if (audio.state === "suspended") void audio.resume()
  } catch {
    audio = null
  }
}

export function soundReady(): boolean {
  return audio?.state === "running"
}

/** Dois toques curtos e baixos, gerados na hora (sem arquivo de áudio). */
export function playChime(): void {
  if (!audio || audio.state !== "running") return
  const start = audio.currentTime
  ;[880, 1318.5].forEach((frequency, index) => {
    const oscillator = audio!.createOscillator()
    const gain = audio!.createGain()
    const at = start + index * 0.12
    oscillator.type = "sine"
    oscillator.frequency.value = frequency
    gain.gain.setValueAtTime(0.0001, at)
    gain.gain.exponentialRampToValueAtTime(0.16, at + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.0001, at + 0.35)
    oscillator.connect(gain).connect(audio!.destination)
    oscillator.start(at)
    oscillator.stop(at + 0.4)
  })
}

/* ------------------------------------------------------------------ */
/* Aviso do navegador                                                  */
/* ------------------------------------------------------------------ */

export function showBrowserNotification(input: { id: string; title: string; body: string | null; onClick: () => void }): void {
  try {
    const notice = new Notification(input.title, {
      body: input.body ?? undefined,
      // Mesmo aviso em duas abas aparece uma vez só.
      tag: input.id,
      icon: "/apple-icon.png",
    })
    notice.onclick = () => {
      window.focus()
      input.onClick()
      notice.close()
    }
  } catch {
    // Chrome no Android só mostra pelo service worker (push fica para depois).
  }
}

/**
 * Com várias abas abertas, só a primeira que vê um aviso toca o som e mostra
 * o aviso do navegador. Devolve os ids que esta aba deve anunciar.
 */
export function claimAnnouncements(ids: string[]): string[] {
  if (ids.length === 0) return ids
  try {
    const saved: unknown = JSON.parse(window.localStorage.getItem(ANNOUNCED_KEY) ?? "[]")
    const announced = Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : []
    const taken = new Set(announced)
    const mine = ids.filter((id) => !taken.has(id))
    if (mine.length > 0) {
      window.localStorage.setItem(ANNOUNCED_KEY, JSON.stringify([...announced, ...mine].slice(-ANNOUNCED_MAX)))
    }
    return mine
  } catch {
    return ids
  }
}
