"use client"

import { RotateCw, TriangleAlert } from "lucide-react"
import { useEffect } from "react"

import { PageContainer } from "@/components/layout/page"
import { Button } from "@/components/ui/button"

export default function AppError({
  error,
  retry,
}: {
  error: Error & { digest?: string }
  retry: () => void
}) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <PageContainer className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-sm text-center">
        <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-muted">
          <TriangleAlert className="size-5 text-muted-foreground" />
        </div>
        <h1 className="mt-4 text-base font-semibold">Não foi possível carregar esta tela</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Pode ter sido uma falha momentânea de conexão. Tente de novo.
        </p>
        <Button variant="outline" size="sm" className="mt-5" onClick={() => retry()}>
          <RotateCw />
          Tentar de novo
        </Button>
      </div>
    </PageContainer>
  )
}
