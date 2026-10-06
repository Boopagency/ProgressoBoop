"use client"

import "@blocknote/shadcn/style.css"

import { filterSuggestionItems, type PartialBlock } from "@blocknote/core"
import { pt } from "@blocknote/core/locales"
import {
  getDefaultReactSlashMenuItems,
  SuggestionMenuController,
  useCreateBlockNote,
} from "@blocknote/react"
import { BlockNoteView } from "@blocknote/shadcn"
import {
  useEffect,
  useEffectEvent,
  useImperativeHandle,
  useRef,
  type RefObject,
} from "react"
import { toast } from "sonner"

import { getDocContent, saveDocContent } from "@/features/docs/actions"
import { uploadDocImage } from "@/features/docs/image-upload"
import { checklistItems, headings, type ChecklistItem, type Heading } from "@/features/docs/logic"
import { cn } from "@/lib/utils"

/*
 * Editor dos Processos (BlockNote). Só roda no navegador: a página carrega
 * este módulo com next/dynamic (ssr: false).
 *
 * Salva sozinho pouco depois de parar de digitar. Cada salvamento leva o
 * carimbo do conteúdo que a pessoa tinha (`stamp`); se outra pessoa salvou
 * no meio do caminho, o servidor recusa e a página mostra o conflito.
 */

export type SaveState = "saved" | "dirty" | "saving" | "error" | "conflict"

export interface Conflict {
  /** Quem salvou a outra versão, e quando. */
  by: string | null
  at: string
}

export interface Outline {
  headings: Heading[]
  checklist: ChecklistItem[]
}

export interface EditorController {
  /** Salva agora o que estiver pendente. `true` quando está tudo salvo. */
  flush: () => Promise<boolean>
  /** Descarta o que não foi salvo e carrega o conteúdo atual do banco. */
  reload: () => Promise<boolean>
  /** Depois de um conflito: salva o conteúdo do editor por cima. */
  overwrite: () => Promise<boolean>
  /** Troca o conteúdo do editor (ex.: depois de restaurar uma versão). */
  load: (content: unknown[], stamp: string) => void
  /** Rola até um bloco (índice "Neste documento"). */
  scrollTo: (blockId: string) => void
}

const SAVE_DELAY = 1200
const RETRY_DELAY = 8000
/** Ao voltar para a aba, confere se alguém salvou (no máximo a cada 30 s). */
const FOCUS_CHECK_INTERVAL = 30_000

const DICTIONARY = {
  ...pt,
  placeholders: {
    ...pt.placeholders,
    default: "Escreva, ou digite “/” para inserir um bloco",
    emptyDocument: "Comece a escrever, ou digite “/” para inserir títulos, listas, tabelas e imagens",
  },
  slash_menu: {
    ...pt.slash_menu,
    check_list: {
      ...pt.slash_menu.check_list,
      title: "Checklist",
      subtext: "Itens para marcar (viram tarefas com “Gerar tarefas”)",
      aliases: [...pt.slash_menu.check_list.aliases, "checklist", "tarefa", "check"],
    },
    bullet_list: { ...pt.slash_menu.bullet_list, title: "Lista" },
    numbered_list: { ...pt.slash_menu.numbered_list, title: "Lista numerada" },
  },
}

/** Blocos que não oferecemos no menu "/" (só imagens são enviadas ao Storage). */
const HIDDEN_SLASH_ITEMS = new Set(
  (
    [
      "video",
      "audio",
      "file",
      "heading_4",
      "heading_5",
      "heading_6",
      "toggle_heading",
      "toggle_heading_2",
      "toggle_heading_3",
    ] as const
  ).map((key) => DICTIONARY.slash_menu[key].title)
)

function asBlocks(content: unknown[]): PartialBlock[] | undefined {
  return content.length > 0 ? (content as PartialBlock[]) : undefined
}

function outlineOf(blocks: unknown): Outline {
  return { headings: headings(blocks), checklist: checklistItems(blocks) }
}

