"use client"

import { ArrowLeft, Download, Printer } from "lucide-react"
import Link from "next/link"
import { useEffect } from "react"

import { Button } from "@/components/ui/button"

/**
 * Na impressão, o relatório sai sempre no tema claro (papel branco): com o
 * escuro ligado, as cores do texto e dos gráficos seriam as do escuro sobre o
 * branco. Tira a classe `dark` antes de imprimir e devolve depois.
 */
function usePrintInLight() {
  useEffect(() => {
    const root = document.documentElement
    let wasDark = false
    const before = () => {
      wasDark = root.classList.contains("dark")
      if (wasDark) root.classList.remove("dark")
    }
    const after = () => {
      if (wasDark) root.classList.add("dark")
      wasDark = false
    }
    window.addEventListener("beforeprint", before)
    window.addEventListener("afterprint", after)
    return () => {
      window.removeEventListener("beforeprint", before)
      window.removeEventListener("afterprint", after)
    }
  }, [])
}

/** Botões do relatório (somem na impressão). */
export function ReportActions({ excelHref, backHref }: { excelHref: string; backHref: string }) {
  usePrintInLight()
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
