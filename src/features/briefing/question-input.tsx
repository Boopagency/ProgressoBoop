"use client"

import { Camera, Check, FileText, ImageIcon, Link2, Loader2, Plus, Star, ThumbsDown, ThumbsUp, Upload, X } from "lucide-react"
import { useId, useRef, useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import {
  BRIEFING_FILE_MAX_BYTES,
  briefingFileSrc,
  colorsOf,
  IDENTIFICATION_KEYS,
  paletteOf,
  type IdentificationKey,
  isBriefingFileType,
  isHexColor,
  parseBrl,
  type AnswerValue,
  type BriefingAudio,
  type BriefingFile,
  type ExtraOption,
  type ExtraValue,
  type FlowAnswer,
  type FlowQuestion,
  type PaletteValue,
} from "@/features/briefing/flow-logic"
import { VoiceAnswer } from "@/features/briefing/voice-answer"
import type { Recording } from "@/features/voice/upload"
import { cn } from "@/lib/utils"

/** O que cada entrada recebe: a resposta, como mudá-la e as ações que vão ao servidor. */
export interface InputProps {
  question: FlowQuestion
  answer: FlowAnswer
  /** Muda a resposta (o fluxo salva sozinho, com uma pausa para o texto). */
  onChange: (next: Partial<FlowAnswer>) => void
  onRecord: (recording: Recording) => Promise<boolean>
  onDeleteAudio: (audio: BriefingAudio) => Promise<boolean>
  onUpload: (files: File[]) => Promise<void>
  onRemoveFile: (file: BriefingFile) => void
  uploading: boolean
  /**
   * Gravar áudio. A equipe, respondendo pelo cliente na ficha, escreve
   * (`false`): os áudios que existirem são mostrados na ficha, não aqui.
   */
  allowAudio?: boolean
  /** Endereço de um arquivo enviado (a vitrine troca por imagens de exemplo). */
  fileUrl?: (path: string) => string
}

const OPTION_CLASS =
  "flex min-h-12 w-full items-center gap-3 rounded-2xl border bg-card px-4 py-3 text-left text-[15px] text-foreground outline-none transition-[border-color,background-color,box-shadow] [-webkit-tap-highlight-color:transparent] hover:border-glow/40 focus-visible:ring-[3px] focus-visible:ring-ring/40"
const OPTION_ON = "border-glow/60 bg-brand-soft shadow-[0_0_0_1px_var(--glow)]"

function setValue(answer: FlowAnswer, patch: Partial<AnswerValue>): Partial<FlowAnswer> {
  return { value: { ...answer.value, ...patch } }
}

function setExtra(answer: FlowAnswer, key: string, extra: ExtraValue): Partial<FlowAnswer> {
  return setValue(answer, { extras: { ...answer.value.extras, [key]: extra } })
}

/** Texto escrito no lugar do áudio: "prefiro escrever", menor, embaixo. */
function WriteInstead({
  value,
  onChange,
  placeholder,
  startOpen,
}: {
  value: string
  onChange: (text: string) => void
  placeholder?: string
  startOpen: boolean
}) {
  const [open, setOpen] = useState(startOpen)
  const id = useId()
  if (!open) {
    return (
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="mx-auto text-[13px] font-medium text-muted-foreground underline-offset-4 outline-none hover:text-foreground hover:underline focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        Prefiro escrever
      </button>
    )
  }
  return (
    <div className="w-full space-y-1.5">
      <label htmlFor={id} className="eyebrow text-muted-foreground">
        Por escrito
      </label>
      <Textarea
        id={id}
        value={value}
        autoFocus={!startOpen}
        maxLength={10000}
        rows={4}
        placeholder={placeholder ?? "Escreve do seu jeito, sem cerimônia."}
        onChange={(event) => onChange(event.target.value)}
        className="min-h-28 rounded-2xl bg-card text-[15px]"
      />
    </div>
  )
}

/** Pergunta aberta: o áudio em destaque e o "prefiro escrever" embaixo. */
function AudioInput(props: InputProps) {
  const { answer, onChange } = props
  if (props.allowAudio === false) {
    return <WriteInstead value={answer.text} onChange={(text) => onChange({ text })} placeholder="O que a Boop já sabe sobre isso" startOpen />
  }
  return (
    <div className="flex flex-col gap-5">
      <VoiceAnswer audios={answer.audios} onRecorded={props.onRecord} onDelete={props.onDeleteAudio} />
      <WriteInstead value={answer.text} onChange={(text) => onChange({ text })} startOpen={answer.text.trim() !== ""} />
    </div>
  )
}

function ChoiceInput({ question, answer, onChange }: InputProps) {
  const { choices, other } = question.options
  const all = other && !choices.some((choice) => choice.value === "other") ? [...choices, { value: "other", label: "Outro" }] : choices
  return (
    <div className="space-y-2" role="radiogroup" aria-label={question.text}>
      {all.map((choice) => {
        const on = answer.value.choice === choice.value
        return (
          <button
            key={choice.value}
            type="button"
            role="radio"
            aria-checked={on}
            onClick={() => onChange(setValue(answer, { choice: on ? undefined : choice.value }))}
            className={cn(OPTION_CLASS, on && OPTION_ON)}
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-full border-2",
                on ? "border-primary bg-primary text-primary-foreground" : "border-foreground/25"
              )}
              aria-hidden="true"
            >
              {on ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            <span className="min-w-0 flex-1">
              {choice.label}
              {choice.example ? <span className="mt-0.5 block text-[13px] text-muted-foreground">“{choice.example}”</span> : null}
            </span>
          </button>
        )
      })}
      {answer.value.choice === "other" ? (
        <Input
          autoFocus
          value={answer.value.other ?? ""}
          maxLength={300}
          placeholder="Conta qual"
          onChange={(event) => onChange(setValue(answer, { other: event.target.value }))}
          className="h-12 rounded-2xl bg-card text-[15px]"
        />
      ) : null}
    </div>
  )
}

