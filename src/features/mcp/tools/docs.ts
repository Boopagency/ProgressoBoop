import "server-only"

import { blocksToText, needsReview } from "@/features/docs/logic"
import { insertDoc, patchDoc, writeDocContent, writeDocReviewed } from "@/features/docs/mutations"
import { TEMPLATES } from "@/features/docs/templates"
import type { McpContext } from "@/features/mcp/auth"
import {
  bullet,
  excerpt,
  findByName,
  isClear,
  joinSections,
  readBoolean,
  readRequiredText,
  readText,
  textToBlocks,
  type Parsed,
} from "@/features/mcp/logic"
import { textResult, toolError, type Tool } from "@/features/mcp/protocol"
import { loadDirectory, namesOf, type Directory } from "@/features/mcp/queries"
import { EDIT, READ_ONLY, WRITE, enumOptions, enumValue, findClient, findPerson, limited } from "@/features/mcp/tools/common"
import { formatShortDate } from "@/lib/dates"
import { DOC_KINDS, DOC_KIND_LABEL, DOC_STATUSES, DOC_STATUS_LABEL, TASK_AREAS, TASK_AREA_LABEL } from "@/lib/labels"
import { foldText } from "@/lib/text"
import type { DocSummary, TaskArea } from "@/lib/types"

/*
 * Processos pelo conector: buscar, ler, criar (com modelo), editar os dados
 * e o conteúdo (substituir ou acrescentar) e marcar como revisado. O
 * conteúdo vai como texto simples e vira blocos do editor (textToBlocks).
 * As gravações passam por features/docs/mutations.ts; o banco guarda a
 * versão anterior a cada mudança.
 */

type Args = Record<string, unknown>

const SUMMARY_COLUMNS =
  "id, title, kind, status, area, client_id, owner_id, summary, review_every_months, reviewed_on, next_review_on, pinned, created_by, updated_by, content_updated_at, content_updated_by, created_at, updated_at"

async function loadDocs(context: McpContext): Promise<Parsed<DocSummary[]>> {
  const { data, error } = await context.supabase.from("docs").select(SUMMARY_COLUMNS).order("title").limit(1000)
  return error ? { ok: false, error: "Não foi possível ler os processos." } : { ok: true, value: data }
}

async function findDoc(context: McpContext, query: string): Promise<Parsed<DocSummary>> {
  const docs = await loadDocs(context)
  if (!docs.ok) return docs
  return findByName(docs.value, query, (doc) => doc.title, (doc) => doc.id, "processo")
}

const DOC_ARG = { type: "string", description: "Id (de preferência) ou título do processo." } as const

const DOC_FIELDS = {
  titulo: { type: "string", maxLength: 200 },
  tipo: { type: "string", enum: enumOptions(DOC_KINDS, DOC_KIND_LABEL) },
  status: { type: "string", enum: enumOptions(DOC_STATUSES, DOC_STATUS_LABEL) },
  area: { type: "string", enum: enumOptions(TASK_AREAS, TASK_AREA_LABEL), description: "\"nenhum\" tira." },
  cliente: { type: "string", description: "Nome (ou id) do cliente. \"nenhum\" tira." },
  responsavel: { type: "string", description: "Pessoa da equipe (\"eu\" = você). \"nenhum\" tira." },
  resumo: { type: "string", maxLength: 500, description: "Para que serve, em uma frase. \"nenhum\" apaga." },
  revisar_a_cada_meses: { type: ["integer", "null"], minimum: 1, maximum: 24, description: "null = sem revisão periódica." },
  fixado: { type: "boolean" },
} as const

const CONTENT_HELP =
  "Texto simples; cada linha vira um bloco: \"# \", \"## \" e \"### \" títulos, \"- \" lista, \"1. \" passos, \"[ ] \" item de checklist, o resto parágrafo."

