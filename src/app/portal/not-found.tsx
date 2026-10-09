import Link from "next/link"

import { Button } from "@/components/ui/button"

export default function PortalNotFound() {
  return (
    <div className="flex min-h-[50vh] flex-col items-center justify-center text-center">
      <h1 className="font-display text-lg font-semibold tracking-tight">Não encontramos este post</h1>
      <p className="mt-1 max-w-sm text-sm text-muted-foreground">
        Ele pode ter saído do seu portal ou o endereço está errado.
      </p>
      <Button asChild variant="outline" size="sm" className="mt-5">
        <Link href="/portal">Voltar para o início</Link>
      </Button>
    </div>
  )
}
