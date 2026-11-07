"use client"

import {
  ArrowDown,
  ArrowUp,
  Clock,
  EyeOff,
  Info,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Trash2,
} from "lucide-react"
import { useState, useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { PageBody, PageContainer, PageHeader, PageMeta } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Textarea } from "@/components/ui/textarea"
import {
  convertOptions,
  defaultOptions,
  EDITABLE_KINDS,
  EXTRA_KIND_LABEL,
  optionFeatures,
  QUESTION_KIND_LABEL,
  UPLOAD_ACCEPT_OPTIONS,
} from "@/features/briefing/editor-logic"
import {
  createBriefingBlock,
  createBriefingQuestion,
  moveBriefingBlock,
  moveBriefingQuestion,
  setBriefingBlockActive,
  setBriefingQuestionActive,
  updateBriefingBlock,
  updateBriefingQuestion,
} from "@/features/briefing/team-actions"
import {
  EXTRA_KINDS,
  type BriefingChoice,
  type BriefingExtra,
  type BriefingField,
  type BriefingQuestionKind,
  type BriefingQuestionOptions,
  type BriefingToneCard,
  type TeamBriefingBlock,
  type TeamBriefingQuestion,
} from "@/features/briefing/team-logic"
import type { BriefingForm } from "@/features/briefing/team-queries"
import type { ActionResult } from "@/lib/types"
import { cn } from "@/lib/utils"

type BlockDialogState = { open: boolean; key: number; block?: TeamBriefingBlock }
type QuestionDialogState = { open: boolean; key: number; blockId?: string; question?: TeamBriefingQuestion }

/**
 * Editor de perguntas do briefing (o formulário ativo, o mesmo para todos os
 * clientes): criar, editar, reordenar e desativar blocos e perguntas. Nada é
 * apagado. Mudanças valem para briefings novos e os que estão em
 * preenchimento; a resposta guarda a cópia da pergunta, então o que já foi
 * respondido e enviado continua com o texto original.
 */
