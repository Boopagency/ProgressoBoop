"use client"

import { ExternalLink, FileUp, NotebookPen } from "lucide-react"
import Link from "next/link"
import { useRef, useState, useTransition } from "react"
import { toast } from "sonner"

import { PanelCard } from "@/components/panel-card"
import { Button } from "@/components/ui/button"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import { saveImmersion } from "@/features/briefing/team-actions"
import type { ImmersionMeetingOption, TeamBriefingImmersion } from "@/features/briefing/team-logic"
import { formatShortDate, toDateKey, toTimeLabel } from "@/lib/dates"
import type { DateKey } from "@/lib/types"

const NONE = "__none__"
const TRANSCRIPT_MAX = 200_000

/**
 * Notas da imersão: a reunião do calendário do Admin (as deste cliente), a
 * transcrição colada ou subida de um .txt e um resumo livre. Só a equipe vê.
 */
export function BriefingImmersionCard({
  clientId,
  immersion,
  meetings,
  today,
}: {
  clientId: string
  immersion: TeamBriefingImmersion | null
  meetings: ImmersionMeetingOption[]
  today: DateKey
}) {
  const initialKey = immersion?.meeting_id ? (meetings.find((option) => option.meetingId === immersion.meeting_id)?.key ?? NONE) : NONE
  const [meetingKey, setMeetingKey] = useState(initialKey)
  const [transcript, setTranscript] = useState(immersion?.transcript ?? "")
  const [notes, setNotes] = useState(immersion?.notes ?? "")
  const [saved, setSaved] = useState({ meetingKey: initialKey, transcript: immersion?.transcript ?? "", notes: immersion?.notes ?? "" })
  const [isPending, startTransition] = useTransition()
  const fileInput = useRef<HTMLInputElement>(null)

  const dirty = meetingKey !== saved.meetingKey || transcript !== saved.transcript || notes !== saved.notes
  const selected = meetings.find((option) => option.key === meetingKey) ?? null

  async function loadFile(file: File | undefined) {
    if (!file) return
    if (!/\.(txt|vtt|srt|md)$/i.test(file.name) && !file.type.startsWith("text/")) {
      toast.error("Suba a transcrição em texto (.txt).")
      return
    }
    if (file.size > TRANSCRIPT_MAX * 4) {
      toast.error("Arquivo grande demais para uma transcrição.")
      return
    }
    const text = (await file.text()).replace(/\r\n/g, "\n")
    if (text.length > TRANSCRIPT_MAX) {
      toast.error("A transcrição passa de 200 mil caracteres.")
      return
    }
    setTranscript(text)
    toast.success(`Transcrição de “${file.name}” carregada. Salve para guardar.`)
  }

  function save() {
    startTransition(async () => {
      const result = await saveImmersion(clientId, {
        meeting: selected ? { eventId: selected.eventId, date: selected.date } : null,
        transcript,
        notes,
      })
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      setSaved({ meetingKey, transcript: transcript.trim(), notes: notes.trim() })
      setTranscript((value) => value.trim())
      setNotes((value) => value.trim())
      toast.success("Notas da imersão salvas.")
    })
  }

  return (
    <PanelCard
      id="briefing-imersao"
      title={
        <>
          <NotebookPen className="size-4 text-muted-foreground" aria-hidden="true" />
          Imersão
        </>
      }
      action={
        immersion?.updated_at ? (
          <span className="text-xs text-muted-foreground">
            Salvo {formatShortDate(toDateKey(immersion.updated_at), today)}, {toTimeLabel(immersion.updated_at)}
          </span>
        ) : null
      }
    >
      <div className="space-y-4 px-5 py-4">
        <div className="space-y-1.5">
          <Label htmlFor="imersao-reuniao">Reunião</Label>
          <div className="flex items-center gap-2">
            <Select value={meetingKey} onValueChange={setMeetingKey}>
              <SelectTrigger id="imersao-reuniao" className="w-full min-w-0 shadow-none">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper" align="start">
                <SelectItem value={NONE} className="text-muted-foreground">
                  Nenhuma reunião ligada
                </SelectItem>
                {meetings.map((option) => (
                  <SelectItem key={option.key} value={option.key}>
                    {formatShortDate(option.date, today)}
                    {option.time ? `, ${option.time}` : ""} · {option.title}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {selected?.meetingId && meetingKey === saved.meetingKey ? (
              <Button asChild variant="ghost" size="icon" aria-label="Abrir a reunião">
                <Link href={`/reunioes/${selected.meetingId}`}>
                  <ExternalLink />
                </Link>
              </Button>
            ) : null}
          </div>
          {meetings.length === 0 ? (
            <p className="text-xs text-muted-foreground">
              Nenhuma reunião com o cliente no calendário. Marque a imersão em “Mais ações → Nova reunião”.
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="imersao-transcricao">Transcrição da reunião</Label>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => fileInput.current?.click()}
            >
              <FileUp className="size-3.5" />
              Subir .txt
            </Button>
            <input
              ref={fileInput}
              type="file"
              accept=".txt,.vtt,.srt,.md,text/plain"
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
              onChange={(event) => {
                void loadFile(event.target.files?.[0])
                event.target.value = ""
              }}
            />
          </div>
          <Textarea
            id="imersao-transcricao"
            value={transcript}
            maxLength={TRANSCRIPT_MAX}
            onChange={(event) => setTranscript(event.target.value)}
            placeholder="Cole aqui a transcrição (Meet, Zoom, tl;dv…) ou suba o arquivo."
            className="max-h-72 min-h-28 overflow-y-auto font-mono text-xs leading-5"
          />
          {transcript ? (
            <p className="text-right text-[11.5px] text-muted-foreground tabular-nums">
              {transcript.length.toLocaleString("pt-BR")} caracteres
            </p>
          ) : null}
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="imersao-notas">Resumo da imersão</Label>
          <Textarea
            id="imersao-notas"
            value={notes}
            maxLength={50_000}
            onChange={(event) => setNotes(event.target.value)}
            placeholder="O que ficou claro, o que mudou do briefing e o que vai para o Documento de Marca."
            className="min-h-28"
          />
        </div>

        <div className="flex items-center justify-end gap-2">
          {dirty ? <span className="text-xs text-muted-foreground">Alterações não salvas</span> : null}
          <Button onClick={save} disabled={isPending || !dirty}>
            {isPending ? "Salvando…" : "Salvar notas"}
          </Button>
        </div>
      </div>
    </PanelCard>
  )
}
