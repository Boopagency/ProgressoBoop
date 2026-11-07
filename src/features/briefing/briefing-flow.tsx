"use client"

import { ArrowLeft, ArrowRight, CalendarClock, Check, Clock3, CloudOff, Loader2, Mic, PartyPopper, SkipForward } from "lucide-react"
import Link from "next/link"
import { useRouter } from "next/navigation"
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { BrandCardView } from "@/features/briefing/brand-card"
import { demoBriefingApi, serverBriefingApi, type BriefingApi } from "@/features/briefing/flow-api"
import {
  buildBrandCard,
  buildSteps,
  EMPTY_ANSWER,
  hasAnyContent,
  isAnswerComplete,
  missingRequired,
  progressFraction,
  remainingMinutes,
  resumeIndex,
  skippedQuestions,
  type BriefingAudio,
  type BriefingFile,
  type FlowAnswer,
  type FlowData,
  type FlowQuestion,
  type FlowStep,
} from "@/features/briefing/flow-logic"
import { checkUpload, QuestionInput } from "@/features/briefing/question-input"
import type { Recording } from "@/features/voice/upload"
import { formatDayMonth, formatShortDate, formatWeekdayLong, formatWeekdayShort } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Pausa antes de salvar o que está sendo digitado. */
const SAVE_DELAY_MS = 800

type SaveState = "idle" | "saving" | "saved" | "error"

/** Primeira resposta da identificação: os dados que a equipe conferiu ao liberar. */
function initialAnswers(data: FlowData): Record<string, FlowAnswer> {
  const answers = { ...data.answers }
  for (const block of data.blocks) {
    for (const question of block.questions) {
      if (question.kind === "identification" && !answers[question.id]) {
        answers[question.id] = { ...EMPTY_ANSWER, value: { ...data.identification } }
      }
    }
  }
  return answers
}

/**
 * O briefing no portal, uma pergunta por tela: boas-vindas, as perguntas de
 * cada etapa (áudio em destaque, dica com exemplo, tempo da etapa e o prazo),
 * o fechamento de cada etapa, a revisão e o obrigado. Salva cada resposta
 * sozinho e volta exatamente onde parou. O card "Sua marca" vai se montando
 * ao lado (no celular, nas telas de pausa). Com `demo`, nada vai ao servidor
 * (vitrine).
 */
