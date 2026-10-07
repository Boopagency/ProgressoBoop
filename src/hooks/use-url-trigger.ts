"use client"

import { usePathname, useSearchParams } from "next/navigation"
import { useEffect, useState } from "react"

/**
 * Reage a `?novo=<marca>` na URL (ações da busca geral, como "Nova reunião"):
 * chama `onTrigger` uma vez para cada marca nova e tira o parâmetro da URL,
 * para não reabrir ao recarregar.
 */
export function useUrlTrigger(onTrigger: () => void, param = "novo") {
  const searchParams = useSearchParams()
  const pathname = usePathname()
  const value = searchParams.get(param)
  const [seen, setSeen] = useState<string | null>(null)

  // Ajuste de estado durante a renderização (padrão do React para reagir a
  // uma mudança de props), sem efeito e sem renderização extra na tela.
  if (value && value !== seen) {
    setSeen(value)
    onTrigger()
  }

  useEffect(() => {
    if (!value) return
    const params = new URLSearchParams(window.location.search)
    params.delete(param)
    const rest = params.toString()
    window.history.replaceState(null, "", rest ? `${pathname}?${rest}` : pathname)
  }, [value, param, pathname])
}
