"use client"

import { AudioLines, ChevronDown, Clock, FileText, Flag, Sparkles } from "lucide-react"
import { useState } from "react"

import { PanelCard } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import {
  briefingFileUrl,
  describeAnswer,
  formatDuration,
  formatFileSize,
  type AnswerPart,
  type BriefingAiStatus,
  type BriefingFile,
  type BriefingItem,
  type BriefingSection,
  type TeamBriefingAudio,
} from "@/features/briefing/team-logic"
import { formatShortDate } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Respostas do briefing por bloco, como a equipe lê antes da imersão: o
 * resumo da IA em destaque, a resposta fechada legível, os arquivos, e o
 * áudio original com a transcrição num clique. A pergunta mostrada é a cópia
 * guardada na resposta (editar a pergunta depois não muda o que foi
 * respondido). Puladas ficam em amarelo, para levar à reunião.
 */
export function BriefingAnswers({
  sections,
  today,
  fileUrl = briefingFileUrl,
}: {
  sections: BriefingSection[]
  today: DateKey
  /** URL de um arquivo do bucket (a vitrine troca por imagens de exemplo). */
  fileUrl?: (path: string) => string
}) {
  return (
    <div className="space-y-6">
      {sections.map((section) => (
        <PanelCard
          key={section.block.id}
          id={`briefing-bloco-${section.block.id}`}
          title={
            <>
              <span className="text-muted-foreground tabular-nums">{section.block.position}.</span>
              {section.block.title}
              <span className="text-[13px] font-normal whitespace-nowrap text-muted-foreground tabular-nums">
                {section.filled} de {section.total}
              </span>
            </>
          }
          action={
            section.block.estimated_minutes ? (
              <span className="hidden items-center gap-1 text-xs whitespace-nowrap text-muted-foreground sm:inline-flex">
                <Clock className="size-3.5" aria-hidden="true" />
                cerca de {section.block.estimated_minutes} min
              </span>
            ) : null
          }
        >
          <ul className="divide-y divide-border">
            {section.items.map((item) => (
              <AnswerItem key={item.question.id} item={item} today={today} fileUrl={fileUrl} />
            ))}
          </ul>
        </PanelCard>
      ))}
    </div>
  )
}

const AI_STATUS_LABEL: Record<Exclude<BriefingAiStatus, "ready">, string> = {
  pending: "na fila da IA",
  processing: "a IA está processando",
  failed: "a IA falhou e tenta de novo sozinha",
}

function AiState({ what, status, error }: { what: string; status: BriefingAiStatus; error?: string | null }) {
  if (status === "ready") return null
  return (
    <span
      title={status === "failed" && error ? error : undefined}
      className={cn(
        "inline-flex h-6 items-center gap-1.5 rounded-full border px-2.5 text-[11.5px] font-medium",
        status === "failed" ? "border-destructive/25 text-destructive" : "border-border text-muted-foreground"
      )}
    >
      <Sparkles className={cn("size-3", status === "processing" && "motion-safe:animate-pulse")} aria-hidden="true" />
      {what}: {AI_STATUS_LABEL[status]}
    </span>
  )
}

