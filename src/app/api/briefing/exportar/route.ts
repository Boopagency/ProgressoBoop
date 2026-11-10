import type { NextRequest } from "next/server"

import { getSessionUser } from "@/features/auth/session"
import { briefingMarkdown, buildAnalysisSource } from "@/features/briefing/analysis-source"
import { isBriefingOpen, isBriefingPreparing } from "@/features/briefing/logic"
import { getTeamBriefing } from "@/features/briefing/team-queries"
import { isUuid } from "@/lib/utils"

/**
 * Baixa o briefing do cliente (`?cliente=`) em Markdown: análise, respostas,
 * resumos e transcrições. Só a equipe (os resumos não são do cliente).
 */
export async function GET(request: NextRequest) {
  const clientId = request.nextUrl.searchParams.get("cliente") ?? ""
  if (!isUuid(clientId)) return new Response("Briefing não encontrado.", { status: 404 })
  if (!(await getSessionUser())) return new Response("Faça login com uma conta da equipe.", { status: 401 })

  const state = await getTeamBriefing(clientId)
  const briefing = state.available ? state.briefing : null
  if (!briefing) return new Response("Briefing não encontrado.", { status: 404 })

  const submitted = !isBriefingOpen(briefing.status) && !isBriefingPreparing(briefing.status)
  const source = buildAnalysisSource(briefing, briefing.identification, submitted)
  const markdown = briefingMarkdown(source, briefing.analysis?.content ?? null, briefing.immersion)

  const name = `briefing-${source.brandName || "cliente"}.md`
  const ascii = name.normalize("NFD").replace(/[^\w.-]+/g, "-")
  return new Response(markdown, {
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Content-Disposition": `attachment; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(name)}`,
      "Cache-Control": "private, no-store",
    },
  })
}