function readDocPatch(args: Args, context: McpContext, directory: Directory): Parsed<Record<string, unknown>> {
  const patch: Record<string, unknown> = {}
  if ("titulo" in args) patch.title = args.titulo
  if ("resumo" in args) patch.summary = isClear(args.resumo) ? null : args.resumo
  if ("revisar_a_cada_meses" in args) patch.review_every_months = args.revisar_a_cada_meses ?? null
  if ("fixado" in args) patch.pinned = readBoolean(args, "fixado")
  const enums = [
    ["tipo", "kind", DOC_KINDS, DOC_KIND_LABEL],
    ["status", "status", DOC_STATUSES, DOC_STATUS_LABEL],
    ["area", "area", TASK_AREAS, TASK_AREA_LABEL],
  ] as const
  for (const [key, field, values, labels] of enums) {
    if (!(key in args)) continue
    if (key === "area" && isClear(args.area)) {
      patch.area = null
      continue
    }
    const raw = readText(args, key, 40)
    const value = enumValue(raw.ok ? raw.value : null, values as readonly string[], labels as Record<string, string>)
    if (!value) return { ok: false, error: `Valor inválido em "${key}". Opções: ${values.map((option) => (labels as Record<string, string>)[option]).join(", ")}.` }
    patch[field] = value
  }
  if ("cliente" in args) {
    if (isClear(args.cliente)) patch.client_id = null
    else {
      const client = findClient(directory, String(args.cliente))
      if (!client.ok) return client
      patch.client_id = client.value.id
    }
  }
  if ("responsavel" in args) {
    if (isClear(args.responsavel)) patch.owner_id = null
    else {
      const person = findPerson(directory, String(args.responsavel), context.user.id)
      if (!person.ok) return person
      patch.owner_id = person.value.id
    }
  }
  return { ok: true, value: patch }
}

/** Grava o conteúdo novo (substitui ou acrescenta ao fim), conferindo que ninguém salvou no meio-tempo. */
async function saveContent(context: McpContext, id: string, text: string, append: boolean): Promise<Parsed<null>> {
  const { data, error } = await context.supabase.from("docs").select("content, content_updated_at").eq("id", id).maybeSingle()
  if (error || !data) return { ok: false, error: "Não foi possível ler o processo." }
  const blocks = textToBlocks(text)
  const content = append ? [...(Array.isArray(data.content) ? data.content : []), ...blocks] : blocks
  const saved = await writeDocContent(context.supabase, id, content, data.content_updated_at)
  if (!saved.ok) return { ok: false, error: saved.conflict ? "Alguém salvou o processo agora mesmo. Leia de novo e tente outra vez." : saved.error }
  return { ok: true, value: null }
}

/* ------------------------------------------------------------------ */
/* Buscar e ler                                                        */
/* ------------------------------------------------------------------ */

const listDocs: Tool<McpContext> = {
  name: "processos",
  title: "Processos",
  description: "Lista ou busca os processos, checklists, políticas e guias (título, resumo e o texto inteiro, sem acento), com tipo, situação, área, cliente e se precisa revisar.",
  inputSchema: {
    type: "object",
    properties: {
      texto: { type: "string", description: "O que procurar (no título, no resumo ou no conteúdo)." },
      cliente: { type: "string", description: "Só os de um cliente." },
      a_revisar: { type: "boolean", description: "Só os que precisam de revisão." },
    },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const [directory, docs] = await Promise.all([loadDirectory(supabase), loadDocs(context)])
    if (!docs.ok) return toolError(docs.error)
    let shown = docs.value
    const query = readText(args, "texto", 120)
    if (!query.ok) return toolError(query.error)
    if (query.value) {
      const folded = foldText(query.value)
      const { data: hits } = folded.length >= 3
        ? await supabase.from("docs").select("id").textSearch("search", folded, { config: "portuguese", type: "websearch" }).limit(100)
        : { data: [] as { id: string }[] }
      const hitIds = new Set((hits ?? []).map((hit) => hit.id))
      shown = shown.filter((doc) => hitIds.has(doc.id) || foldText(`${doc.title} ${doc.summary ?? ""}`).includes(folded))
    }
    if ("cliente" in args && !isClear(args.cliente)) {
      const client = findClient(directory, String(args.cliente))
      if (!client.ok) return toolError(client.error)
      shown = shown.filter((doc) => doc.client_id === client.value.id)
    }
    if (readBoolean(args, "a_revisar")) shown = shown.filter((doc) => needsReview(doc, today))
    const names = namesOf(directory)
    const lines = shown.map((doc) =>
      bullet(
        doc.title,
        DOC_KIND_LABEL[doc.kind],
        DOC_STATUS_LABEL[doc.status],
        doc.area ? TASK_AREA_LABEL[doc.area] : null,
        names.client(doc.client_id),
        needsReview(doc, today) ? "precisa revisar" : null,
        doc.summary ? excerpt(doc.summary, 100) : null,
        `id ${doc.id}`
      )
    )
    return textResult(`${lines.length > 0 ? limited(lines).join("\n") : "Nenhum processo encontrado."}\n\nNo Boop Admin: ${origin}/processos`)
  },
}

