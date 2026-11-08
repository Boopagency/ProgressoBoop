"use client"

import { AlertTriangle, Check, ChevronDown, Copy, Loader2, RefreshCw, Sparkles } from "lucide-react"
import { useRouter } from "next/navigation"
import { useEffect, useState, useTransition } from "react"
import { toast } from "sonner"

import { PanelCard } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { requestBriefingAnalysis } from "@/features/briefing/analysis-actions"
import {
  ANALYSIS_GAP_LABEL,
  analysisToText,
  isAnalysisGivenUp,
  isAnalysisRunning,
  type AnalysisContent,
  type AnalysisReadiness,
  type TeamBriefingAnalysis,
} from "@/features/briefing/analysis-logic"
import { formatShortDate, toDateKey, toTimeLabel } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Enquanto a análise roda, a tela pergunta de novo a cada tanto. */
const REFRESH_MS = 15_000

/**
 * Análise do briefing inteiro, só da equipe (issue #108): pontos importantes,
 * leitura do posicionamento, contradições, lacunas, perguntas para a imersão
 * e uma primeira proposta de pilares. Sai sozinha quando o cliente envia; antes
 * disso, "Gerar análise agora" com boa parte das obrigatórias respondida.
 * "Copiar como contexto" leva a análise em texto limpo.
 */
export function BriefingAnalysisPanel({
  clientId,
  brandName,
  analysis,
  readiness,
  submitted,
  today,
  demo = false,
}: {
  clientId: string
  brandName: string
  analysis: TeamBriefingAnalysis | null
  readiness: AnalysisReadiness
  /** O cliente já enviou o briefing. */
  submitted: boolean
  today: DateKey
  /** Vitrine: nada vai ao servidor. */
  demo?: boolean
}) {
  const router = useRouter()
  const [isPending, startTransition] = useTransition()
  const [open, setOpen] = useState(true)
  const [copied, setCopied] = useState(false)
  const running = isAnalysisRunning(analysis)
  const content = analysis?.content ?? null

  useEffect(() => {
    if (!running || demo) return
    const timer = window.setInterval(() => router.refresh(), REFRESH_MS)
    return () => window.clearInterval(timer)
  }, [running, demo, router])

  function request() {
    if (demo) {
      toast.info("Na vitrine, nada é enviado.")
      return
    }
    startTransition(async () => {
      const result = await requestBriefingAnalysis(clientId)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      toast.success("Análise pedida. Leva uns 2 minutos.")
      router.refresh()
    })
  }

  async function copy() {
    if (!content) return
    try {
      await navigator.clipboard.writeText(analysisToText(content, brandName))
      setCopied(true)
      toast.success("Análise copiada como contexto.")
      window.setTimeout(() => setCopied(false), 2000)
    } catch {
      toast.error("Não deu para copiar. Tente de novo.")
    }
  }

  const failed = analysis?.status === "failed"
  const givenUp = isAnalysisGivenUp(analysis)
  const requestLabel = content ? "Refazer análise" : failed ? "Tentar de novo" : "Gerar análise agora"
  const showRequest = !running && (!content || analysis?.stale || givenUp)

  return (
    <PanelCard
      id="briefing-analise"
      className={cn(content && "border-glow/30")}
      title={
        <>
          <Sparkles className="size-4 text-brand-ink" aria-hidden="true" />
          Análise do briefing
        </>
      }
      action={
        <div className="flex items-center gap-1.5">
          {content ? (
            <Button variant="outline" size="sm" className="gap-1.5 shadow-none" onClick={copy}>
              {copied ? <Check className="size-3.5" /> : <Copy className="size-3.5" />}
              <span className="hidden sm:inline">Copiar como contexto</span>
              <span className="sm:hidden">Copiar</span>
            </Button>
          ) : null}
          {content ? (
            <Button
              variant="ghost"
              size="icon"
              className="size-8"
              aria-expanded={open}
              aria-controls="briefing-analise-corpo"
              aria-label={open ? "Recolher a análise" : "Abrir a análise"}
              onClick={() => setOpen((value) => !value)}
            >
              <ChevronDown className={cn("size-4 transition-transform", !open && "-rotate-90")} />
            </Button>
          ) : null}
        </div>
      }
    >
      <StatusLine
        analysis={analysis}
        readiness={readiness}
        submitted={submitted}
        today={today}
        action={
          showRequest ? (
            <Button
              size="sm"
              variant={content ? "outline" : "default"}
              className={cn("shrink-0 gap-1.5", content && "shadow-none")}
              disabled={isPending || !readiness.canRequest}
              onClick={request}
            >
              {isPending ? <Loader2 className="size-3.5 animate-spin" /> : content ? <RefreshCw className="size-3.5" /> : <Sparkles className="size-3.5" />}
              {requestLabel}
            </Button>
          ) : null
        }
      />

      {content && open ? (
        <div id="briefing-analise-corpo">
          <AnalysisBody content={content} />
        </div>
      ) : null}
    </PanelCard>
  )
}

