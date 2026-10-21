/*
 * O convite de instalação do Chrome/Android (`beforeinstallprompt`). O evento
 * chega logo que a página abre, antes de a pessoa abrir Minha conta, então
 * fica guardado aqui até o botão "Instalar o app" usá-lo. Só roda no cliente.
 */

interface InstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>
}

let deferred: InstallPromptEvent | null = null
const listeners = new Set<() => void>()

function emit() {
  for (const listener of listeners) listener()
}

/** Começa a escutar o convite (uma vez, ao abrir o app). */
export function listenForInstall(): () => void {
  function onPrompt(event: Event) {
    event.preventDefault()
    deferred = event as InstallPromptEvent
    emit()
  }
  function onInstalled() {
    deferred = null
    emit()
  }
  window.addEventListener("beforeinstallprompt", onPrompt)
  window.addEventListener("appinstalled", onInstalled)
  return () => {
    window.removeEventListener("beforeinstallprompt", onPrompt)
    window.removeEventListener("appinstalled", onInstalled)
  }
}

export function subscribeInstall(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

export function canInstall(): boolean {
  return deferred !== null
}

export async function promptInstall(): Promise<void> {
  const event = deferred
  if (!event) return
  deferred = null
  emit()
  await event.prompt()
}
