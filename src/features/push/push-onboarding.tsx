"use client"

import { BellRing, Download } from "lucide-react"
import { useEffect, useState, useSyncExternalStore, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Sheet, SheetContent, SheetDescription, SheetFooter, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { enablePush, isAndroid, isAppleMobile, isStandalone, pushSupport } from "@/features/push/browser"
import { canInstall, promptInstall, subscribeInstall } from "@/features/push/install"
import { InstallTutorial } from "@/features/push/install-tutorial"

type Step = "install" | "enable"

const DISMISSED_KEY = "boop:onboarding:"
/** Espera a tela abrir antes de subir o aviso. */
const SHOW_AFTER_MS = 1500

function dismissed(step: Step): boolean {
  try {
    return window.localStorage.getItem(DISMISSED_KEY + step) !== null
  } catch {
    return false
  }
}

function dismiss(step: Step): void {
  try {
    window.localStorage.setItem(DISMISSED_KEY + step, String(Date.now()))
  } catch {
    // Sem localStorage: aparece de novo na próxima vez.
  }
}

/**
 * O passo a passo do app no celular (equipe e portal), uma vez por etapa:
 * no navegador, como pôr a Boop na tela de início; aberta pelo ícone, o botão
 * de ativar os avisos. "Agora não" não mostra de novo aquela etapa (fica tudo
 * em Minha conta). No computador não aparece.
 */
export function PushOnboarding() {
  const [step, setStep] = useState<Step | null>(null)
  const [apple, setApple] = useState(false)
  const installable = useSyncExternalStore(subscribeInstall, canInstall, () => false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    const timer = window.setTimeout(() => {
      const isApple = isAppleMobile()
      if (!isApple && !isAndroid()) return
      let next: Step | null = null
      if (!isStandalone()) next = "install"
      else if (pushSupport() === "ready" && Notification.permission === "default") next = "enable"
      if (!next || dismissed(next)) return
      setApple(isApple)
      setStep(next)
    }, SHOW_AFTER_MS)
    return () => window.clearTimeout(timer)
  }, [])

  function close() {
    if (step) dismiss(step)
    setStep(null)
  }

  function turnOn() {
    setError(null)
    startTransition(async () => {
      const result = await enablePush()
      if (!result.ok) {
        setError(result.error)
        return
      }
      close()
      toast.success("Pronto: este aparelho vai receber as notificações.")
    })
  }

  return (
    <Sheet open={step !== null} onOpenChange={(open) => {
        if (!open) close()
      }}>
      <SheetContent
        side="bottom"
        className="max-h-[90svh] gap-0 overflow-y-auto rounded-t-xl pb-[env(safe-area-inset-bottom)]"
        onOpenAutoFocus={(event) => event.preventDefault()}
      >
        {step === "install" ? (
          <>
            <SheetHeader>
              <SheetTitle>Tenha a Boop no celular</SheetTitle>
              <SheetDescription>
                Instale o app na tela de início para abrir com um toque e receber os avisos (mensagens, aprovações,
                tarefas) mesmo com ele fechado.
              </SheetDescription>
            </SheetHeader>
            {installable ? null : (
              <div className="px-4">
                <InstallTutorial apple={apple} />
              </div>
            )}
            <SheetFooter>
              {installable ? (
                <Button type="button" onClick={() => void promptInstall().then(close)}>
                  <Download />
                  Instalar o app
                </Button>
              ) : null}
              <Button type="button" variant="ghost" onClick={close}>
                Agora não
              </Button>
            </SheetFooter>
          </>
        ) : step === "enable" ? (
          <>
            <SheetHeader>
              <SheetTitle>Ative as notificações</SheetTitle>
              <SheetDescription>
                Receba no celular os mesmos avisos do sino, mesmo com o app fechado. Toque em Ativar e depois em
                Permitir.
              </SheetDescription>
            </SheetHeader>
            {error ? (
              <p role="alert" className="px-4 text-sm text-destructive">
                {error}
              </p>
            ) : null}
            <SheetFooter>
              <Button type="button" disabled={isPending} onClick={turnOn}>
                <BellRing />
                {isPending ? "Ativando…" : "Ativar"}
              </Button>
              <Button type="button" variant="ghost" onClick={close}>
                Agora não
              </Button>
            </SheetFooter>
          </>
        ) : null}
      </SheetContent>
    </Sheet>
  )
}
