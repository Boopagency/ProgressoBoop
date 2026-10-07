"use client"

import { ArrowLeft, Download, Printer } from "lucide-react"
import Link from "next/link"

import { Button } from "@/components/ui/button"

/** Botões do relatório (somem na impressão). */
export function ReportActions({ excelHref, backHref }: { excelHref: string; backHref: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      <Button variant="ghost" size="sm" asChild className="gap-1.5 text-muted-foreground">
        <Link href={backHref}>
          <ArrowLeft className="size-3.5" />
          Voltar
        </Link>
      </Button>
      <Button variant="outline" size="sm" asChild className="gap-1.5">
        <a href={excelHref}>
          <Download className="size-3.5" />
          Excel
        </a>
      </Button>
      <Button size="sm" className="gap-1.5" onClick={() => window.print()}>
        <Printer className="size-3.5" />
        Imprimir ou salvar em PDF
      </Button>
    </div>
  )
}
