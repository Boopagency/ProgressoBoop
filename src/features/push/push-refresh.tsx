"use client"

import { useEffect } from "react"

import { refreshPushSubscription } from "@/features/push/browser"
import { listenForInstall } from "@/features/push/install"
import { PushOnboarding } from "@/features/push/push-onboarding"

/**
 * Ao abrir o app logado (equipe e portal): registra o service worker, guarda
 * o convite de instalação do Android e renova a inscrição de push deste
 * aparelho. No celular, mostra o passo a passo de instalar e ativar os
 * avisos (PushOnboarding).
 */
export function PushRefresh() {
  useEffect(() => {
    const stop = listenForInstall()
    void refreshPushSubscription()
    return stop
  }, [])
  return <PushOnboarding />
}
