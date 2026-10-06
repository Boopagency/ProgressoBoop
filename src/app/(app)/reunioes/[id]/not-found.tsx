import Link from "next/link"

import { PageContainer } from "@/components/layout/page"
import { Button } from "@/components/ui/button"

export default function MeetingNotFound() {
  return (
    <PageContainer className="flex min-h-[60vh] items-center justify-center">
      <div className="max-w-sm text-center">
        <h1 className="font-display text-lg font-semibold tracking-tight">Reunião não encontrada</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          O registro pode ter sido excluído, ou o evento saiu do calendário.
        </p>
        <Button asChild variant="outline" size="sm" className="mt-5">
          <Link href="/reunioes">Ver todas as reuniões</Link>
        </Button>
      </div>
    </PageContainer>
  )
}