export function BriefingFlow({
  data,
  homeHref,
  today,
  demo = false,
  startAt,
}: {
  data: FlowData
  homeHref: string
  today: DateKey
  demo?: boolean
  /** Vitrine: abre direto numa tela (índice das telas). */
  startAt?: number
}) {
  const router = useRouter()
  const api = useMemo<BriefingApi>(() => (demo ? demoBriefingApi() : serverBriefingApi(data.briefingId)), [demo, data.briefingId])
  const steps = useMemo(() => buildSteps(data.blocks), [data.blocks])
  const [index, setIndex] = useState(() => Math.min(startAt ?? resumeIndex(steps, data.currentQuestionId), steps.length - 1))
  const [direction, setDirection] = useState<1 | -1>(1)
  const [answers, setAnswers] = useState(() => initialAnswers(data))
  const [completed, setCompleted] = useState<string[]>(data.completedBlockIds)
  const [submitted, setSubmitted] = useState(data.status !== "not_started" && data.status !== "in_progress")
  const [saveState, setSaveState] = useState<SaveState>("idle")
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const timers = useRef(new Map<string, number>())
  const latest = useRef(answers)
  const top = useRef<HTMLDivElement>(null)

  // Salva o que ficou pendente ao sair da tela.
  useEffect(() => {
    const pending = timers.current
    return () => {
      for (const [questionId, timer] of pending) {
        window.clearTimeout(timer)
        const answer = latest.current[questionId]
        if (answer) void api.saveAnswer(questionId, answer)
      }
    }
  }, [api])

  const step = steps[index] ?? steps[0]!
  const card = buildBrandCard({ blocks: data.blocks, answers, identification: data.identification })
  const totalBlocks = data.blocks.filter((block) => block.questions.length > 0).length

  async function persist(questionId: string): Promise<boolean> {
    const timer = timers.current.get(questionId)
    if (timer) window.clearTimeout(timer)
    timers.current.delete(questionId)
    const answer = latest.current[questionId]
    if (!answer) return true
    setSaveState("saving")
    const result = await api.saveAnswer(questionId, { text: answer.text, value: answer.value, files: answer.files, skipped: answer.skipped })
    setSaveState(result.ok ? "saved" : "error")
    if (!result.ok) toast.error(result.error)
    return result.ok
  }

  /** Muda a resposta já (o `latest` fica certo na hora, para salvar sem esperar a tela). */
  function commit(questionId: string, change: (before: FlowAnswer) => FlowAnswer) {
    const all = { ...latest.current, [questionId]: change(latest.current[questionId] ?? EMPTY_ANSWER) }
    latest.current = all
    setAnswers(all)
  }

  function update(question: FlowQuestion, patch: Partial<FlowAnswer>, delay = SAVE_DELAY_MS) {
    commit(question.id, (before) => {
      const merged = { ...before, ...patch }
      // Responder tira o "pular por agora".
      return { ...merged, skipped: patch.skipped ?? (hasAnyContent(merged) ? false : merged.skipped) }
    })
    const timer = timers.current.get(question.id)
    if (timer) window.clearTimeout(timer)
    timers.current.set(
      question.id,
      window.setTimeout(() => void persist(question.id), delay)
    )
  }

  function goTo(next: number) {
    const target = steps[next]
    if (!target) return
    setDirection(next >= index ? 1 : -1)
    setIndex(next)
    top.current?.scrollIntoView({ block: "start", behavior: "smooth" })
    if (target.type === "question") void api.setPosition(target.question.id)
  }

  function goToQuestion(questionId: string) {
    const found = steps.findIndex((item) => item.type === "question" && item.question.id === questionId)
    if (found >= 0) goTo(found)
  }

  /** Avança; da última pergunta da etapa, fecha a etapa (o banco confere e avisa a equipe). */
  async function advance(from: FlowStep) {
    if (busy) return
    setBusy(true)
    try {
      if (from.type === "question" && !(await persist(from.question.id))) return
      const next = steps[index + 1]
      if (next?.type === "block_done") {
        const block = data.blocks[next.blockIndex]
        if (block && !completed.includes(block.id)) {
          const missing = missingRequired([block], latest.current)
          if (missing[0]) {
            toast.error("Falta responder uma pergunta desta etapa.")
            goToQuestion(missing[0].id)
            return
          }
          const result = await api.completeBlock(block.id)
          if (!result.ok) {
            toast.error(result.error)
            return
          }
          setCompleted((current) => [...current, block.id])
        }
      }
      goTo(index + 1)
    } finally {
      setBusy(false)
    }
  }

  async function skip(question: FlowQuestion) {
    commit(question.id, (before) => ({ ...before, skipped: true }))
    await advance({ type: "question", blockIndex: 0, questionIndex: 0, question })
  }

  async function submit() {
    if (busy) return
    setBusy(true)
    const result = await api.submit()
    setBusy(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    setSubmitted(true)
    if (!demo) router.refresh()
  }

  async function record(question: FlowQuestion, recording: Recording): Promise<boolean> {
    const result = await api.recordAudio(question.id, recording)
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    commit(question.id, (before) => ({ ...before, skipped: false, audios: [...before.audios, result.data] }))
    setSaveState("saved")
    return true
  }

  async function deleteAudio(question: FlowQuestion, audio: BriefingAudio): Promise<boolean> {
    const result = await api.deleteAudio(audio.id)
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    commit(question.id, (before) => ({ ...before, audios: before.audios.filter((item) => item.id !== audio.id) }))
    return true
  }

  async function upload(question: FlowQuestion, files: File[]) {
    const problems = files.map(checkUpload).filter((problem): problem is string => problem !== null)
    for (const problem of problems) toast.error(problem)
    const valid = files.filter((file) => checkUpload(file) === null)
    if (valid.length === 0) return
    setUploading(true)
    const sent: BriefingFile[] = []
    for (const file of valid) {
      const result = await api.uploadFile(file)
      if (result.ok) sent.push(result.data)
      else toast.error(result.error)
    }
    setUploading(false)
    if (sent.length === 0) return
    const before = latest.current[question.id] ?? EMPTY_ANSWER
    update(question, { files: [...before.files, ...sent].slice(0, 30) }, 0)
  }

  function removeFile(question: FlowQuestion, file: BriefingFile) {
    const before = latest.current[question.id] ?? EMPTY_ANSWER
    update(question, { files: before.files.filter((item) => item.path !== file.path) }, 0)
    // Depois que a resposta sem o arquivo foi salva, o arquivo sai do Storage.
    window.setTimeout(() => void api.discardFile(file.path), 1500)
  }

  if (submitted) return <ThanksScreen homeHref={homeHref} card={card} totalBlocks={totalBlocks} />

  const blockOf = (blockIndex: number) => data.blocks[blockIndex]
  let content: ReactNode
  let aside = true

  if (step.type === "intro") {
    const started = Object.values(answers).some(hasAnyContent) && data.currentQuestionId !== null
    content = (
      <IntroScreen
        data={data}
        today={today}
        started={started}
        onStart={() => (started && data.currentQuestionId ? goToQuestion(data.currentQuestionId) : goTo(1))}
      />
    )
  } else if (step.type === "question") {
    const block = blockOf(step.blockIndex)!
    const question = step.question
    const answer = answers[question.id] ?? EMPTY_ANSWER
    const complete = isAnswerComplete(question, answer)
    const canContinue = complete || (!question.required && hasAnyContent(answer) && !answer.skipped)
    content = (
      <div className="space-y-7">
        <QuestionHeader
          blockNumber={step.blockIndex + 1}
          totalBlocks={data.blocks.length}
          blockTitle={block.title}
          minutes={block.estimated_minutes}
          due={data.dueOn}
          today={today}
          progress={progressFraction(data.blocks, answers)}
          saveState={saveState}
          onBack={() => goTo(index - 1)}
        />
        <div className="space-y-3">
          <h1 className="font-display text-[26px] leading-[1.15] font-medium tracking-[-0.03em] text-foreground sm:text-[32px]">{question.text}</h1>
          {question.hint ? <p className="text-[15px] leading-6 text-muted-foreground">{question.hint}</p> : null}
          {question.options.voice === "essential" ? (
            <p className="inline-flex items-center gap-1.5 rounded-full bg-brand-soft px-3 py-1 text-xs font-medium text-brand-ink">
              <Mic className="size-3.5" aria-hidden="true" />
              Essa vale ouvir da sua voz
            </p>
          ) : null}
        </div>
        <QuestionInput
          key={question.id}
          question={question}
          answer={answer}
          onChange={(patch) => update(question, patch)}
          onRecord={(recording) => record(question, recording)}
          onDeleteAudio={(audio) => deleteAudio(question, audio)}
          onUpload={(files) => upload(question, files)}
          onRemoveFile={(file) => removeFile(question, file)}
          uploading={uploading}
        />
        <div className="flex flex-wrap items-center gap-3 pt-2">
          <Button
            type="button"
            size="lg"
            className="h-12 min-w-40 flex-1 gap-2 rounded-full text-[15px] sm:flex-none"
            disabled={!canContinue || busy || uploading}
            onClick={() => void advance(step)}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null}
            Continuar
            <ArrowRight className="size-4" />
          </Button>
          {!question.required ? (
            <Button
              type="button"
              variant="ghost"
              size="lg"
              className="h-12 gap-2 rounded-full text-muted-foreground"
              disabled={busy || uploading}
              onClick={() => void skip(question)}
            >
              <SkipForward className="size-4" />
              Pular por agora
            </Button>
          ) : (
            <span className="text-xs text-muted-foreground">Essa é importante: precisa de resposta.</span>
          )}
        </div>
      </div>
    )
  } else if (step.type === "block_done") {
    const left = remainingMinutes(data.blocks, completed)
    const leftBlocks = data.blocks.filter((block) => block.questions.length > 0 && !completed.includes(block.id)).length
    aside = false
    content = (
      <BlockDoneScreen
        title={blockOf(step.blockIndex)?.title ?? "Etapa"}
        leftBlocks={leftBlocks}
        leftMinutes={left}
        onBack={() => goTo(index - 1)}
        onNext={() => goTo(index + 1)}
        card={<BrandCardView card={card} doneBlocks={completed.length} totalBlocks={totalBlocks} />}
      />
    )
  } else {
    aside = false
    content = (
      <ReviewScreen
        missing={missingRequired(data.blocks, answers)}
        skipped={skippedQuestions(data.blocks, answers)}
        busy={busy}
        due={data.dueOn}
        onOpen={goToQuestion}
        onBack={() => goTo(index - 1)}
        onSubmit={() => void submit()}
        card={<BrandCardView card={card} doneBlocks={completed.length} totalBlocks={totalBlocks} />}
      />
    )
  }

  return (
    <div ref={top} className="mx-auto w-full max-w-[1120px] scroll-mt-4 px-4 pt-4 pb-10 sm:px-6 sm:pt-8 lg:px-8">
      <div className={cn("grid gap-8", aside && "lg:grid-cols-[minmax(0,1fr)_320px] lg:gap-12")}>
        <div
          key={index}
          className={cn(
            "min-w-0 animate-in duration-300 fade-in-0 motion-reduce:animate-none",
            direction === 1 ? "slide-in-from-right-4" : "slide-in-from-left-4",
            aside ? "max-w-[640px]" : "mx-auto w-full max-w-[640px]"
          )}
        >
          {content}
        </div>
        {aside ? (
          <aside aria-label="Sua marca" className="hidden lg:block">
            <div className="sticky top-6">
              <BrandCardView card={card} doneBlocks={completed.length} totalBlocks={totalBlocks} />
            </div>
          </aside>
        ) : null}
      </div>
    </div>
  )
}

