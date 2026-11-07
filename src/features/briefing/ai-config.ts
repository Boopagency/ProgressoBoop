import "server-only"

import type { BriefingAiKeys } from "@/features/briefing/jobs"

/**
 * Chaves da transcrição e do resumo do briefing, só no servidor (variáveis
 * de ambiente da Vercel, nunca no código): OPENAI_API_KEY (transcrição),
 * ANTHROPIC_API_KEY (resumo) e BRIEFING_JOBS_SECRET (a rota de jobs; o mesmo
 * valor de `briefing_jobs_secret` no Vault). Sem elas, o app compila, os
 * áudios ficam guardados e as transcrições, pendentes.
 */
export function briefingJobsSecret(): string | null {
  return process.env.BRIEFING_JOBS_SECRET?.trim() || null
}

export function briefingAiKeys(): BriefingAiKeys {
  return {
    openai: process.env.OPENAI_API_KEY?.trim() || null,
    anthropic: process.env.ANTHROPIC_API_KEY?.trim() || null,
  }
}