function AnswerItem({ item, today, fileUrl }: { item: BriefingItem; today: DateKey; fileUrl: (path: string) => string }) {
  const { answer } = item
  const parts = answer ? describeAnswer(item.kind, item.options, answer.value, answer.text) : []
  const skipped = answer?.skipped ?? false
  const summary = answer?.summary
  const audios = answer?.audios ?? []
  const transcriptionStatus = audios.find((audio) => audio.transcription && audio.transcription.status !== "ready")?.transcription
  const empty = !item.filled && !skipped

  return (
    <li className={cn("px-5 py-4", skipped && "border-l-2 border-l-attention-line bg-attention-soft")}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <h3 className="min-w-0 flex-1 basis-64 text-[14px] leading-6 font-medium text-foreground">{item.text}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {skipped ? (
            <span className="inline-flex h-6 items-center gap-1 rounded-full border border-attention-line/25 bg-attention-muted px-2.5 text-[11.5px] font-medium text-attention-ink">
              <Flag className="size-3" aria-hidden="true" />
              Pulada · levar pra reunião
            </span>
          ) : null}
          {item.required ? <span className="text-[11.5px] text-muted-foreground">Obrigatória</span> : null}
          {item.retired ? (
            <span className="inline-flex h-6 items-center rounded-full border border-dashed px-2.5 text-[11.5px] text-muted-foreground">
              Pergunta desativada
            </span>
          ) : null}
        </div>
      </div>

      {empty ? (
        <p className={cn("mt-1 text-[13px]", item.required ? "text-destructive" : "text-muted-foreground")}>
          {item.required ? "Sem resposta (obrigatória)" : "Sem resposta"}
        </p>
      ) : null}

      {summary?.status === "ready" && summary.summary ? (
        <div className="mt-3 rounded-xl border border-primary/20 bg-brand-soft px-4 py-3">
          <p className="eyebrow flex items-center gap-1.5 text-brand-ink">
            <Sparkles className="size-3" aria-hidden="true" />
            Resumo da IA
          </p>
          <p className="mt-1.5 text-[14px] leading-6 whitespace-pre-line text-foreground">{summary.summary}</p>
        </div>
      ) : null}

      {(summary && summary.status !== "ready") || transcriptionStatus ? (
        <div className="mt-2 flex flex-wrap gap-1.5">
          {transcriptionStatus ? <AiState what="Transcrição" status={transcriptionStatus.status} error={transcriptionStatus.error} /> : null}
          {summary && summary.status !== "ready" ? <AiState what="Resumo" status={summary.status} error={summary.error} /> : null}
        </div>
      ) : null}

      {parts.length > 0 ? (
        <div className={cn("mt-3 space-y-3", summary?.status === "ready" && "text-muted-foreground")}>
          {parts.map((part, index) => (
            <Part key={index} part={part} today={today} />
          ))}
        </div>
      ) : null}

      {answer && answer.files.length > 0 ? <Files files={answer.files} fileUrl={fileUrl} /> : null}
      {audios.length > 0 ? <Audios audios={audios} fileUrl={fileUrl} /> : null}
    </li>
  )
}

function PartLabel({ children }: { children?: string }) {
  return children ? <p className="mb-1 text-xs font-medium text-muted-foreground">{children}</p> : null
}

