import type { NextRequest } from "next/server"

import { getSessionUser } from "@/features/auth/session"
import { loadReport } from "@/features/reports/load"
import { reportSheets } from "@/features/reports/workbook"
import { buildWorkbook } from "@/lib/xlsx"

/**
 * Excel de um relatório (período, seções, filtros). Só para quem está logado;
 * os dados vêm com a sessão da pessoa (RLS), como nas telas.
 */
export async function GET(request: NextRequest) {
  const user = await getSessionUser()
  if (!user) return new Response("Faça login para exportar.", { status: 401 })

  const params = Object.fromEntries(request.nextUrl.searchParams.entries())
  const { input, clientName } = await loadReport(params, user)
  const title = `Boop — ${clientName ? `${clientName} — ` : ""}${input.period.label}`
  const workbook = buildWorkbook(reportSheets(input), { title, author: input.generatedBy })
  const slug = `${clientName ? `${clientName}-` : ""}${input.period.short}`
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-zA-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .toLowerCase()

  return new Response(new Blob([workbook as BlobPart]), {
    headers: {
      "Content-Type": "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "Content-Disposition": `attachment; filename="boop-relatorio-${slug}.xlsx"`,
      "Cache-Control": "private, no-store",
    },
  })
}
