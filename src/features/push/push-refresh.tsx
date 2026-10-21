"use client"

import { useEffect } from "react"

import { refreshPushSubscription } from "@/features/push/browser"
import { listenForInstall } from "@/features/push/install"

/**
 * Ao abrir o app logado (equipe e portal): registra o service worker, guarda
 * o convite de instalação do Android e renova a inscrição de push deste
 * aparelho. Não desenha nada.
 */
export function PushRefresh() {
  useEffect(() => {
    const stop = listenForInstall()
    void refreshPushSubscription()
    return stop
  }, [])
  return null
}
