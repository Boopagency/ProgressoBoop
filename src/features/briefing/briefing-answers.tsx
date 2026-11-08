"use client"

import { AudioLines, BadgeCheck, ChevronDown, Clock, FileText, Flag, PencilLine, Sparkles, UserCheck } from "lucide-react"
import { useState } from "react"

import { PanelCard } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { AnswerPartView } from "@/features/briefing/answer-parts"
import {
  briefingAudioUrl,
  briefingFileUrl,
  describeAnswer,
  formatDuration,
  formatFileSize,
  type BriefingAiStatus,
  type BriefingFile,
  type BriefingItem,
  type BriefingSection,
  type TeamBriefingAudio,
} from "@/features/briefing/team-logic"
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
  onFill,
}: {
  sections: BriefingSection[]
  today: DateKey
  /** URL de um arquivo do bucket (a vitrine troca por imagens de exemplo). */
  fileUrl?: (path: string) => string
  /** A equipe responde pelo cliente (abre os campos do portal). */
  onFill?: (item: BriefingItem) => void
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
              <AnswerItem key={item.question.id} item={item} today={today} fileUrl={fileUrl} onFill={onFill} />
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

function AnswerItem({
  item,
  today,
  fileUrl,
  onFill,
}: {
  item: BriefingItem
  today: DateKey
  fileUrl: (path: string) => string
  onFill?: (item: BriefingItem) => void
}) {
  const { answer } = item
  const parts = answer ? describeAnswer(item.kind, item.options, answer.value, answer.text) : []
  const skipped = answer?.skipped ?? false
  const summary = answer?.summary
  const audios = answer?.audios ?? []
  const transcriptionStatus = audios.find((audio) => audio.transcription && audio.transcription.status !== "ready")?.transcription
  const empty = !item.filled && !skipped
  const byBoop = answer?.filled_by_team === true && item.filled
  const reviewed = !byBoop && answer?.team_filled_at && answer.by_client && item.filled

  return (
    <li className={cn("px-5 py-4", skipped && "border-l-2 border-l-attention-line bg-attention-soft")}>
      <div className="flex flex-wrap items-start gap-x-3 gap-y-1.5">
        <h3 className="min-w-0 flex-1 basis-64 text-[14px] leading-6 font-medium text-foreground">{item.text}</h3>
        <div className="flex flex-wrap items-center gap-1.5">
          {byBoop ? (
            <span className="inline-flex h-6 items-center gap-1 rounded-full border border-primary/20 bg-brand-soft px-2.5 text-[11.5px] font-medium text-brand-ink">
              <BadgeCheck className="size-3" aria-hidden="true" />
              Preenchida pela Boop
            </span>
          ) : reviewed ? (
            <span className="inline-flex h-6 items-center gap-1 rounded-full border px-2.5 text-[11.5px] font-medium text-muted-foreground">
              <UserCheck className="size-3" aria-hidden="true" />
              Boop preencheu · cliente revisou
            </span>
          ) : null}
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
          {onFill && !item.retired ? (
            <Button
              variant="outline"
              size="sm"
              onClick={() => onFill(item)}
              className="h-7 gap-1.5 rounded-full px-2.5 text-xs shadow-none"
              aria-label={`${empty ? "Preencher" : "Editar"}: ${item.text}`}
            >
              <PencilLine className="size-3" />
              {empty || skipped ? "Preencher" : "Editar"}
            </Button>
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
            <AnswerPartView key={index} part={part} today={today} />
          ))}
        </div>
      ) : null}

      {answer && answer.files.length > 0 ? <Files files={answer.files} fileUrl={fileUrl} /> : null}
      {audios.length > 0 ? <Audios audios={audios} /> : null}
    </li>
  )
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
                  <img src={fileUrl(file.path)} alt="" loading="lazy" className="size-full object-contain p-2" />
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
function Audios({ audios }: { audios: TeamBriefingAudio[] }) {
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
              <audio controls preload="none" src={briefingAudioUrl(audio.id)} className="mt-2 h-9 w-full">
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