/** A faixa de cima: o que está acontecendo e o botão. */
function StatusLine({
  analysis,
  readiness,
  submitted,
  today,
  action,
}: {
  analysis: TeamBriefingAnalysis | null
  readiness: AnalysisReadiness
  submitted: boolean
  today: DateKey
  action: React.ReactNode
}) {
  const running = isAnalysisRunning(analysis)
  const content = analysis?.content ?? null
  let tone: "muted" | "glow" | "warning" | "error" = "muted"
  let message: React.ReactNode

  if (running) {
    tone = "glow"
    message = (
      <>
        <Loader2 className="size-3.5 shrink-0 animate-spin" aria-hidden="true" />
        {analysis?.status === "pending" && !submitted
          ? "Na fila. Começa assim que os áudios e os resumos terminarem."
          : "Lendo o briefing inteiro. Leva uns 2 minutos; a tela se atualiza sozinha."}
      </>
    )
  } else if (analysis?.status === "failed") {
    tone = "error"
    message = (
      <>
        <AlertTriangle className="size-3.5 shrink-0" aria-hidden="true" />
        {isAnalysisGivenUp(analysis)
          ? `A análise não saiu${analysis.error ? `: ${analysis.error.charAt(0).toLowerCase()}${analysis.error.slice(1)}` : "."}`
          : "A análise falhou e vai tentar de novo sozinha em instantes."}
      </>
    )
  } else if (content && analysis?.stale) {
    tone = "warning"
    message = (
      <>
        <RefreshCw className="size-3.5 shrink-0" aria-hidden="true" />
        As respostas mudaram depois desta análise.
      </>
    )
  } else if (content && analysis?.finished_at) {
    message = (
      <>
        {analysis.origin === "submitted" ? "Feita no envio do briefing" : "Pedida pela equipe"} ·{" "}
        {formatShortDate(toDateKey(analysis.finished_at), today)}, {toTimeLabel(analysis.finished_at)}
        {!submitted ? " · leitura parcial" : ""}
      </>
    )
  } else if (submitted) {
    message = "A análise sai sozinha alguns minutos depois do envio."
  } else if (readiness.canRequest) {
    message = `Com ${readiness.requiredAnswered} de ${readiness.requiredTotal} obrigatórias respondidas, dá para gerar uma leitura parcial. Ela sai sozinha quando o cliente enviar.`
  } else {
    message =
      readiness.requiredTotal === 0
        ? "A análise sai sozinha quando o cliente enviar o briefing."
        : `A análise sai sozinha quando o cliente enviar. Antes disso, com 60% das obrigatórias respondidas (faltam ${readiness.missingForCut}), dá para gerar uma leitura parcial.`
  }

  return (
    <div
      className={cn(
        "flex flex-col gap-3 px-5 py-3.5 sm:flex-row sm:items-center sm:justify-between",
        content && "border-b border-border"
      )}
    >
      <p
        role={running ? "status" : undefined}
        className={cn(
          "flex items-center gap-2 text-[13px] leading-5",
          tone === "muted" && "text-muted-foreground",
          tone === "glow" && "text-brand-ink",
          tone === "warning" && "text-warning-ink",
          tone === "error" && "text-destructive"
        )}
      >
        {message}
      </p>
      {action}
    </div>
  )
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="eyebrow mb-2.5 text-muted-foreground">{children}</h3>
}