function newer(stamp: string, than: string): boolean {
  return Date.parse(stamp) > Date.parse(than)
}

export function DocEditor({
  docId,
  content,
  stamp,
  onSaveState,
  onOutline,
  controller,
  className,
}: {
  docId: string
  /** Conteúdo e carimbo vindos do servidor (os mais recentes que a página conhece). */
  content: unknown[]
  stamp: string
  onSaveState: (state: SaveState, conflict?: Conflict) => void
  onOutline: (outline: Outline) => void
  controller: RefObject<EditorController | null>
  className?: string
}) {
  const editor = useCreateBlockNote({
    initialContent: asBlocks(content),
    dictionary: DICTIONARY,
    tables: { headers: true, splitCells: true, cellBackgroundColor: true, cellTextColor: true },
    uploadFile: async (file) => {
      try {
        return await uploadDocImage(docId, file)
      } catch (error) {
        toast.error(error instanceof Error ? error.message : "Não foi possível enviar a imagem.")
        throw error
      }
    },
  })

  // Estado do salvamento fora do React: muda a cada tecla e não precisa renderizar.
  const stampRef = useRef(stamp)
  const dirtyRef = useRef(false)
  const conflictRef = useRef(false)
  const loadingRef = useRef(false)
  const failuresRef = useRef(0)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const queueRef = useRef<Promise<boolean>>(Promise.resolve(true))
  const outlineRef = useRef("")
  const checkedAtRef = useRef(0)

  function emitOutline() {
    const outline = outlineOf(editor.document)
    const key = JSON.stringify(outline)
    if (key === outlineRef.current) return
    outlineRef.current = key
    onOutline(outline)
  }

  function schedule(delay = SAVE_DELAY) {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = setTimeout(() => void save(), delay)
  }

  async function saveNow(force: boolean): Promise<boolean> {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    if (!dirtyRef.current && !force) return !conflictRef.current
    if (conflictRef.current && !force) return false

    dirtyRef.current = false
    onSaveState("saving")
    try {
      const result = await saveDocContent(docId, editor.document, stampRef.current, force)
      if (result.ok) {
        stampRef.current = result.data.stamp
        conflictRef.current = false
        failuresRef.current = 0
        if (dirtyRef.current) {
          onSaveState("dirty")
          schedule()
        } else {
          onSaveState("saved")
        }
        return true
      }
      dirtyRef.current = true
      if (result.conflict) {
        conflictRef.current = true
        onSaveState("conflict", result.conflict)
        return false
      }
      failuresRef.current += 1
      onSaveState("error")
      if (failuresRef.current === 1) toast.error(result.error)
      schedule(RETRY_DELAY)
      return false
    } catch {
      // Sem conexão (ou o servidor caiu): tenta de novo em alguns segundos.
      dirtyRef.current = true
      failuresRef.current += 1
      onSaveState("error")
      if (failuresRef.current === 1) {
        toast.error("Sem conexão. As alterações serão salvas quando a conexão voltar.")
      }
      schedule(RETRY_DELAY)
      return false
    }
  }

  /** Um salvamento por vez, na ordem. */
  function save(force = false): Promise<boolean> {
    const next = queueRef.current.then(() => saveNow(force))
    queueRef.current = next.catch(() => false)
    return next
  }

  function load(nextContent: unknown[], nextStamp: string) {
    if (timerRef.current) clearTimeout(timerRef.current)
    timerRef.current = null
    loadingRef.current = true
    try {
      editor.replaceBlocks(editor.document, asBlocks(nextContent) ?? [{ type: "paragraph" }])
    } finally {
      loadingRef.current = false
    }
    stampRef.current = nextStamp
    dirtyRef.current = false
    conflictRef.current = false
    failuresRef.current = 0
    onSaveState("saved")
    emitOutline()
  }

  async function reload(): Promise<boolean> {
    const result = await getDocContent(docId)
    if (!result.ok) {
      toast.error(result.error)
      return false
    }
    load(result.data.content, result.data.stamp)
    return true
  }

  useImperativeHandle(controller, () => ({
    flush: () => save(),
    reload,
    overwrite: () => save(true),
    load,
    scrollTo: (blockId) => {
      const element = document.querySelector(`.boop-editor [data-id="${CSS.escape(blockId)}"]`)
      element?.scrollIntoView({ behavior: "smooth", block: "start" })
    },
  }))

  function handleChange() {
    if (loadingRef.current) return
    dirtyRef.current = true
    if (!conflictRef.current) {
      onSaveState("dirty")
      schedule()
    }
    emitOutline()
  }

  // A página recebeu do servidor um conteúdo mais novo (outra pessoa salvou e
  // a tela foi atualizada): sem nada pendente aqui, mostra o novo.
  const onServerContent = useEffectEvent(() => {
    if (!newer(stamp, stampRef.current) || dirtyRef.current || conflictRef.current) return
    load(content, stamp)
  })
  useEffect(() => onServerContent(), [stamp])

  // Ao voltar para a aba: salva o pendente; sem pendências, confere se
  // alguém salvou uma versão mais nova enquanto isso.
  const onVisibilityChange = useEffectEvent(() => {
    if (document.visibilityState === "hidden") {
      if (dirtyRef.current && !conflictRef.current) void save()
      return
    }
    if (dirtyRef.current || conflictRef.current) return
    if (Date.now() - checkedAtRef.current < FOCUS_CHECK_INTERVAL) return
    checkedAtRef.current = Date.now()
    void getDocContent(docId).then((result) => {
      if (!result.ok || dirtyRef.current || conflictRef.current) return
      if (!newer(result.data.stamp, stampRef.current)) return
      load(result.data.content, result.data.stamp)
      toast("Documento atualizado", { description: "Alguém salvou uma versão mais nova." })
    })
  })

  // Ctrl/⌘ + S salva na hora (em vez de abrir o "Salvar página" do navegador).
  const onKeyDown = useEffectEvent((event: KeyboardEvent) => {
    if (event.key.toLowerCase() !== "s" || !(event.metaKey || event.ctrlKey)) return
    event.preventDefault()
    void save()
  })

  const onMount = useEffectEvent(() => {
    checkedAtRef.current = Date.now()
    emitOutline()
  })

  // Saindo da página com algo pendente: salva sem esperar o intervalo.
  const onUnmount = useEffectEvent(() => {
    if (timerRef.current) clearTimeout(timerRef.current)
    if (dirtyRef.current && !conflictRef.current) void save()
  })

  useEffect(() => {
    onMount()
    document.addEventListener("visibilitychange", onVisibilityChange)
    window.addEventListener("keydown", onKeyDown)
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange)
      window.removeEventListener("keydown", onKeyDown)
      onUnmount()
    }
  }, [])

  return (
    <BlockNoteView
      editor={editor}
      theme="light"
      slashMenu={false}
      onChange={handleChange}
      className={cn("boop-editor", className)}
    >
      <SuggestionMenuController
        triggerCharacter="/"
        getItems={async (query) =>
          filterSuggestionItems(
            getDefaultReactSlashMenuItems(editor).filter((item) => !HIDDEN_SLASH_ITEMS.has(item.title)),
            query
          )
        }
      />
    </BlockNoteView>
  )
}

/** Visualização somente leitura (versões anteriores). */
export function DocPreview({ content, className }: { content: unknown[]; className?: string }) {
  const editor = useCreateBlockNote({
    initialContent: asBlocks(content),
    dictionary: DICTIONARY,
    tables: { headers: true, splitCells: true, cellBackgroundColor: true, cellTextColor: true },
  })
  return (
    <BlockNoteView
      editor={editor}
      theme="light"
      editable={false}
      formattingToolbar={false}
      linkToolbar={false}
      slashMenu={false}
      sideMenu={false}
      filePanel={false}
      tableHandles={false}
      emojiPicker={false}
      className={cn("boop-editor boop-editor-preview", className)}
    />
  )
}
