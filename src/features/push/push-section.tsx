"use client"

import { BellOff, BellRing, Download, Share } from "lucide-react"
import { useEffect, useState, useSyncExternalStore, useTransition } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import {
  currentSubscription,
  disablePush,
  enablePush,
  isAndroid,
  isAppleMobile,
  isStandalone,
  pushSupport,
  type PushSupport,
} from "@/features/push/browser"
import { canInstall, promptInstall, subscribeInstall } from "@/features/push/install"

type Status = "loading" | "on" | "off" | "blocked"

interface DeviceState {
  support: PushSupport
  status: Status
  standalone: boolean
  apple: boolean
  android: boolean
}

/**
 * Notificações no celular, em Minha conta (equipe e portal): ativar e
 * desativar neste aparelho e, quando falta, como instalar o app. No iPhone o
 * push só funciona com o app na tela de início.
 */
export function PushSection() {
  const [state, setState] = useState<DeviceState | null>(null)
  const installable = useSyncExternalStore(subscribeInstall, canInstall, () => false)
  const [error, setError] = useState<string | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    let alive = true
    const support = pushSupport()
    const base = { support, standalone: isStandalone(), apple: isAppleMobile(), android: isAndroid() }
    void (async () => {
      let status: Status = "off"
      if (support === "ready") {
        if (Notification.permission === "denied") status = "blocked"
        else if (Notification.permission === "granted" && (await currentSubscription())) status = "on"
      }
      if (alive) setState({ ...base, status })
    })()
    return () => {
      alive = false
    }
  }, [])

  function turnOn() {
    setError(null)
    startTransition(async () => {
      const result = await enablePush()
      if (!result.ok) {
        setError(result.error)
        if (Notification.permission === "denied") setState((s) => (s ? { ...s, status: "blocked" } : s))
        return
      }
      setState((s) => (s ? { ...s, status: "on" } : s))
      toast.success("Pronto: este aparelho vai receber as notificações.")
    })
  }

  function turnOff() {
    setError(null)
    startTransition(async () => {
      try {
        await disablePush()
        setState((s) => (s ? { ...s, status: "off" } : s))
        toast.success("Este aparelho não recebe mais as notificações.")
      } catch {
        setError("Não foi possível desativar. Tente de novo.")
      }
    })
  }

  return (
    <section className="space-y-2" aria-label="Notificações no celular">
      <h3 className="text-sm leading-none font-medium">Notificações no celular</h3>
      {state === null ? (
        <p className="text-sm text-muted-foreground">Verificando este aparelho…</p>
      ) : state.support === "install-first" ? (
        <InstallSteps apple />
      ) : state.support === "not-configured" ? (
        <p className="text-sm text-muted-foreground">As notificações no celular estão quase prontas: falta só a configuração da Boop.</p>
      ) : state.support === "unsupported" ? (
        <p className="text-sm text-muted-foreground">
          Este navegador não recebe notificações. No celular, use o Safari (iPhone) ou o Chrome (Android).
        </p>
      ) : (
        <>
          <p className="text-sm text-muted-foreground">
            {state.status === "on"
              ? "Ativadas neste aparelho. Você recebe aqui os mesmos avisos do sino, mesmo com o app fechado."
              : state.status === "blocked"
                ? "As notificações estão bloqueadas para a Boop neste aparelho. Libere nos ajustes do celular (ou do navegador) e volte aqui."
                : "Receba aqui os mesmos avisos do sino (mensagens, aprovações, tarefas), mesmo com o app fechado."}
          </p>
          <div className="flex flex-wrap gap-2">
            {state.status === "on" ? (
              <Button type="button" variant="outline" size="sm" disabled={isPending} onClick={turnOff}>
                <BellOff />
                {isPending ? "Desativando…" : "Desativar neste aparelho"}
              </Button>
            ) : (
              <Button type="button" size="sm" disabled={isPending || state.status === "blocked"} onClick={turnOn}>
                <BellRing />
                {isPending ? "Ativando…" : "Ativar neste aparelho"}
              </Button>
            )}
            {installable && !state.standalone ? (
              <Button type="button" variant="outline" size="sm" onClick={() => void promptInstall()}>
                <Download />
                Instalar o app
              </Button>
            ) : null}
          </div>
          {!state.standalone && !installable && (state.android || state.apple) ? (
            <InstallSteps apple={state.apple} />
          ) : null}
        </>
      )}
      {error ? (
        <p role="alert" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </section>
  )
}

/** Como pôr o app na tela de início (o ícone da Boop abre direto, sem o navegador). */
function InstallSteps({ apple }: { apple: boolean }) {
  return (
    <div className="space-y-1.5 rounded-md border bg-muted/40 p-3 text-sm">
      <p className="font-medium">{apple ? "Instale o app no iPhone" : "Instale o app no Android"}</p>
      {apple ? (
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>Abra este endereço no Safari.</li>
          <li>
            Toque em Compartilhar <Share className="inline size-3.5 align-[-2px]" aria-label="(ícone de compartilhar)" />.
          </li>
          <li>Toque em “Adicionar à Tela de Início” e em Adicionar.</li>
          <li>Abra a Boop pelo ícone novo, entre em Minha conta e ative as notificações.</li>
        </ol>
      ) : (
        <ol className="list-decimal space-y-1 pl-5 text-muted-foreground">
          <li>No Chrome, toque no menu ⋮ (canto de cima).</li>
          <li>Toque em “Instalar app” (ou “Adicionar à tela inicial”).</li>
          <li>Abra a Boop pelo ícone novo.</li>
        </ol>
      )}
      {apple ? <p className="text-xs text-muted-foreground">Precisa do iOS 16.4 ou mais novo.</p> : null}
    </div>
  )
}