/** "quinta-feira, 12 de novembro" (no meio da frase, em minúscula). */
function dueSentence(due: DateKey): string {
  return `${formatWeekdayLong(due)}, ${formatDayMonth(due)}`
}

function DueChip({ due, today }: { due: DateKey; today: DateKey }) {
  const late = due < today
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium tabular-nums",
        late ? "border-destructive/40 text-destructive" : due === today ? "border-warning/40 text-warning-ink" : "text-muted-foreground"
      )}
    >
      <CalendarClock className="size-3.5" aria-hidden="true" />
      {late ? "Prazo passou" : due === today ? "Prazo: hoje" : `Prazo: ${formatWeekdayShort(due)}, ${formatShortDate(due, today)}`}
    </span>
  )
}

function QuestionHeader({
  blockNumber,
  totalBlocks,
  blockTitle,
  minutes,
  due,
  today,
  progress,
  saveState,
  onBack,
}: {
  blockNumber: number
  totalBlocks: number
  blockTitle: string
  minutes: number | null
  due: DateKey
  today: DateKey
  progress: number
  saveState: SaveState
  onBack: () => void
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <Button type="button" variant="ghost" size="icon" className="-ml-2 size-10 rounded-full" aria-label="Voltar" onClick={onBack}>
          <ArrowLeft className="size-5" />
        </Button>
        <div className="min-w-0 flex-1">
          <p className="eyebrow text-muted-foreground">
            Etapa {blockNumber} de {totalBlocks}
            {minutes ? ` · cerca de ${minutes} min` : ""}
          </p>
          <p className="truncate text-[14px] font-medium text-foreground">{blockTitle}</p>
        </div>
        <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground" aria-live="polite">
          {saveState === "saving" ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden="true" />
              Salvando
            </>
          ) : saveState === "saved" ? (
            <>
              <Check className="size-3.5 text-success-ink" aria-hidden="true" />
              Salvo
            </>
          ) : saveState === "error" ? (
            <>
              <CloudOff className="size-3.5 text-destructive" aria-hidden="true" />
              Não salvou
            </>
          ) : null}
        </span>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
          <div className="h-full rounded-full bg-brand transition-[width] duration-500 motion-reduce:transition-none" style={{ width: `${Math.round(progress * 100)}%` }} />
        </div>
        <DueChip due={due} today={today} />
      </div>
    </div>
  )
}

