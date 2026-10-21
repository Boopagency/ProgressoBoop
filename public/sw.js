/*
 * Service worker do Boop Admin (equipe e portal): faz o app instalável e
 * mostra as notificações no celular (Web Push). Não guarda páginas nem dados
 * offline: tudo continua vindo do servidor, com a sessão da pessoa.
 *
 * O push vem de /api/push com { title, body, link, tag, badge } (veja
 * src/features/push/logic.ts). Tocar no aviso abre o link no app (ou na aba
 * que já está aberta). `badge` é o número de não lidas no ícone do app
 * (iPhone com o app na tela de início; no Android, o Chrome mostra um ponto).
 */

self.addEventListener("install", () => {
  self.skipWaiting()
})

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim())
})

self.addEventListener("push", (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { body: event.data ? event.data.text() : "" }
  }
  const title = data.title || "Boop"
  const link = typeof data.link === "string" && /^\/[^/\\]/.test(data.link) ? data.link : "/"

  const badge =
    typeof data.badge === "number" && "setAppBadge" in self.navigator
      ? (data.badge > 0 ? self.navigator.setAppBadge(data.badge) : self.navigator.clearAppBadge()).catch(() => {})
      : Promise.resolve()

  event.waitUntil(
    Promise.all([badge, self.registration.showNotification(title, {
      body: data.body || "",
      // O mesmo aviso do sino e do push aparece uma vez só.
      tag: data.tag || undefined,
      icon: "/icons/icon-192.png",
      badge: "/icons/badge-96.png",
      data: { link },
    })])
  )
})

self.addEventListener("notificationclick", (event) => {
  event.notification.close()
  const link = (event.notification.data && event.notification.data.link) || "/"
  const target = new URL(link, self.location.origin).href

  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: "window", includeUncontrolled: true })
      const open = windows.find((client) => new URL(client.url).origin === self.location.origin)
      if (open) {
        try {
          await open.focus()
          await open.navigate(target)
          return
        } catch {
          // Aba que o service worker não controla: abre uma nova.
        }
      }
      await self.clients.openWindow(target)
    })()
  )
})
