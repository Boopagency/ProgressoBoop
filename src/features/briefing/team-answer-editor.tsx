"use client"

import { Loader2 } from "lucide-react"
import { useRef, useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog"
import { createTeamBriefingUpload, discardTeamBriefingUpload, saveTeamBriefingAnswer } from "@/features/briefing/actions"
import { BriefingAnswers } from "@/features/briefing/briefing-answers"
import { putToStorage } from "@/features/briefing/flow-api"
import {
  EMPTY_ANSWER,
  parseAnswerValue,
  parseOptions,
  type BriefingFile,
  type FlowAnswer,
  type FlowQuestion,
} from "@/features/briefing/flow-logic"
import { checkUpload, QuestionInput } from "@/features/briefing/question-input"
import type { BriefingItem, BriefingSection } from "@/features/briefing/team-logic"
import type { ActionResult, DateKey } from "@/lib/types"

/*
 * A equipe responde pelo cliente, na aba Briefing da ficha: os mesmos campos
 * do portal (`QuestionInput`), com upload para o bucket `briefing` e a
 * paleta, sem gravar áudio. Vale preparando, liberado e depois do envio; a
 * resposta fica marcada como "preenchida pela Boop" (o banco marca) e o
 * cliente vê como respondida, podendo confirmar ou mudar.
 */

interface TeamFillApi {
  save: (questionId: string, answer: { text: string; value: FlowAnswer["value"]; files: BriefingFile[] }) => Promise<ActionResult>
  upload: (file: File) => Promise<ActionResult<BriefingFile>>
  discard: (path: string) => Promise<ActionResult>
}

const NO_CONNECTION = "Sem conexão. Confira a internet e tente de novo."

function serverTeamFillApi(clientId: string): TeamFillApi {
  const safe = async <T,>(run: () => Promise<ActionResult<T>>): Promise<ActionResult<T>> => {
    try {
      return await run()
    } catch {
      return { ok: false, error: NO_CONNECTION }
    }
  }
  return {
    save: (questionId, answer) => safe(() => saveTeamBriefingAnswer(clientId, questionId, answer)),
    upload: (file) =>
      safe(async () => {
        const ticket = await createTeamBriefingUpload(clientId, file.type, file.size)
        if (!ticket.ok) return ticket
        if (!(await putToStorage(ticket.data.uploadUrl, file, file.type, file.name))) {
          return { ok: false, error: `Não foi possível enviar ${file.name}. Tente de novo.` }
        }
        return { ok: true, data: { path: ticket.data.path, name: file.name.slice(0, 200), mime_type: file.type, size_bytes: file.size } }
      }),
    discard: (path) => safe(() => discardTeamBriefingUpload(clientId, path)),
  }
}

/** Vitrine: tudo dá certo e nada sai do navegador. */
function demoTeamFillApi(): TeamFillApi {
  return {
    save: async () => ({ ok: true, data: null }),
    upload: async (file) => ({ ok: true, data: { path: `demo/${crypto.randomUUID()}`, name: file.name, mime_type: file.type, size_bytes: file.size } }),
    discard: async () => ({ ok: true, data: null }),
  }
}

/** A pergunta como o portal mostra, a partir do que a ficha tem (a cópia guardada, se houver). */
function toFlowQuestion(item: BriefingItem): FlowQuestion {
  return {
    id: item.question.id,
    key: item.question.key,
    text: item.text,
    hint: item.hint,
    kind: item.kind,
    options: parseOptions(item.options),
    required: item.required,
  }
}

function toFlowAnswer(item: BriefingItem): FlowAnswer {
  const answer = item.answer
  if (!answer) return EMPTY_ANSWER
  return { text: answer.text ?? "", value: parseAnswerValue(answer.value), files: answer.files, skipped: false, audios: [] }
}

/**
 * As respostas por bloco com o "Preencher" da equipe em cada pergunta. Com
 * `demo`, nada vai ao servidor (vitrine); `editing` abre já numa pergunta.
 */
export function TeamBriefingAnswers({
  clientId,
  sections,
  today,
  fileUrl,
  demo = false,
  editing,
}: {
  clientId: string
  sections: BriefingSection[]
  today: DateKey
  fileUrl?: (path: string) => string
  demo?: boolean
  /** Vitrine: id da pergunta aberta no editor. */
  editing?: string
}) {
  const [api] = useState<TeamFillApi>(() => (demo ? demoTeamFillApi() : serverTeamFillApi(clientId)))
  const [open, setOpen] = useState<BriefingItem | null>(() =>
    editing ? (sections.flatMap((section) => section.items).find((item) => item.question.id === editing) ?? null) : null
  )
  const [key, setKey] = useState(0)

  return (
    <>
      <BriefingAnswers
        sections={sections}
        today={today}
        fileUrl={fileUrl}
        onFill={(item) => {
          setKey((value) => value + 1)
          setOpen(item)
        }}
      />
      <Dialog open={open !== null} onOpenChange={(next) => (next ? null : setOpen(null))}>
        <DialogContent
          className="max-h-[calc(100dvh-2rem)] gap-0 overflow-hidden p-0 sm:max-w-2xl"
          // Sem foco automático no primeiro botão (o upload): a pessoa lê a pergunta antes.
          onOpenAutoFocus={(event) => event.preventDefault()}
        >
          {open ? <TeamAnswerForm key={key} item={open} api={api} onClose={() => setOpen(null)} fileUrl={fileUrl} /> : null}
        </DialogContent>
      </Dialog>
    </>
  )
}

function TeamAnswerForm({
  item,
  api,
  onClose,
  fileUrl,
}: {
  item: BriefingItem
  api: TeamFillApi
  onClose: () => void
  fileUrl?: (path: string) => string
}) {
  const question = toFlowQuestion(item)
  const [answer, setAnswer] = useState<FlowAnswer>(() => toFlowAnswer(item))
  const [uploading, setUploading] = useState(false)
  const [saving, setSaving] = useState(false)
  /** Enviados aqui e ainda não salvos (saem do Storage se a pessoa desistir). */
  const added = useRef(new Set<string>())
  /** Tirados da resposta (saem do Storage depois de salvar). */
  const removed = useRef(new Set<string>())
  const clientAudios = item.answer?.audios.length ?? 0

  async function upload(files: File[]) {
    for (const problem of files.map(checkUpload)) if (problem) toast.error(problem)
    const valid = files.filter((file) => checkUpload(file) === null)
    if (valid.length === 0) return
    setUploading(true)
    const sent: BriefingFile[] = []
    for (const file of valid) {
      const result = await api.upload(file)
      if (result.ok) {
        sent.push(result.data)
        added.current.add(result.data.path)
      } else toast.error(result.error)
    }
    setUploading(false)
    if (sent.length > 0) setAnswer((before) => ({ ...before, files: [...before.files, ...sent].slice(0, 30) }))
  }

  function removeFile(file: BriefingFile) {
    setAnswer((before) => ({ ...before, files: before.files.filter((item) => item.path !== file.path) }))
    removed.current.add(file.path)
  }

  function cancel() {
    for (const path of added.current) void api.discard(path)
    onClose()
  }

  async function save() {
    setSaving(true)
    const result = await api.save(question.id, { text: answer.text, value: answer.value, files: answer.files })
    setSaving(false)
    if (!result.ok) {
      toast.error(result.error)
      return
    }
    const kept = new Set(answer.files.map((file) => file.path))
    for (const path of [...added.current, ...removed.current]) if (!kept.has(path)) void api.discard(path)
    toast.success("Resposta salva. No portal, ela aparece como preenchida pela Boop.")
    onClose()
  }

  return (
    <div className="flex max-h-[inherit] min-h-0 flex-col">
      <div className="px-5 pt-5 sm:px-6">
        <p className="eyebrow text-muted-foreground">Responder pelo cliente</p>
        <DialogTitle className="mt-1.5 text-[17px] leading-6">{question.text}</DialogTitle>
        <DialogDescription className="mt-1 text-[13px]">
          Preencha o que a Boop já sabe. O cliente vê a resposta com o selo “A Boop já preencheu” e confirma ou muda.
        </DialogDescription>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-5 py-5 sm:px-6">
        {clientAudios > 0 ? (
          <p className="mb-4 rounded-xl border bg-card px-3.5 py-2.5 text-xs text-muted-foreground">
            {clientAudios === 1 ? "O áudio do cliente continua na resposta." : `Os ${clientAudios} áudios do cliente continuam na resposta.`}
          </p>
        ) : null}
        <QuestionInput
          question={question}
          answer={answer}
          onChange={(patch) => setAnswer((before) => ({ ...before, ...patch }))}
          onRecord={async () => false}
          onDeleteAudio={async () => false}
          onUpload={upload}
          onRemoveFile={removeFile}
          uploading={uploading}
          allowAudio={false}
          fileUrl={fileUrl}
        />
      </div>
      <div className="flex flex-wrap items-center justify-end gap-2 border-t px-5 py-4 sm:px-6">
        <Button type="button" variant="ghost" onClick={cancel} disabled={saving}>
          Cancelar
        </Button>
        <Button type="button" onClick={() => void save()} disabled={saving || uploading} className="gap-1.5">
          {saving ? <Loader2 className="size-4 animate-spin" /> : null}
          Salvar resposta
        </Button>
      </div>
    </div>
  )
}