function MultipleInput({ question, answer, onChange }: InputProps) {
  const { choices, other, max } = question.options
  const all = other ? [...choices, { value: "other", label: "Outra" }] : choices
  const picked = answer.value.choices ?? []
  const full = max !== null && picked.length >= max
  return (
    <div className="space-y-2" role="group" aria-label={question.text}>
      {max ? <p className="text-xs text-muted-foreground">Até {max}. {picked.length > 0 ? `${picked.length} de ${max}.` : ""}</p> : null}
      {all.map((choice) => {
        const on = picked.includes(choice.value)
        return (
          <button
            key={choice.value}
            type="button"
            role="checkbox"
            aria-checked={on}
            disabled={!on && full}
            onClick={() =>
              onChange(setValue(answer, { choices: on ? picked.filter((item) => item !== choice.value) : [...picked, choice.value] }))
            }
            className={cn(OPTION_CLASS, on && OPTION_ON, !on && full && "opacity-50")}
          >
            <span
              className={cn(
                "flex size-5 shrink-0 items-center justify-center rounded-md border-2",
                on ? "border-primary bg-primary text-primary-foreground" : "border-foreground/25"
              )}
              aria-hidden="true"
            >
              {on ? <Check className="size-3" strokeWidth={3} /> : null}
            </span>
            <span className="min-w-0 flex-1">{choice.label}</span>
          </button>
        )
      })}
      {picked.includes("other") ? (
        <Input
          autoFocus
          value={answer.value.other ?? ""}
          maxLength={300}
          placeholder="Conta qual"
          onChange={(event) => onChange(setValue(answer, { other: event.target.value }))}
          className="h-12 rounded-2xl bg-card text-[15px]"
        />
      ) : null}
    </div>
  )
}