function IntroScreen({ data, today, started, onStart }: { data: FlowData; today: DateKey; started: boolean; onStart: () => void }) {
  const blocks = data.blocks.filter((block) => block.questions.length > 0)
  const minutes = remainingMinutes(blocks, data.completedBlockIds)
  return (
    <div className="space-y-7">
      <div className="space-y-3">
        <DueChip due={data.dueOn} today={today} />
        <h1 className="font-display text-[34px] leading-[1.06] font-medium tracking-[-0.04em] text-foreground sm:text-[44px]">
          {started ? "Bora continuar a sua " : "Bora conhecer a sua "}
          <em className="emphasis pr-[0.05em] text-[1.14em] leading-none text-gradient-brand">marca</em>
        </h1>
        <p className="text-[15px] leading-6 text-muted-foreground">
          {started
            ? "Tá tudo salvo. Você volta exatamente de onde parou."
            : "Antes de criar qualquer post, a Boop quer ouvir você. Responde do seu jeito, de preferência falando. Dá pra pausar e voltar quando quiser."}
        </p>
      </div>

      <div className="flex items-start gap-3 rounded-2xl border bg-card px-4 py-3.5">
        <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow">
          <Mic className="size-5" aria-hidden="true" />
        </span>
        <p className="text-[14px] leading-6 text-foreground">
          Falar é mais rápido que digitar. Cada pergunta tem uma dica com exemplo, e tudo fica salvo sozinho.
          <span className="block text-muted-foreground">Prazo: {dueSentence(data.dueOn)}.</span>
        </p>
      </div>

      <ol className="divide-y overflow-hidden rounded-2xl border bg-card">
        {blocks.map((block, index) => {
          const done = data.completedBlockIds.includes(block.id)
          return (
            <li key={block.id} className="flex items-center gap-3.5 px-4 py-3">
              <span
                className={cn(
                  "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold tabular-nums",
                  done ? "bg-success/15 text-success-ink" : "bg-muted text-muted-foreground"
                )}
              >
                {done ? <Check className="size-3.5" aria-label="Concluída" /> : index + 1}
              </span>
              <div className="min-w-0 flex-1">
                <p className="text-[14px] font-medium text-foreground">{block.title}</p>
                {block.description ? <p className="truncate text-[13px] text-muted-foreground">{block.description}</p> : null}
              </div>
              {block.estimated_minutes ? (
                <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground tabular-nums">
                  <Clock3 className="size-3.5" aria-hidden="true" />
                  {block.estimated_minutes} min
                </span>
              ) : null}
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" size="lg" className="h-12 min-w-48 flex-1 gap-2 rounded-full text-[15px] sm:flex-none" onClick={onStart}>
          {started ? "Continuar de onde parei" : "Começar"}
          <ArrowRight className="size-4" />
        </Button>
        <span className="text-[13px] text-muted-foreground">Cerca de {minutes} min no total</span>
      </div>
    </div>
  )
}

function BlockDoneScreen({
  title,
  leftBlocks,
  leftMinutes,
  card,
  onBack,
  onNext,
}: {
  title: string
  leftBlocks: number
  leftMinutes: number
  card: ReactNode
  onBack: () => void
  onNext: () => void
}) {
  return (
    <div className="space-y-7 text-center">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-success/15 text-success-ink">
        <Check className="size-8" strokeWidth={2.5} aria-hidden="true" />
      </span>
      <div className="space-y-2">
        <p className="eyebrow text-muted-foreground">{title}</p>
        <h1 className="font-display text-[32px] leading-[1.08] font-medium tracking-[-0.04em] text-foreground sm:text-[40px]">
          Etapa <em className="emphasis pr-[0.05em] text-[1.14em] leading-none text-gradient-brand">concluída</em>
        </h1>
        <p className="text-[15px] text-muted-foreground">
          {leftBlocks > 0
            ? `${leftBlocks === 1 ? "Falta 1 etapa" : `Faltam ${leftBlocks} etapas`} · cerca de ${leftMinutes} min`
            : "Todas as etapas feitas. Só falta revisar e enviar."}
        </p>
      </div>
      <div className="text-left">{card}</div>
      <div className="flex flex-wrap justify-center gap-3">
        <Button type="button" variant="ghost" size="lg" className="h-12 gap-2 rounded-full" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Voltar
        </Button>
        <Button type="button" size="lg" className="h-12 min-w-44 gap-2 rounded-full text-[15px]" onClick={onNext}>
          {leftBlocks > 0 ? "Próxima etapa" : "Revisar e enviar"}
          <ArrowRight className="size-4" />
        </Button>
      </div>
      <p className="text-xs text-muted-foreground">Pode parar aqui e voltar depois: tá tudo salvo.</p>
    </div>
  )
}

function ReviewScreen({
  missing,
  skipped,
  busy,
  due,
  card,
  onOpen,
  onBack,
  onSubmit,
}: {
  missing: FlowQuestion[]
  skipped: FlowQuestion[]
  busy: boolean
  due: DateKey
  card: ReactNode
  onOpen: (questionId: string) => void
  onBack: () => void
  onSubmit: () => void
}) {
  return (
    <div className="space-y-7">
      <div className="space-y-2">
        <p className="eyebrow text-muted-foreground">Última etapa</p>
        <h1 className="font-display text-[32px] leading-[1.08] font-medium tracking-[-0.04em] text-foreground sm:text-[40px]">
          Tudo <em className="emphasis pr-[0.05em] text-[1.14em] leading-none text-gradient-brand">pronto?</em>
        </h1>
        <p className="text-[15px] leading-6 text-muted-foreground">
          Depois de enviar, as respostas vão para a equipe e o resto do portal abre. Prazo: {dueSentence(due)}.
        </p>
      </div>

      {card}

      {missing.length > 0 ? (
        <section aria-labelledby="faltam" className="space-y-2">
          <h2 id="faltam" className="eyebrow text-destructive">
            Falta responder ({missing.length})
          </h2>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {missing.map((question) => (
              <li key={question.id}>
                <button
                  type="button"
                  onClick={() => onOpen(question.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] text-foreground outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                >
                  <span className="min-w-0 flex-1">{question.text}</span>
                  <ArrowRight className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {skipped.length > 0 ? (
        <section aria-labelledby="puladas" className="space-y-2">
          <h2 id="puladas" className="eyebrow text-warning-ink">
            Puladas, ficam pra reunião ({skipped.length})
          </h2>
          <ul className="divide-y overflow-hidden rounded-2xl border bg-card">
            {skipped.map((question) => (
              <li key={question.id}>
                <button
                  type="button"
                  onClick={() => onOpen(question.id)}
                  className="flex w-full items-center gap-3 px-4 py-3 text-left text-[14px] text-foreground outline-none hover:bg-muted/50 focus-visible:bg-muted/50"
                >
                  <span className="min-w-0 flex-1">{question.text}</span>
                  <span className="shrink-0 text-xs text-muted-foreground">Responder agora</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="button" variant="ghost" size="lg" className="h-12 gap-2 rounded-full" onClick={onBack}>
          <ArrowLeft className="size-4" />
          Voltar
        </Button>
        <Button
          type="button"
          size="lg"
          className="h-12 min-w-44 flex-1 gap-2 rounded-full text-[15px] sm:flex-none"
          disabled={missing.length > 0 || busy}
          onClick={onSubmit}
        >
          {busy ? <Loader2 className="size-4 animate-spin" /> : null}
          Enviar briefing
        </Button>
      </div>
      {missing.length > 0 ? <p className="text-xs text-muted-foreground">O envio libera quando as obrigatórias estiverem respondidas.</p> : null}
    </div>
  )
}

function ThanksScreen({ homeHref, card, totalBlocks }: { homeHref: string; card: ReturnType<typeof buildBrandCard>; totalBlocks: number }) {
  return (
    <div className="mx-auto w-full max-w-[640px] animate-in px-4 pt-8 pb-10 text-center duration-500 fade-in-0 zoom-in-95 motion-reduce:animate-none sm:px-6 sm:pt-12">
      <span className="mx-auto flex size-16 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-glow">
        <PartyPopper className="size-8" aria-hidden="true" />
      </span>
      <h1 className="mt-6 font-display text-[34px] leading-[1.06] font-medium tracking-[-0.04em] text-foreground sm:text-[44px]">
        Valeu, <em className="emphasis pr-[0.05em] text-[1.14em] leading-none text-gradient-brand">recebemos!</em>
      </h1>
      <p className="mt-3 text-[15px] leading-6 text-muted-foreground">
        A equipe já vai ler tudo com carinho e chamar você para a reunião de imersão. Enquanto isso, o resto do portal já está aberto.
      </p>
      <div className="mt-7 text-left">
        <BrandCardView card={card} doneBlocks={totalBlocks} totalBlocks={totalBlocks} />
      </div>
      <Button asChild size="lg" className="mt-7 h-12 min-w-48 gap-2 rounded-full text-[15px]">
        <Link href={homeHref}>
          Ir para o início
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </div>
  )
}