function Part({ part, today }: { part: AnswerPart; today: DateKey }) {
  switch (part.type) {
    case "text":
      return (
        <div>
          <PartLabel>{part.label}</PartLabel>
          <p className="text-[13.5px] leading-6 whitespace-pre-line text-foreground">{part.text}</p>
        </div>
      )
    case "chips":
      return (
        <div>
          <PartLabel>{part.label}</PartLabel>
          <ul className="flex flex-wrap gap-1.5">
            {part.items.map((item, index) => (
              <li key={index} className="inline-flex min-h-7 items-center rounded-full border bg-card px-3 py-0.5 text-[13px] text-foreground">
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      )
    case "tone":
      return (
        <ul className="grid gap-2 sm:grid-cols-2">
          {part.items.map((item, index) => (
            <li
              key={index}
              className={cn("rounded-xl border bg-card px-3.5 py-3", item.primary && "border-primary/40 ring-1 ring-primary/20")}
            >
              <p className="flex items-center gap-2 text-[13.5px] font-medium text-foreground">
                {item.label}
                {item.primary && part.items.length > 1 ? <span className="eyebrow text-brand-ink">Principal</span> : null}
              </p>
              {item.description ? <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p> : null}
              {item.example ? <p className="mt-2 text-[13px] leading-5 text-foreground/85 italic">“{item.example}”</p> : null}
            </li>
          ))}
        </ul>
      )
    case "colors":
      return (
        <div>
          <PartLabel>{part.label}</PartLabel>
          <ul className="flex flex-wrap gap-2">
            {part.items.map((item, index) => (
              <li key={index} className="flex items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-xs text-foreground">
                {/* A cor é a resposta do cliente (dado), não um token do visual. */}
                <span aria-hidden="true" className="size-6 rounded-full border" style={{ backgroundColor: item.hex }} />
                <span className="font-mono uppercase">{item.hex}</span>
                {item.use ? (
                  <span className={cn(item.use === "avoid" ? "text-destructive" : "text-success-ink")}>
                    {item.use === "avoid" ? "evitar" : "usar"}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )
    case "links":
      return (
        <div>
          <PartLabel>{part.label}</PartLabel>
          <ul className="space-y-1">
            {part.items.map((item, index) => (
              <li key={index} className="text-[13.5px] break-all">
                {item.href ? (
                  <a href={item.href} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-ink underline-offset-2 hover:underline">
                    {item.text}
                  </a>
                ) : (
                  <span className="text-foreground">{item.text}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )
    case "dates":
      return (
        <div>
          <PartLabel>{part.label}</PartLabel>
          <ul className="space-y-1">
            {part.items.map((item, index) => (
              <li key={index} className="flex gap-3 text-[13.5px]">
                <span className="w-20 shrink-0 text-muted-foreground tabular-nums">{item.date ? formatShortDate(item.date, today) : "—"}</span>
                <span className="text-foreground">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )
    case "fields":
      return (
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {part.items.map((item, index) => (
            <div key={index} className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
              <dd className="text-[13.5px] leading-6 break-words whitespace-pre-line text-foreground">{item.text}</dd>
            </div>
          ))}
        </dl>
      )
  }
}

function Files({ files, fileUrl }: { files: BriefingFile[]; fileUrl: (path: string) => string }) {
  return (
    <ul className="mt-3 flex flex-wrap gap-2">
      {files.map((file) => {
        const image = file.mime_type.startsWith("image/")
        return (
          <li key={file.path}>
            <a
              href={fileUrl(file.path)}
              target="_blank"
              rel="noopener noreferrer"
              title={file.name}
              className="group flex w-36 flex-col overflow-hidden rounded-xl border bg-card text-xs transition-colors hover:border-primary/40"
            >
              <span className="flex aspect-[4/3] items-center justify-center overflow-hidden bg-muted">
                {image ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={fileUrl(file.path)} alt="" loading="lazy" className="size-full object-cover" />
                ) : (
                  <FileText className="size-6 text-muted-foreground" aria-hidden="true" />
                )}
              </span>
              <span className="truncate px-2.5 pt-1.5 font-medium text-foreground">{file.name}</span>
              <span className="px-2.5 pb-1.5 text-muted-foreground">{formatFileSize(file.size_bytes) || "abrir"}</span>
            </a>
          </li>
        )
      })}
    </ul>
  )
}

/** Áudio original e transcrição completa, num clique. */
function Audios({ audios, fileUrl }: { audios: TeamBriefingAudio[]; fileUrl: (path: string) => string }) {
  const [open, setOpen] = useState(false)
  const total = audios.reduce((sum, audio) => sum + audio.duration_ms, 0)
  return (
    <div className="mt-3">
      <Button
        variant="outline"
        size="sm"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        className="h-8 gap-1.5 text-xs shadow-none"
      >
        <AudioLines className="size-3.5" />
        {open ? "Esconder áudio e transcrição" : audios.length === 1 ? "Ouvir áudio e ler a transcrição" : `Ouvir ${audios.length} áudios e ler as transcrições`}
        <span className="text-muted-foreground tabular-nums">· {formatDuration(total)}</span>
        <ChevronDown className={cn("size-3.5 transition-transform", open && "rotate-180")} />
      </Button>
      {open ? (
        <ol className="mt-3 space-y-3">
          {audios.map((audio, index) => (
            <li key={audio.id} className="rounded-xl border bg-card px-3.5 py-3">
              <p className="text-xs font-medium text-muted-foreground">
                {index === 0 ? "Áudio" : `Complemento ${index}`} · {formatDuration(audio.duration_ms)}
              </p>
              <audio controls preload="none" src={fileUrl(audio.path)} className="mt-2 h-9 w-full">
                Seu navegador não toca este áudio.
              </audio>
              <div className="mt-2">
                {audio.transcription?.status === "ready" && audio.transcription.transcript ? (
                  <p className="text-[13.5px] leading-6 whitespace-pre-line text-foreground">{audio.transcription.transcript}</p>
                ) : audio.transcription ? (
                  <AiState what="Transcrição" status={audio.transcription.status} error={audio.transcription.error} />
                ) : (
                  <p className="text-xs text-muted-foreground">Sem transcrição ainda.</p>
                )}
              </div>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}