const readDoc: Tool<McpContext> = {
  name: "ler_processo",
  title: "Ler processo",
  description: "O processo inteiro: dados (tipo, situação, área, cliente, responsável, revisão) e o conteúdo em texto.",
  inputSchema: { type: "object", properties: { processo: DOC_ARG }, required: ["processo"], additionalProperties: false },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const query = readRequiredText(args, "processo", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findDoc(context, query.value)
    if (!found.ok) return toolError(found.error)
    const doc = found.value
    const [directory, { data, error }] = await Promise.all([loadDirectory(supabase), supabase.from("docs").select("content").eq("id", doc.id).maybeSingle()])
    if (error || !data) return toolError("Não foi possível ler o processo.")
    const names = namesOf(directory)
    return textResult(
      joinSections(
        `${DOC_KIND_LABEL[doc.kind]} "${doc.title}" (id ${doc.id})`,
        [
          bullet(DOC_STATUS_LABEL[doc.status], doc.area ? TASK_AREA_LABEL[doc.area] : null, names.client(doc.client_id), names.person(doc.owner_id) ? `responsável ${names.person(doc.owner_id)}` : null),
          bullet(
            doc.reviewed_on ? `revisado em ${formatShortDate(doc.reviewed_on, today)}` : "nunca revisado",
            doc.next_review_on ? `próxima revisão ${formatShortDate(doc.next_review_on, today)}` : "sem revisão periódica",
            needsReview(doc, today) ? "precisa revisar" : null
          ),
          doc.summary ? `- Resumo: ${doc.summary}` : null,
        ]
          .filter(Boolean)
          .join("\n"),
        blocksToText(data.content) || "(sem conteúdo)"
      ) + `\n\n${origin}/processos/${doc.id}`
    )
  },
}

/* ------------------------------------------------------------------ */
/* Criar, editar, revisar                                              */
/* ------------------------------------------------------------------ */

const TEMPLATE_OPTIONS = TEMPLATES.map((template) => `${template.id} (${template.label})`).join(", ")

