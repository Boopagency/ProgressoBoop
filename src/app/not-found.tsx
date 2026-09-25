import Link from "next/link"

import { BoopMark } from "@/components/layout/boop-mark"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 text-center">
      <BoopMark className="size-9" />
      <h1 className="mt-5 text-lg font-semibold tracking-tight">Página não encontrada</h1>
      <p className="mt-1 text-sm text-muted-foreground">Esse endereço não existe no Boop Admin.</p>
      <Button asChild variant="outline" size="sm" className="mt-5">
        <Link href="/">Voltar para Hoje</Link>
      </Button>
    </main>
  )
}