/** Tom de voz: cada card com uma abertura de post, "assim sim" ou "assim não"; com duas, a principal. */
function CardsInput({ question, answer, onChange }: InputProps) {
  const { cards, max, primary } = question.options
  const current = { yes: answer.value.choices ?? [], no: answer.value.rejected ?? [], primary: answer.value.primary }
  const full = max !== null && current.yes.length >= max

  function mark(value: string, verdict: "yes" | "no") {
    const yes = current.yes.filter((item) => item !== value)
    const no = current.no.filter((item) => item !== value)
    const wasOn = verdict === "yes" ? current.yes.includes(value) : current.no.includes(value)
    if (!wasOn) (verdict === "yes" ? yes : no).push(value)
    const keepPrimary = current.primary && yes.includes(current.primary) ? current.primary : undefined
    onChange(setValue(answer, { choices: yes, rejected: no, primary: keepPrimary }))
  }

  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">
        Marque até {max ?? 2} com “assim sim”.{primary && current.yes.length > 1 ? " Toque na estrela da principal." : ""}
      </p>
      <ul className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => {
          const yes = current.yes.includes(card.value)
          const no = current.no.includes(card.value)
          const isPrimary = current.primary === card.value
          return (
            <li
              key={card.value}
              className={cn(
                "flex flex-col gap-3 rounded-2xl border bg-card p-4 transition-[border-color,box-shadow,opacity]",
                yes && OPTION_ON,
                no && "opacity-60"
              )}
            >
              <div className="flex items-start gap-2">
                <div className="min-w-0 flex-1">
                  <p className="eyebrow text-muted-foreground">{card.label}</p>
                  <p className="mt-2 font-display text-[16px] leading-6 text-foreground">“{card.example}”</p>
                </div>
                {primary && yes && current.yes.length > 1 ? (
                  <button
                    type="button"
                    aria-pressed={isPrimary}
                    aria-label={`Marcar ${card.label} como a principal`}
                    onClick={() => onChange(setValue(answer, { primary: card.value }))}
                    className={cn(
                      "flex size-8 shrink-0 items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
                      isPrimary ? "text-glow" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Star className={cn("size-4", isPrimary && "fill-current")} />
                  </button>
                ) : null}
              </div>
              {card.description ? <p className="text-[13px] leading-5 text-muted-foreground">{card.description}</p> : null}
              <div className="mt-auto flex gap-2">
                <Button
                  type="button"
                  size="sm"
                  variant={yes ? "default" : "outline"}
                  aria-pressed={yes}
                  disabled={!yes && full}
                  onClick={() => mark(card.value, "yes")}
                  className="flex-1 gap-1.5 rounded-full"
                >
                  <ThumbsUp className="size-3.5" />
                  Assim sim
                </Button>
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  aria-pressed={no}
                  onClick={() => mark(card.value, "no")}
                  className={cn("flex-1 gap-1.5 rounded-full", no && "border-foreground/40 bg-muted")}
                >
                  <ThumbsDown className="size-3.5" />
                  Assim não
                </Button>
              </div>
            </li>
          )
        })}
      </ul>
    </div>
  )
}

/** Amostras para tocar e já escolher; o seletor de cor para qualquer outra. */
const SWATCHES = ["#1f2937", "#f5f5f4", "#ef4444", "#f97316", "#eab308", "#22c55e", "#14b8a6", "#3b82f6", "#6366f1", "#a855f7", "#ec4899", "#a16207"]