const createDoc: Tool<McpContext> = {
  name: "criar_processo",
  title: "Criar processo",
  description: `Cria um processo, checklist, política ou guia, opcionalmente a partir de um modelo (${TEMPLATE_OPTIONS}; os de cliente pedem o cliente). Com \`conteudo\`, ele substitui o texto do modelo.`,
  inputSchema: {
    type: "object",
    properties: {
      titulo: { type: "string", maxLength: 200 },
      modelo: { type: "string", description: "Id ou nome do modelo. Padrão: em branco." },
      area: DOC_FIELDS.area,
      cliente: DOC_FIELDS.cliente,
      conteudo: { type: "string", description: CONTENT_HELP },
    },
    required: ["titulo"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const { supabase, user, origin } = context
    const directory = await loadDirectory(supabase)
    let template: (typeof TEMPLATES)[number] | undefined
    if ("modelo" in args && !isClear(args.modelo)) {
      const found = findByName(TEMPLATES, String(args.modelo), (item) => item.label, (item) => item.id, "modelo")
      template = TEMPLATES.find((item) => item.id === String(args.modelo)) ?? (found.ok ? found.value : undefined)
      if (!template) return toolError(`Modelo não encontrado. Opções: ${TEMPLATE_OPTIONS}.`)
    }
    const links = Object.fromEntries(Object.entries(args).filter(([key]) => key === "area" || key === "cliente"))
    const patch = readDocPatch(links, context, directory)
    if (!patch.ok) return toolError(patch.error)
    const created = await insertDoc(supabase, user.id, {
      title: typeof args.titulo === "string" ? args.titulo : "",
      template: template?.id,
      area: patch.value.area as TaskArea | null | undefined,
      client_id: (patch.value.client_id as string | null | undefined) ?? null,
    })
    if (!created.ok) return toolError(created.error)
    if (typeof args.conteudo === "string" && args.conteudo.trim()) {
      const saved = await saveContent(context, created.data.id, args.conteudo, false)
      if (!saved.ok) return toolError(`O processo foi criado, mas o conteúdo não foi salvo: ${saved.error}`)
    }
    return textResult(`Processo criado (id ${created.data.id}).\n${origin}/processos/${created.data.id}`)
  },
}

const editDoc: Tool<McpContext> = {
  name: "editar_processo",
  title: "Editar processo",
  description:
    "Muda um processo (só os campos informados): título, tipo, situação, área, cliente, responsável, resumo, revisão e fixado; e o conteúdo, substituindo tudo ou acrescentando ao fim. A versão anterior fica no histórico.",
  inputSchema: {
    type: "object",
    properties: {
      processo: DOC_ARG,
      ...DOC_FIELDS,
      conteudo: { type: "string", description: CONTENT_HELP },
      modo: { type: "string", enum: ["acrescentar", "substituir"], description: "Para o conteúdo. Padrão: acrescentar ao fim." },
    },
    required: ["processo"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const { supabase, origin } = context
    const query = readRequiredText(args, "processo", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findDoc(context, query.value)
    if (!found.ok) return toolError(found.error)
    const patch = readDocPatch(args, context, await loadDirectory(supabase))
    if (!patch.ok) return toolError(patch.error)
    const hasContent = typeof args.conteudo === "string" && args.conteudo.trim() !== ""
    if (Object.keys(patch.value).length === 0 && !hasContent) return toolError("Diga o que mudar.")

    if (Object.keys(patch.value).length > 0) {
      const saved = await patchDoc(supabase, found.value.id, patch.value)
      if (!saved.ok) return toolError(saved.error)
    }
    if (hasContent) {
      const saved = await saveContent(context, found.value.id, args.conteudo as string, args.modo !== "substituir")
      if (!saved.ok) return toolError(saved.error)
    }
    return textResult(`Processo "${found.value.title}" salvo.\n${origin}/processos/${found.value.id}`)
  },
}

const reviewedDoc: Tool<McpContext> = {
  name: "processo_revisado",
  title: "Marcar processo como revisado",
  description: "Marca o processo como revisado hoje (fica em vigor; a próxima revisão conta a partir de agora).",
  inputSchema: { type: "object", properties: { processo: DOC_ARG }, required: ["processo"], additionalProperties: false },
  annotations: EDIT,
  async run(args, context) {
    const query = readRequiredText(args, "processo", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findDoc(context, query.value)
    if (!found.ok) return toolError(found.error)
    const saved = await writeDocReviewed(context.supabase, found.value.id)
    if (!saved.ok) return toolError(saved.error)
    return textResult(`"${found.value.title}" marcado como revisado hoje.\n${context.origin}/processos/${found.value.id}`)
  },
}

export const DOC_TOOLS = [listDocs, readDoc, createDoc, editDoc, reviewedDoc]
