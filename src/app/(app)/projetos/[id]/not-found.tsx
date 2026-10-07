import Link from "next/link"

import { PageContainer } from "@/components/layout/page"
import { Button } from "@/components/ui/button"

export default function ProjectNotFound() {
  return (
    <PageContainer className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-sm text-center">
        <h1 className="font-display text-lg font-semibold tracking-tight">Projeto não encontrado</h1>
        <p className="mt-1 text-sm text-muted-foreground">Ele pode ter sido excluído.</p>
        <Button asChild variant="outline" size="sm" className="mt-5">
          <Link href="/projetos">Ver todos os projetos</Link>
        </Button>
      </div>
    </PageContainer>
  )
}