function AnalysisBody({ content }: { content: AnalysisContent }) {
  const { positioning } = content
  return (
    <div className="divide-y divide-border">
      <div className="grid gap-6 px-5 py-5 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-8">
        <section>
          <SectionTitle>Pontos importantes</SectionTitle>
          <ul className="space-y-2">
            {content.key_points.map((point, index) => (
              <li key={index} className="flex gap-2.5 text-[14px] leading-6 text-foreground">
                <span aria-hidden="true" className="mt-[9px] size-1.5 shrink-0 rounded-full bg-glow" />
                <span>{point}</span>
              </li>
            ))}
          </ul>
        </section>

        <section>
          <SectionTitle>Leitura do posicionamento</SectionTitle>
          <p className="text-[15px] leading-6 font-medium text-foreground">{positioning.summary}</p>
          <dl className="mt-3 space-y-2.5">
            {[
              ["O que é", positioning.what],
              ["Para quem", positioning.for_whom],
              ["Contra o quê", positioning.against],
            ]
              .filter(([, text]) => text)
              .map(([label, text]) => (
                <div key={label} className="grid gap-0.5 sm:grid-cols-[96px_minmax(0,1fr)] sm:gap-3">
                  <dt className="eyebrow pt-0.5 text-[10.5px] text-subtle-foreground">{label}</dt>
                  <dd className="text-[13.5px] leading-5 text-muted-foreground">{text}</dd>
                </div>
              ))}
          </dl>
        </section>
      </div>

      <div className="grid gap-6 px-5 py-5 lg:grid-cols-2 lg:gap-8">
        <section>
          <SectionTitle>Contradições</SectionTitle>
          {content.contradictions.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nenhuma contradição entre as respostas.</p>
          ) : (
            <ul className="space-y-3">
              {content.contradictions.map((item, index) => (
                <li key={index} className="rounded-xl border border-warning/30 bg-warning/[0.06] px-3.5 py-3">
                  <p className="flex items-start gap-2 text-[13.5px] leading-5 font-medium text-foreground">
                    <AlertTriangle className="mt-0.5 size-3.5 shrink-0 text-warning-ink" aria-hidden="true" />
                    {item.title}
                  </p>
                  {item.detail ? <p className="mt-1 pl-5.5 text-[13px] leading-5 text-muted-foreground">{item.detail}</p> : null}
                  {item.questions.length > 0 ? (
                    <p className="mt-1.5 pl-5.5 text-xs leading-4 text-subtle-foreground">{item.questions.join(" · ")}</p>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <SectionTitle>Lacunas e respostas vagas</SectionTitle>
          {content.gaps.length === 0 ? (
            <p className="text-[13px] text-muted-foreground">Nenhuma lacuna.</p>
          ) : (
            <ul className="space-y-2.5">
              {content.gaps.map((gap, index) => (
                <li key={index} className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-2.5">
                  <span className="w-fit shrink-0 rounded-full border border-border px-2 py-px text-[11px] font-medium text-muted-foreground">
                    {ANALYSIS_GAP_LABEL[gap.kind]}
                  </span>
                  <p className="text-[13px] leading-5">
                    <span className="text-foreground">{gap.question}</span>
                    {gap.note ? <span className="text-muted-foreground"> — {gap.note}</span> : null}
                  </p>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>

      <section className="px-5 py-5">
        <SectionTitle>Perguntas para a reunião de imersão</SectionTitle>
        <ol className="grid gap-x-8 gap-y-3 lg:grid-cols-2">
          {content.meeting_questions.map((item, index) => (
            <li key={index} className="flex gap-3">
              <span className="display-number w-5 shrink-0 text-right text-[15px] leading-6 text-brand-ink tabular-nums">{index + 1}</span>
              <div className="min-w-0">
                <p className="text-[14px] leading-6 text-foreground">{item.question}</p>
                {item.why ? <p className="text-[12.5px] leading-5 text-muted-foreground">{item.why}</p> : null}
              </div>
            </li>
          ))}
        </ol>
      </section>

      <section className="px-5 py-5">
        <SectionTitle>Pilares de conteúdo · primeira proposta</SectionTitle>
        <div className="grid gap-3 sm:grid-cols-2">
          {content.content_pillars.map((pillar, index) => (
            <article key={index} className="rounded-xl border border-border bg-background/40 px-4 py-3.5">
              <h4 className="text-[14px] font-semibold tracking-tight text-foreground">{pillar.name}</h4>
              {pillar.description ? <p className="mt-1 text-[13px] leading-5 text-muted-foreground">{pillar.description}</p> : null}
              {pillar.why ? (
                <p className="mt-2.5 border-t border-border pt-2.5 text-[12.5px] leading-5 text-muted-foreground">
                  <span className="font-medium text-brand-ink">Por quê: </span>
                  {pillar.why}
                </p>
              ) : null}
            </article>
          ))}
        </div>
      </section>
    </div>
  )
}