/** Paleta clicável: cores para usar e para evitar. */
export function PaletteInput({ value, onChange, label }: { value: PaletteValue; onChange: (next: PaletteValue) => void; label?: string }) {
  const [mode, setMode] = useState<"use" | "avoid">("use")
  const [custom, setCustom] = useState("#3d7eff")

  function add(color: string) {
    const normalized = color.toLowerCase()
    if (!isHexColor(normalized)) return
    const other = mode === "use" ? "avoid" : "use"
    const list = value[mode].includes(normalized) ? value[mode].filter((item) => item !== normalized) : [...value[mode], normalized].slice(-8)
    onChange({ ...value, [mode]: list, [other]: value[other].filter((item) => item !== normalized) })
  }

  return (
    <div className="space-y-3">
      {label ? <p className="text-[14px] font-medium text-foreground">{label}</p> : null}
      <div className="inline-flex rounded-full border bg-card p-0.5" role="tablist" aria-label="Usar ou evitar">
        {(["use", "avoid"] as const).map((item) => (
          <button
            key={item}
            type="button"
            role="tab"
            aria-selected={mode === item}
            onClick={() => setMode(item)}
            className={cn(
              "h-8 rounded-full px-4 text-[13px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
              mode === item ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            )}
          >
            {item === "use" ? "Quero usar" : "Quero evitar"}
          </button>
        ))}
      </div>
      <div className="flex flex-wrap items-center gap-2">
        {SWATCHES.map((color) => {
          const inUse = value.use.includes(color)
          const inAvoid = value.avoid.includes(color)
          return (
            <button
              key={color}
              type="button"
              aria-label={`Cor ${color}`}
              aria-pressed={value[mode].includes(color)}
              onClick={() => add(color)}
              className={cn(
                "relative size-10 rounded-full border border-foreground/15 outline-none focus-visible:ring-[3px] focus-visible:ring-ring/50",
                (inUse || inAvoid) && "ring-2 ring-glow ring-offset-2 ring-offset-background"
              )}
              style={{ backgroundColor: color }}
            >
              {inAvoid ? <X className="absolute inset-0 m-auto size-4 text-white mix-blend-difference" aria-hidden="true" /> : null}
              {inUse ? <Check className="absolute inset-0 m-auto size-4 text-white mix-blend-difference" aria-hidden="true" /> : null}
            </button>
          )
        })}
        <label className="flex h-10 items-center gap-2 rounded-full border bg-card pr-3 pl-1 text-[13px] text-muted-foreground">
          <input
            type="color"
            value={custom}
            onChange={(event) => setCustom(event.target.value)}
            className="size-8 cursor-pointer rounded-full border-0 bg-transparent p-0"
            aria-label="Escolher outra cor"
          />
          <button type="button" onClick={() => add(custom)} className="font-medium text-foreground outline-none hover:underline">
            Adicionar
          </button>
        </label>
      </div>
      <div className="grid gap-2 sm:grid-cols-2">
        {(["use", "avoid"] as const).map((item) => (
          <div key={item} className="rounded-2xl border bg-card px-3 py-2.5">
            <p className="eyebrow text-muted-foreground">{item === "use" ? "Usar" : "Evitar"}</p>
            {value[item].length === 0 ? (
              <p className="mt-1 text-[13px] text-subtle-foreground">Nenhuma ainda</p>
            ) : (
              <ul className="mt-2 flex flex-wrap gap-1.5">
                {value[item].map((color) => (
                  <li key={color}>
                    <button
                      type="button"
                      onClick={() => onChange({ ...value, [item]: value[item].filter((other) => other !== color) })}
                      className="flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs text-foreground"
                      aria-label={`Tirar ${color}`}
                    >
                      <span className="size-3.5 rounded-full border border-foreground/15" style={{ backgroundColor: color }} />
                      {color}
                      <X className="size-3 text-muted-foreground" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/** Links colados (posts, perfis, @, pasta do Drive). */
function LinksField({
  value,
  onChange,
  max,
  placeholder,
  label,
}: {
  value: string[]
  onChange: (next: string[]) => void
  max: number | null
  placeholder?: string | null
  label?: string
}) {
  const rows = value.length === 0 ? [""] : value
  const full = max !== null && rows.length >= max
  return (
    <div className="space-y-2">
      {label ? <p className="text-[14px] font-medium text-foreground">{label}</p> : null}
      {rows.map((link, index) => (
        <div key={index} className="flex items-center gap-2">
          <div className="relative min-w-0 flex-1">
            <Link2 className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <Input
              value={link}
              inputMode="url"
              maxLength={500}
              placeholder={placeholder ?? "Cole o link ou o @"}
              aria-label={`Link ${index + 1}`}
              onChange={(event) => onChange(rows.map((item, at) => (at === index ? event.target.value : item)))}
              className="h-12 rounded-2xl bg-card pl-10 text-[15px]"
            />
          </div>
          {rows.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 text-muted-foreground"
              aria-label="Tirar este link"
              onClick={() => onChange(rows.filter((_, at) => at !== index))}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      ))}
      {!full ? (
        <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => onChange([...rows, ""])}>
          <Plus className="size-3.5" />
          Outro link
        </Button>
      ) : null}
    </div>
  )
}

function DatesField({ value, onChange }: { value: NonNullable<AnswerValue["dates"]>; onChange: (next: NonNullable<AnswerValue["dates"]>) => void }) {
  const rows = value.length === 0 ? [{ date: "", label: "" }] : value
  return (
    <div className="space-y-2">
      {rows.map((row, index) => (
        <div key={index} className="flex flex-wrap items-center gap-2 sm:flex-nowrap">
          <Input
            type="date"
            value={row.date}
            aria-label={`Data ${index + 1}`}
            onChange={(event) => onChange(rows.map((item, at) => (at === index ? { ...item, date: event.target.value } : item)))}
            className="h-12 w-44 rounded-2xl bg-card text-[15px]"
          />
          <Input
            value={row.label}
            maxLength={200}
            placeholder="O que acontece (ex.: lançamento)"
            aria-label={`O que acontece na data ${index + 1}`}
            onChange={(event) => onChange(rows.map((item, at) => (at === index ? { ...item, label: event.target.value } : item)))}
            className="h-12 min-w-0 flex-1 rounded-2xl bg-card text-[15px]"
          />
          {rows.length > 1 ? (
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-10 text-muted-foreground"
              aria-label="Tirar esta data"
              onClick={() => onChange(rows.filter((_, at) => at !== index))}
            >
              <X className="size-4" />
            </Button>
          ) : null}
        </div>
      ))}
      <Button type="button" variant="ghost" size="sm" className="gap-1.5 text-muted-foreground" onClick={() => onChange([...rows, { date: "", label: "" }])}>
        <Plus className="size-3.5" />
        Outra data
      </Button>
    </div>
  )
}

function NumberInput({ question, answer, onChange }: InputProps) {
  const [text, setText] = useState(() =>
    typeof answer.value.number === "number" ? answer.value.number.toLocaleString("pt-BR", { minimumFractionDigits: 2 }) : ""
  )
  return (
    <div className="relative max-w-64">
      {question.options.unit === "BRL" ? (
        <span className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-[15px] text-muted-foreground">R$</span>
      ) : null}
      <Input
        value={text}
        inputMode="decimal"
        maxLength={20}
        placeholder={question.options.placeholder ?? "0,00"}
        aria-label={question.text}
        onChange={(event) => {
          setText(event.target.value)
          const parsed = parseBrl(event.target.value)
          onChange(setValue(answer, { number: parsed ?? undefined }))
        }}
        className={cn("h-14 rounded-2xl bg-card text-[20px] tabular-nums", question.options.unit === "BRL" && "pl-11")}
      />
    </div>
  )
}

/**
 * Campos lado a lado. Na identificação, cada campo vai no topo do valor
 * (`{ brand_name, … }`); nas outras, em `fields` (`{ fields: { use, avoid } }`).
 */
function FieldsInput({ question, answer, onChange, multiline }: InputProps & { multiline: boolean }) {
  const topLevel = question.kind === "identification"
  const read = (key: string): string => {
    if (topLevel) return (IDENTIFICATION_KEYS as readonly string[]).includes(key) ? (answer.value[key as IdentificationKey] ?? "") : ""
    return answer.value.fields?.[key] ?? ""
  }
  const write = (key: string, text: string) =>
    onChange(
      topLevel
        ? setValue(answer, { [key]: text })
        : setValue(answer, { fields: { ...answer.value.fields, [key]: text } })
    )
  return (
    <div className="space-y-3">
      {question.options.fields.map((field) => (
        <div key={field.key} className="space-y-1.5">
          <label htmlFor={`${question.id}-${field.key}`} className="text-[14px] font-medium text-foreground">
            {field.label}
          </label>
          {multiline ? (
            <Textarea
              id={`${question.id}-${field.key}`}
              value={read(field.key)}
              maxLength={2000}
              rows={3}
              placeholder={field.placeholder}
              onChange={(event) => write(field.key, event.target.value)}
              className="rounded-2xl bg-card text-[15px]"
            />
          ) : (
            <Input
              id={`${question.id}-${field.key}`}
              value={read(field.key)}
              maxLength={200}
              placeholder={field.placeholder}
              onChange={(event) => write(field.key, event.target.value)}
              className="h-12 rounded-2xl bg-card text-[15px]"
            />
          )}
        </div>
      ))}
    </div>
  )
}

function formatSize(bytes: number): string {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toLocaleString("pt-BR", { maximumFractionDigits: 1 })} MB`
  return `${Math.max(1, Math.round(bytes / 1024))} KB`
}

/** Upload: arrastar, escolher ou tirar foto na hora. */
/** Miniatura da imagem enviada; sem ela (ou se não abrir), o ícone. */
function FileThumb({ file, fileUrl }: { file: BriefingFile; fileUrl: (path: string) => string }) {
  const [failed, setFailed] = useState(false)
  if (!file.mime_type.startsWith("image/") || failed) {
    const Icon = file.mime_type.startsWith("image/") ? ImageIcon : FileText
    return <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={fileUrl(file.path)}
      alt=""
      loading="lazy"
      onError={() => setFailed(true)}
      className="size-10 shrink-0 rounded-lg border bg-muted object-contain p-0.5"
    />
  )
}

function UploadInput({ question, answer, onUpload, onRemoveFile, uploading, fileUrl = briefingFileSrc }: InputProps) {
  const pick = useRef<HTMLInputElement>(null)
  const camera = useRef<HTMLInputElement>(null)
  const [over, setOver] = useState(false)
  const accept = question.options.accept.length > 0 ? question.options.accept.join(",") : undefined

  function send(list: FileList | null) {
    const files = Array.from(list ?? [])
    if (files.length > 0) void onUpload(files)
  }

  return (
    <div className="space-y-3">
      <div
        onDragOver={(event) => {
          event.preventDefault()
          setOver(true)
        }}
        onDragLeave={() => setOver(false)}
        onDrop={(event) => {
          event.preventDefault()
          setOver(false)
          send(event.dataTransfer.files)
        }}
        className={cn(
          "flex flex-col items-center gap-3 rounded-3xl border-2 border-dashed bg-card px-5 py-8 text-center transition-colors",
          over ? "border-glow bg-brand-soft" : "border-foreground/15"
        )}
      >
        {uploading ? (
          <Loader2 className="size-7 animate-spin text-brand-ink" aria-hidden="true" />
        ) : (
          <Upload className="size-7 text-brand-ink" aria-hidden="true" />
        )}
        <p className="text-[15px] font-medium text-foreground">{uploading ? "Enviando…" : "Arraste os arquivos aqui"}</p>
        <p className="text-xs text-muted-foreground">Imagem, PDF, vídeo, fonte ou zip, até 50 MB cada.</p>
        <div className="flex flex-wrap justify-center gap-2">
          <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" disabled={uploading} onClick={() => pick.current?.click()}>
            <ImageIcon className="size-3.5" />
            Escolher arquivos
          </Button>
          <Button type="button" variant="outline" size="sm" className="gap-1.5 rounded-full" disabled={uploading} onClick={() => camera.current?.click()}>
            <Camera className="size-3.5" />
            Tirar foto
          </Button>
        </div>
        <input ref={pick} type="file" multiple accept={accept} className="sr-only" tabIndex={-1} onChange={(event) => send(event.target.files)} />
        <input ref={camera} type="file" accept="image/*" capture="environment" className="sr-only" tabIndex={-1} onChange={(event) => send(event.target.files)} />
      </div>
      {answer.files.length > 0 ? (
        <ul className="space-y-1.5" aria-label="Arquivos enviados">
          {answer.files.map((file) => (
            <li key={file.path} className="flex items-center gap-3 rounded-2xl border bg-card px-3 py-2">
              <FileThumb file={file} fileUrl={fileUrl} />
              <span className="min-w-0 flex-1 truncate text-[14px] text-foreground">{file.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{formatSize(file.size_bytes)}</span>
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="size-8 text-muted-foreground hover:text-destructive"
                aria-label={`Tirar ${file.name}`}
                onClick={() => onRemoveFile(file)}
              >
                <X className="size-3.5" />
              </Button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  )
}

/** Confere tipo e tamanho antes de enviar (o servidor confere de novo). */
export function checkUpload(file: File): string | null {
  if (!isBriefingFileType(file.type)) return `${file.name}: esse tipo de arquivo não é aceito.`
  if (file.size > BRIEFING_FILE_MAX_BYTES) return `${file.name}: até 50 MB por arquivo.`
  return null
}

/** Complementos da pergunta (o percentual, a meta, a frase que já ouviu, a paleta, o link da pasta). */
function Extras(props: InputProps) {
  const { question, answer, onChange } = props
  if (question.options.extras.length === 0) return null
  return (
    <div className="space-y-4 border-t border-border pt-5">
      {question.options.extras.map((extra) => (
        <ExtraField key={extra.key} extra={extra} {...props} value={answer.value.extras?.[extra.key]} setExtraValue={(next) => onChange(setExtra(answer, extra.key, next))} />
      ))}
    </div>
  )
}

function ExtraField({
  extra,
  value,
  setExtraValue,
  ...props
}: InputProps & { extra: ExtraOption; value: ExtraValue | undefined; setExtraValue: (next: ExtraValue) => void }) {
  const id = useId()
  const label = (
    <label htmlFor={id} className="text-[14px] font-medium text-foreground">
      {extra.label}
      {extra.required ? null : <span className="ml-1.5 text-xs font-normal text-muted-foreground">opcional</span>}
    </label>
  )
  switch (extra.kind) {
    case "short_text":
      return (
        <div className="space-y-1.5">
          {label}
          <Input
            id={id}
            value={typeof value === "string" ? value : ""}
            maxLength={500}
            placeholder={extra.placeholder}
            onChange={(event) => setExtraValue(event.target.value)}
            className="h-12 rounded-2xl bg-card text-[15px]"
          />
        </div>
      )
    case "links":
      return (
        <LinksField
          label={extra.label}
          value={value && typeof value === "object" && "links" in value ? value.links : []}
          onChange={(links) => setExtraValue({ links })}
          max={null}
          placeholder={extra.placeholder}
        />
      )
    case "palette":
      return (
        <PaletteInput
          label={extra.label}
          value={paletteOf(value && typeof value === "object" && "colors" in value ? value.colors : [])}
          onChange={(palette) => setExtraValue({ colors: colorsOf(palette) })}
        />
      )
    case "audio":
      // Fala ou escreve: os áudios ficam na mesma resposta.
      return (
        <div className="space-y-3">
          <p className="text-[14px] font-medium text-foreground">
            {extra.label}
            <span className="ml-1.5 text-xs font-normal text-muted-foreground">opcional</span>
          </p>
          {props.allowAudio === false ? null : (
            <VoiceAnswer compact audios={props.answer.audios} onRecorded={props.onRecord} onDelete={props.onDeleteAudio} />
          )}
          <Textarea
            id={id}
            value={typeof value === "string" ? value : ""}
            maxLength={5000}
            rows={3}
            placeholder={extra.placeholder ?? "Ou escreve aqui"}
            onChange={(event) => setExtraValue(event.target.value)}
            className="rounded-2xl bg-card text-[15px]"
          />
        </div>
      )
  }
}

/** A entrada certa para o tipo da pergunta, com os complementos embaixo. */
export function QuestionInput(props: InputProps) {
  const { question, answer, onChange } = props
  let main: ReactNode
  switch (question.kind) {
    case "identification":
      main = <FieldsInput {...props} multiline={false} />
      break
    case "audio":
      main = <AudioInput {...props} />
      break
    case "short_text":
      main =
        question.options.fields.length > 0 ? (
          <FieldsInput {...props} multiline />
        ) : (
          <Input
            value={answer.text}
            maxLength={500}
            autoFocus
            placeholder={question.options.placeholder ?? "Escreve aqui"}
            aria-label={question.text}
            onChange={(event) => onChange({ text: event.target.value })}
            className="h-14 rounded-2xl bg-card text-[17px]"
          />
        )
      break
    case "number":
      main = <NumberInput {...props} />
      break
    case "choice":
      main = <ChoiceInput {...props} />
      break
    case "multiple":
      main = <MultipleInput {...props} />
      break
    case "cards":
      main = <CardsInput {...props} />
      break
    case "palette":
      main = (
        <PaletteInput value={paletteOf(answer.value.colors)} onChange={(palette) => onChange(setValue(answer, { colors: colorsOf(palette) }))} />
      )
      break
    case "upload":
      main = <UploadInput {...props} />
      break
    case "links":
      main = (
        <LinksField
          value={answer.value.links ?? []}
          onChange={(links) => onChange(setValue(answer, { links }))}
          max={question.options.max}
          placeholder={question.options.placeholder}
        />
      )
      break
    case "dates":
      main = <DatesField value={answer.value.dates ?? []} onChange={(dates) => onChange(setValue(answer, { dates }))} />
      break
  }
  return (
    <div className="space-y-6">
      {main}
      <Extras {...props} />
    </div>
  )
}