export function BriefingEditor({ form }: { form: BriefingForm }) {
  const [blockDialog, setBlockDialog] = useState<BlockDialogState>({ open: false, key: 0 })
  const [questionDialog, setQuestionDialog] = useState<QuestionDialogState>({ open: false, key: 0 })
  const [isPending, startTransition] = useTransition()

  const blocks = [...form.blocks].sort((a, b) => a.position - b.position)
  const activeQuestions = form.questions.filter(
    (question) => question.active && blocks.find((block) => block.id === question.block_id)?.active
  )

  function run(action: () => Promise<ActionResult<unknown>>, success?: string) {
    startTransition(async () => {
      const result = await action()
      if (!result.ok) toast.error(result.error)
      else if (success) toast.success(success)
    })
  }

  return (
    <PageContainer>
      <PageHeader
        title={
          <>
            Perguntas do <em>briefing</em>
          </>
        }
        description={
          <PageMeta
            items={[
              `${form.template.name} · v${form.template.version}`,
              `${activeQuestions.length} perguntas ativas em ${blocks.filter((block) => block.active).length} blocos`,
            ]}
          />
        }
        actions={
          <Button onClick={() => setBlockDialog((current) => ({ open: true, key: current.key + 1 }))} className="gap-1.5">
            <Plus />
            Novo bloco
          </Button>
        }
      />

      <PageBody width="reading" className="gap-6">
        <p className="flex gap-2.5 rounded-2xl border bg-card px-4 py-3 text-[13px] leading-5 text-muted-foreground">
          <Info className="mt-0.5 size-4 shrink-0 text-brand-ink" aria-hidden="true" />
          <span>
            Mudanças valem para os briefings novos e para os que estão em preenchimento. Briefing enviado continua com as
            perguntas de quando foi respondido. Nada é apagado: desativar tira a pergunta do formulário e guarda as respostas.
          </span>
        </p>

        {blocks.map((block, index) => {
          const questions = form.questions.filter((question) => question.block_id === block.id).sort((a, b) => a.position - b.position)
          const fixed = block.position === 0
          const firstMovable = blocks[0]?.position === 0 ? 1 : 0
          return (
            <section
              key={block.id}
              aria-labelledby={`bloco-${block.id}`}
              className={cn("overflow-hidden rounded-2xl border bg-card", !block.active && "border-dashed opacity-70")}
            >
              <header className="flex flex-col gap-2 border-b px-5 py-3 sm:flex-row sm:items-center sm:gap-3">
                <div className="min-w-0 flex-1">
                  <h2 id={`bloco-${block.id}`} className="text-[15px] leading-6 font-semibold tracking-tight text-foreground">
                    <span className="mr-1.5 text-muted-foreground tabular-nums">{block.position}.</span>
                    {block.title}
                    {!block.active ? (
                      <span className="ml-2 align-middle">
                        <InactiveBadge>Bloco desativado</InactiveBadge>
                      </span>
                    ) : null}
                  </h2>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 text-xs text-muted-foreground">
                    {block.description ? <span>{block.description}</span> : null}
                    {block.estimated_minutes ? (
                      <span className="inline-flex items-center gap-1">
                        <Clock className="size-3" aria-hidden="true" />
                        cerca de {block.estimated_minutes} min
                      </span>
                    ) : null}
                  </p>
                </div>
                <div className="-ml-2 flex items-center gap-1 sm:ml-0">
                  {!fixed ? (
                    <>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Subir o bloco ${block.title}`}
                        disabled={isPending || index <= firstMovable}
                        onClick={() => run(() => moveBriefingBlock(block.id, "up"))}
                      >
                        <ArrowUp />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="size-8"
                        aria-label={`Descer o bloco ${block.title}`}
                        disabled={isPending || index === blocks.length - 1}
                        onClick={() => run(() => moveBriefingBlock(block.id, "down"))}
                      >
                        <ArrowDown />
                      </Button>
                    </>
                  ) : null}
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 gap-1 px-2 text-xs"
                    disabled={fixed}
                    onClick={() => setQuestionDialog((current) => ({ open: true, key: current.key + 1, blockId: block.id }))}
                  >
                    <Plus className="size-3.5" />
                    Pergunta
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="size-8" aria-label={`Mais ações do bloco ${block.title}`}>
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-52">
                      <DropdownMenuItem onSelect={() => setBlockDialog((current) => ({ open: true, key: current.key + 1, block }))}>
                        <Pencil />
                        Editar bloco
                      </DropdownMenuItem>
                      {!fixed ? (
                        <>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem
                            onSelect={() =>
                              run(
                                () => setBriefingBlockActive(block.id, !block.active),
                                block.active ? "Bloco desativado. As respostas continuam guardadas." : "Bloco reativado."
                              )
                            }
                          >
                            {block.active ? <EyeOff /> : <RotateCcw />}
                            {block.active ? "Desativar bloco" : "Reativar bloco"}
                          </DropdownMenuItem>
                        </>
                      ) : null}
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </header>

              {questions.length === 0 ? (
                <p className="px-5 py-4 text-[13px] text-muted-foreground">Nenhuma pergunta neste bloco ainda.</p>
              ) : (
                <ol className="divide-y divide-border">
                  {questions.map((question, questionIndex) => (
                    <QuestionRow
                      key={question.id}
                      question={question}
                      answers={form.answerCounts[question.id] ?? 0}
                      first={questionIndex === 0}
                      last={questionIndex === questions.length - 1}
                      disabled={isPending}
                      onMove={(direction) => run(() => moveBriefingQuestion(question.id, direction))}
                      onEdit={() => setQuestionDialog((current) => ({ open: true, key: current.key + 1, blockId: block.id, question }))}
                      onToggle={() =>
                        run(
                          () => setBriefingQuestionActive(question.id, !question.active),
                          question.active ? "Pergunta desativada. As respostas continuam guardadas." : "Pergunta reativada."
                        )
                      }
                    />
                  ))}
                </ol>
              )}
            </section>
          )
        })}
      </PageBody>

      <BlockDialog
        key={`bloco-${blockDialog.key}`}
        state={blockDialog}
        templateId={form.template.id}
        onOpenChange={(open) => setBlockDialog((current) => ({ ...current, open }))}
      />
      <QuestionDialog
        key={`pergunta-${questionDialog.key}`}
        state={questionDialog}
        blocks={blocks}
        answers={questionDialog.question ? (form.answerCounts[questionDialog.question.id] ?? 0) : 0}
        onOpenChange={(open) => setQuestionDialog((current) => ({ ...current, open }))}
      />
    </PageContainer>
  )
}

function InactiveBadge({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex h-5 items-center rounded-full border border-dashed px-2 text-[11.5px] font-medium text-muted-foreground">
      {children}
    </span>
  )
}

function QuestionRow({
  question,
  answers,
  first,
  last,
  disabled,
  onMove,
  onEdit,
  onToggle,
}: {
  question: TeamBriefingQuestion
  answers: number
  first: boolean
  last: boolean
  disabled: boolean
  onMove: (direction: "up" | "down") => void
  onEdit: () => void
  onToggle: () => void
}) {
  const fixed = question.kind === "identification"
  const choices = question.options.choices ?? question.options.cards ?? []
  return (
    <li className={cn("flex items-start gap-3 px-5 py-3.5", !question.active && "opacity-60")}>
      <span className="mt-0.5 w-5 shrink-0 text-right text-xs text-muted-foreground tabular-nums">{question.position}</span>
      <div className="min-w-0 flex-1">
        <button type="button" onClick={onEdit} className="text-left text-[14px] leading-6 font-medium text-foreground hover:text-brand-ink">
          {question.text}
        </button>
        {question.hint ? <p className="text-xs leading-5 text-muted-foreground">{question.hint}</p> : null}
        <p className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[11.5px] text-muted-foreground">
          <span className="inline-flex h-5 items-center rounded-full border bg-card px-2 font-medium text-foreground">
            {QUESTION_KIND_LABEL[question.kind]}
          </span>
          {question.required ? <span className="font-medium text-brand-ink">Obrigatória</span> : <span>Opcional</span>}
          {question.options.voice === "essential" ? <span>· fala essencial</span> : null}
          {choices.length > 0 ? <span>· {choices.length} opções</span> : null}
          {question.options.extras?.length ? <span>· {question.options.extras.length} complemento{question.options.extras.length === 1 ? "" : "s"}</span> : null}
          {answers > 0 ? <span>· {answers} resposta{answers === 1 ? "" : "s"}</span> : null}
          {!question.active ? <InactiveBadge>Desativada</InactiveBadge> : null}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Button variant="ghost" size="icon" className="size-8" aria-label="Subir a pergunta" disabled={disabled || first} onClick={() => onMove("up")}>
          <ArrowUp />
        </Button>
        <Button variant="ghost" size="icon" className="size-8" aria-label="Descer a pergunta" disabled={disabled || last} onClick={() => onMove("down")}>
          <ArrowDown />
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8" aria-label="Mais ações da pergunta">
              <MoreHorizontal />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-52">
            <DropdownMenuItem onSelect={onEdit}>
              <Pencil />
              Editar pergunta
            </DropdownMenuItem>
            {!fixed ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={onToggle}>
                  {question.active ? <EyeOff /> : <RotateCcw />}
                  {question.active ? "Desativar pergunta" : "Reativar pergunta"}
                </DropdownMenuItem>
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </li>
  )
}

/* ------------------------------------------------------------------ */
/* Bloco                                                               */
/* ------------------------------------------------------------------ */

function BlockDialog({
  state,
  templateId,
  onOpenChange,
}: {
  state: BlockDialogState
  templateId: string
  onOpenChange: (open: boolean) => void
}) {
  const block = state.block
  const [title, setTitle] = useState(block?.title ?? "")
  const [description, setDescription] = useState(block?.description ?? "")
  const [minutes, setMinutes] = useState(block?.estimated_minutes ? String(block.estimated_minutes) : "")
  const [isPending, startTransition] = useTransition()

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const input = { title, description, estimated_minutes: minutes === "" ? null : Number(minutes) }
    startTransition(async () => {
      const result = block ? await updateBriefingBlock(block.id, input) : await createBriefingBlock(templateId, input)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onOpenChange(false)
      toast.success(block ? "Bloco salvo." : "Bloco criado no fim do formulário.")
    })
  }

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{block ? "Editar bloco" : "Novo bloco"}</DialogTitle>
            <DialogDescription>O cliente vê o título, a descrição e o tempo no começo de cada etapa.</DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="bloco-titulo">Título</Label>
            <Input id="bloco-titulo" value={title} maxLength={120} required onChange={(event) => setTitle(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bloco-descricao">Descrição</Label>
            <Textarea
              id="bloco-descricao"
              value={description}
              maxLength={500}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="Ex.: Quem é o seu cliente e como ele decide."
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="bloco-tempo">Tempo estimado (minutos)</Label>
            <Input
              id="bloco-tempo"
              type="number"
              inputMode="numeric"
              min={1}
              max={60}
              value={minutes}
              onChange={(event) => setMinutes(event.target.value)}
              className="w-28"
            />
          </div>
          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Salvando…" : block ? "Salvar bloco" : "Criar bloco"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Pergunta                                                            */
/* ------------------------------------------------------------------ */

function QuestionDialog({
  state,
  blocks,
  answers,
  onOpenChange,
}: {
  state: QuestionDialogState
  blocks: TeamBriefingBlock[]
  answers: number
  onOpenChange: (open: boolean) => void
}) {
  const question = state.question
  const [blockId, setBlockId] = useState(question?.block_id ?? state.blockId ?? blocks[1]?.id ?? blocks[0]?.id ?? "")
  const [text, setText] = useState(question?.text ?? "")
  const [hint, setHint] = useState(question?.hint ?? "")
  const [kind, setKind] = useState<BriefingQuestionKind>(question?.kind ?? "audio")
  const [required, setRequired] = useState(question?.required ?? false)
  const [options, setOptions] = useState<BriefingQuestionOptions>(question?.options ?? defaultOptions("audio"))
  const [isPending, startTransition] = useTransition()
  const fixed = kind === "identification"
  const features = optionFeatures(kind)
  const blockOptions = blocks.filter((block) => block.position !== 0 || block.id === blockId)

  function changeKind(next: BriefingQuestionKind) {
    setOptions((current) => convertOptions(current, next))
    setKind(next)
  }

  function submit(event: React.FormEvent) {
    event.preventDefault()
    const input = { block_id: blockId, text, hint, kind, required, options }
    startTransition(async () => {
      const result = question ? await updateBriefingQuestion(question.id, input) : await createBriefingQuestion(blockId, input)
      if (!result.ok) {
        toast.error(result.error)
        return
      }
      onOpenChange(false)
      toast.success(question ? "Pergunta salva." : "Pergunta criada no fim do bloco.")
    })
  }

  return (
    <Dialog open={state.open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <form onSubmit={submit} className="space-y-5">
          <DialogHeader>
            <DialogTitle>{question ? "Editar pergunta" : "Nova pergunta"}</DialogTitle>
            <DialogDescription>
              {answers > 0
                ? `Esta pergunta já tem ${answers} resposta${answers === 1 ? "" : "s"}. Quem já enviou continua vendo o texto de quando respondeu.`
                : "Aparece para os briefings novos e para os que estão em preenchimento."}
            </DialogDescription>
          </DialogHeader>

          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label htmlFor="pergunta-bloco">Bloco</Label>
              <Select value={blockId} onValueChange={setBlockId} disabled={fixed}>
                <SelectTrigger id="pergunta-bloco" className="w-full shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {blockOptions.map((block) => (
                    <SelectItem key={block.id} value={block.id}>
                      {block.position}. {block.title}
                      {!block.active ? " (desativado)" : ""}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="pergunta-tipo">Tipo</Label>
              <Select value={kind} onValueChange={(value) => changeKind(value as BriefingQuestionKind)} disabled={fixed}>
                <SelectTrigger id="pergunta-tipo" className="w-full shadow-none">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper" align="start">
                  {(fixed ? (["identification"] as const) : EDITABLE_KINDS).map((option) => (
                    <SelectItem key={option} value={option}>
                      {QUESTION_KIND_LABEL[option]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pergunta-texto">Pergunta</Label>
            <Textarea id="pergunta-texto" value={text} maxLength={500} required onChange={(event) => setText(event.target.value)} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="pergunta-dica">Dica, com um exemplo curto</Label>
            <Textarea
              id="pergunta-dica"
              value={hint}
              maxLength={500}
              onChange={(event) => setHint(event.target.value)}
              placeholder='Ex.: "Bolos de festa sob encomenda e doces finos pra casamento."'
            />
          </div>

          <label className="flex items-center gap-2 text-[13.5px] text-foreground">
            <Checkbox checked={required} onCheckedChange={(value) => setRequired(value === true)} />
            Obrigatória (o cliente só envia com ela respondida)
          </label>

          {fixed ? (
            <p className="rounded-xl border bg-card px-4 py-3 text-xs leading-5 text-muted-foreground">
              Os campos da identificação (marca, responsável, região, @ e site) são fixos: a equipe confere ao liberar e o
              cliente confirma no começo.
            </p>
          ) : (
            <OptionsEditor kind={kind} features={features} options={options} onChange={setOptions} />
          )}

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancelar
            </Button>
            <Button type="submit" disabled={isPending || !blockId}>
              {isPending ? "Salvando…" : question ? "Salvar pergunta" : "Criar pergunta"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}

/* ------------------------------------------------------------------ */
/* Opções por tipo                                                     */
/* ------------------------------------------------------------------ */

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <fieldset className="space-y-2 rounded-xl border px-4 py-3">
      <legend className="eyebrow px-1 text-muted-foreground">{title}</legend>
      {hint ? <p className="text-xs leading-5 text-muted-foreground">{hint}</p> : null}
      {children}
    </fieldset>
  )
}

/** Lista editável (opções, cards, campos, complementos): adicionar, tirar e reordenar. */
function ListEditor<T>({
  items,
  onChange,
  empty,
  addLabel,
  max,
  render,
}: {
  items: T[]
  onChange: (items: T[]) => void
  empty: () => T
  addLabel: string
  max: number
  render: (item: T, update: (patch: Partial<T>) => void, index: number) => ReactNode
}) {
  function move(index: number, delta: number) {
    const target = index + delta
    if (target < 0 || target >= items.length) return
    const next = [...items]
    const [item] = next.splice(index, 1)
    next.splice(target, 0, item!)
    onChange(next)
  }
  return (
    <div className="space-y-2">
      {items.map((item, index) => (
        <div key={index} className="flex items-start gap-1.5">
          <div className="min-w-0 flex-1">
            {render(item, (patch) => onChange(items.map((current, i) => (i === index ? { ...current, ...patch } : current))), index)}
          </div>
          <div className="flex shrink-0 items-center">
            <Button type="button" variant="ghost" size="icon" className="size-8" aria-label="Subir" disabled={index === 0} onClick={() => move(index, -1)}>
              <ArrowUp />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8"
              aria-label="Descer"
              disabled={index === items.length - 1}
              onClick={() => move(index, 1)}
            >
              <ArrowDown />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-8 text-muted-foreground"
              aria-label="Tirar"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              <Trash2 />
            </Button>
          </div>
        </div>
      ))}
      {items.length < max ? (
        <Button type="button" variant="ghost" size="sm" className="h-8 gap-1 px-2 text-xs" onClick={() => onChange([...items, empty()])}>
          <Plus className="size-3.5" />
          {addLabel}
        </Button>
      ) : null}
    </div>
  )
}

function OptionsEditor({
  kind,
  features,
  options,
  onChange,
}: {
  kind: BriefingQuestionKind
  features: ReturnType<typeof optionFeatures>
  options: BriefingQuestionOptions
  onChange: (options: BriefingQuestionOptions) => void
}) {
  function patch(next: Partial<BriefingQuestionOptions>) {
    onChange({ ...options, ...next })
  }

  return (
    <div className="space-y-4">
      {features.choices ? (
        <Section title="Opções" hint="O cliente toca para escolher. Mudar o nome de uma opção não muda o que já foi respondido.">
          <ListEditor<BriefingChoice>
            items={options.choices ?? []}
            onChange={(choices) => patch({ choices })}
            empty={() => ({ value: "", label: "" })}
            addLabel="Opção"
            max={20}
            render={(choice, update, index) => (
              <div className="grid gap-1.5 sm:grid-cols-2">
                <Input aria-label={`Opção ${index + 1}`} value={choice.label} maxLength={120} placeholder="Ex.: Indicação de clientes" onChange={(event) => update({ label: event.target.value })} />
                <Input
                  aria-label={`Exemplo da opção ${index + 1}`}
                  value={choice.example ?? ""}
                  maxLength={300}
                  placeholder="Exemplo (opcional)"
                  onChange={(event) => update({ example: event.target.value })}
                />
              </div>
            )}
          />
        </Section>
      ) : null}

      {features.cards ? (
        <Section title="Cards" hint="Cada card tem um nome, o que ele quer dizer e um exemplo de abertura de post.">
          <ListEditor<BriefingToneCard>
            items={options.cards ?? []}
            onChange={(cards) => patch({ cards })}
            empty={() => ({ value: "", label: "", description: "", example: "" })}
            addLabel="Card"
            max={12}
            render={(card, update, index) => (
              <div className="grid gap-1.5 rounded-lg border px-2.5 py-2.5">
                <div className="grid gap-1.5 sm:grid-cols-2">
                  <Input aria-label={`Nome do card ${index + 1}`} value={card.label} maxLength={120} placeholder="Ex.: Acolhedora" onChange={(event) => update({ label: event.target.value })} />
                  <Input
                    aria-label={`Descrição do card ${index + 1}`}
                    value={card.description ?? ""}
                    maxLength={300}
                    placeholder="Ex.: Abraça, cuida, entende a pessoa."
                    onChange={(event) => update({ description: event.target.value })}
                  />
                </div>
                <Textarea
                  aria-label={`Exemplo do card ${index + 1}`}
                  value={card.example ?? ""}
                  maxLength={500}
                  placeholder="Exemplo de abertura de post"
                  onChange={(event) => update({ example: event.target.value })}
                  className="min-h-12"
                />
              </div>
            )}
          />
        </Section>
      ) : null}

      {features.fields ? (
        <Section title="Campos lado a lado" hint="Opcional: dois ou mais campos de texto na mesma pergunta (ex.: palavras que usa / palavras a evitar).">
          <ListEditor<BriefingField>
            items={options.fields ?? []}
            onChange={(fields) => patch({ fields })}
            empty={() => ({ key: "", label: "" })}
            addLabel="Campo"
            max={6}
            render={(field, update, index) => (
              <div className="grid gap-1.5 sm:grid-cols-2">
                <Input aria-label={`Nome do campo ${index + 1}`} value={field.label} maxLength={120} placeholder="Nome do campo" onChange={(event) => update({ label: event.target.value })} />
                <Input
                  aria-label={`Exemplo do campo ${index + 1}`}
                  value={field.placeholder ?? ""}
                  maxLength={200}
                  placeholder="Exemplo (opcional)"
                  onChange={(event) => update({ placeholder: event.target.value })}
                />
              </div>
            )}
          />
        </Section>
      ) : null}

      {features.accept ? (
        <Section title="Arquivos aceitos">
          <div className="flex flex-wrap gap-x-5 gap-y-2">
            {UPLOAD_ACCEPT_OPTIONS.map((option) => {
              const checked = options.accept?.includes(option.value) ?? false
              return (
                <label key={option.value} className="flex items-center gap-2 text-[13.5px] text-foreground">
                  <Checkbox
                    checked={checked}
                    onCheckedChange={(value) =>
                      patch({
                        accept:
                          value === true
                            ? [...(options.accept ?? []), option.value]
                            : (options.accept ?? []).filter((item) => item !== option.value),
                      })
                    }
                  />
                  {option.label}
                </label>
              )
            })}
          </div>
        </Section>
      ) : null}

      {features.max || features.primary || features.other || features.voice || features.unit || features.placeholder ? (
        <Section title="Ajustes">
          <div className="grid gap-3 sm:grid-cols-2">
            {features.max ? (
              <div className="space-y-1.5">
                <Label htmlFor="pergunta-max">{kind === "links" ? "Quantos links, no máximo" : "Quantas escolhas, no máximo"}</Label>
                <Input
                  id="pergunta-max"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={20}
                  value={options.max ?? ""}
                  placeholder="Sem limite"
                  onChange={(event) => patch({ max: event.target.value === "" ? undefined : Number(event.target.value) })}
                  className="w-32"
                />
              </div>
            ) : null}
            {features.placeholder ? (
              <div className="space-y-1.5">
                <Label htmlFor="pergunta-placeholder">Texto de exemplo do campo</Label>
                <Input
                  id="pergunta-placeholder"
                  value={options.placeholder ?? ""}
                  maxLength={200}
                  placeholder={kind === "number" ? "180,00" : kind === "links" ? "@perfil" : "sentindo…"}
                  onChange={(event) => patch({ placeholder: event.target.value || undefined })}
                />
              </div>
            ) : null}
          </div>
          <div className="flex flex-col gap-2 pt-1">
            {features.unit ? (
              <ToggleRow checked={options.unit === "BRL"} onChange={(value) => patch({ unit: value ? "BRL" : undefined })}>
                Valor em reais (R$)
              </ToggleRow>
            ) : null}
            {features.other ? (
              <ToggleRow checked={options.other === true} onChange={(value) => patch({ other: value || undefined })}>
                Aceita “Outro”, com texto
              </ToggleRow>
            ) : null}
            {features.primary ? (
              <ToggleRow checked={options.primary === true} onChange={(value) => patch({ primary: value || undefined })}>
                Com duas escolhas, pede a principal
              </ToggleRow>
            ) : null}
            {features.voice ? (
              <ToggleRow checked={options.voice === "essential"} onChange={(value) => patch({ voice: value ? "essential" : undefined })}>
                Fala essencial (a pergunta que mais precisa do áudio)
              </ToggleRow>
            ) : null}
          </div>
        </Section>
      ) : null}

      {features.extras ? (
        <Section title="Complementos" hint="Opcional: um campo a mais embaixo da resposta (ex.: a meta em números, a frase que já ouviu).">
          <ListEditor<BriefingExtra>
            items={options.extras ?? []}
            onChange={(extras) => patch({ extras })}
            empty={() => ({ key: "", kind: "short_text", label: "" })}
            addLabel="Complemento"
            max={4}
            render={(extra, update, index) => (
              <div className="grid gap-1.5 rounded-lg border px-2.5 py-2.5">
                <div className="grid gap-1.5 sm:grid-cols-[minmax(0,1fr)_170px]">
                  <Input aria-label={`Nome do complemento ${index + 1}`} value={extra.label} maxLength={120} placeholder="Ex.: Tem uma meta em números?" onChange={(event) => update({ label: event.target.value })} />
                  <Select value={extra.kind} onValueChange={(value) => update({ kind: value as BriefingExtra["kind"] })}>
                    <SelectTrigger aria-label={`Tipo do complemento ${index + 1}`} className="w-full shadow-none">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent position="popper" align="start">
                      {EXTRA_KINDS.map((option) => (
                        <SelectItem key={option} value={option}>
                          {EXTRA_KIND_LABEL[option]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    aria-label={`Exemplo do complemento ${index + 1}`}
                    value={extra.placeholder ?? ""}
                    maxLength={200}
                    placeholder="Exemplo (opcional)"
                    onChange={(event) => update({ placeholder: event.target.value })}
                    className="min-w-0 flex-1"
                  />
                  <ToggleRow checked={extra.required === true} onChange={(value) => update({ required: value || undefined })}>
                    Obrigatório
                  </ToggleRow>
                </div>
              </div>
            )}
          />
        </Section>
      ) : null}
    </div>
  )
}

function ToggleRow({ checked, onChange, children }: { checked: boolean; onChange: (value: boolean) => void; children: ReactNode }) {
  return (
    <label className="flex items-center gap-2 text-[13.5px] text-foreground">
      <Checkbox checked={checked} onCheckedChange={(value) => onChange(value === true)} />
      {children}
    </label>
  )
}
