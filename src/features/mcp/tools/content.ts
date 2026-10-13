import "server-only"

import { ideaHref } from "@/features/content/ideas-logic"
import { ideaToPost, insertIdea, patchIdea } from "@/features/content/ideas-mutations"
import { IDEA_COLUMNS } from "@/features/content/ideas-queries"
import { frontTaskDue, isLate, pendingFronts, publishLabel } from "@/features/content/logic"
import { insertFrontTasks, insertPost, patchPost } from "@/features/content/mutations"
import { fetchPost } from "@/features/content/queries"
import type { McpContext } from "@/features/mcp/auth"
import {
  bullet,
  count,
  excerpt,
  findByName,
  isClear,
  joinSections,
  readBoolean,
  readDate,
  readList,
  readRequiredText,
  readText,
  section,
  type Parsed,
} from "@/features/mcp/logic"
import { textResult, toolError, type Tool } from "@/features/mcp/protocol"
import { loadDirectory, loadPostsAround, namesOf, type Directory, type Names, type PostRow } from "@/features/mcp/queries"
import {
  EDIT,
  READ_ONLY,
  WRITE,
  approvalLabel,
  enumOptions,
  enumValue,
  findClient,
  findPeople,
  findPerson,
  findProject,
  limited,
  readOptionalDate,
  taskLine,
  todayLine,
} from "@/features/mcp/tools/common"
import { clientApprovalState } from "@/features/tasks/logic"
import { fetchTasks } from "@/features/tasks/queries"
import { formatRange, formatShortDate, formatWeekdayShort, isTimeLabel, weekRangeOf } from "@/lib/dates"
import {
  CONTENT_FORMATS,
  CONTENT_FORMAT_LABEL,
  CONTENT_FRONTS,
  CONTENT_FRONT_LABEL,
  CONTENT_FRONT_STATUSES,
  CONTENT_FRONT_STATUS_LABEL,
  CONTENT_INTENTS,
  CONTENT_INTENT_LABEL,
  CONTENT_NETWORKS,
  CONTENT_NETWORK_LABEL,
  CONTENT_STAGES,
  CONTENT_STAGE_LABEL,
} from "@/lib/labels"
import type { ContentFront, ContentPost } from "@/lib/types"

/*
 * Central de Conteúdo pelo conector: a semana, os posts (ver, criar, editar
 * etapa, frentes, textos e data; tarefas das frentes), o banco de ideias
 * (listar, criar, editar, virar post) e o que espera o cliente. Imagens e
 * exclusão de post ficam só na tela. As gravações passam por
 * features/content/mutations.ts e ideas-mutations.ts.
 */

type Args = Record<string, unknown>

function postLine(post: PostRow, names: Names, today: string, origin: string): string {
  const missing = pendingFronts(post).map((front) => {
    const status = post[`${front}_status` as const]
    return `${CONTENT_FRONT_LABEL[front]} ${CONTENT_FRONT_STATUS_LABEL[status].toLowerCase()}`
  })
  return bullet(
    publishLabel(post, today),
    names.client(post.client_id),
    post.title,
    CONTENT_FORMAT_LABEL[post.format],
    CONTENT_STAGE_LABEL[post.stage],
    missing.length > 0 && post.stage !== "published" ? `falta: ${missing.join(", ")}` : null,
    names.person(post.owner_id) ? `responsável ${names.person(post.owner_id)}` : null,
    `id ${post.id}`,
    `${origin}/conteudo?post=${post.id}`
  )
}

const weekContent: Tool<McpContext> = {
  name: "conteudo_da_semana",
  title: "Conteúdo da semana",
  description:
    "Posts da Central de Conteúdo na semana (segunda a domingo), dia a dia, com cliente, formato, etapa e o que falta em cada frente (copy, design, vídeo); antes, os atrasados (data passada e ainda não programados nem publicados). Por padrão, a semana atual.",
  inputSchema: {
    type: "object",
    properties: {
      data: { type: "string", description: "Qualquer dia da semana desejada (aaaa-mm-dd). Ex.: a próxima semana. Sem isso, a atual." },
      cliente: { type: "string", description: "Nome (ou id) de um cliente para ver só os posts dele." },
      apenas_meus: { type: "boolean", description: "Só os posts em que você é responsável." },
    },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, user, origin, today } = context
    const dateArg = readDate(args, "data", today)
    if (!dateArg.ok) return toolError(dateArg.error)
    const clientArg = readText(args, "cliente", 120)
    if (!clientArg.ok) return toolError(clientArg.error)
    const week = weekRangeOf(dateArg.value ?? today)

    const [directory, rows] = await Promise.all([loadDirectory(supabase), loadPostsAround(supabase, week.start, week.end)])
    const names = namesOf(directory)
    let posts = rows
    if (clientArg.value) {
      const found = findByName(directory.clients, clientArg.value, (client) => client.name, (client) => client.id, "cliente")
      if (!found.ok) return toolError(found.error)
      posts = posts.filter((post) => post.client_id === found.value.id)
    }
    if (readBoolean(args, "apenas_meus")) posts = posts.filter((post) => post.owner_id === user.id)

    const inWeek = posts.filter((post) => post.publish_on !== null && post.publish_on >= week.start)
    const late = posts.filter((post) => isLate(post, today) && post.publish_on! < week.start)
    const days = new Map<string, PostRow[]>()
    for (const post of inWeek) days.set(post.publish_on!, [...(days.get(post.publish_on!) ?? []), post])

    const published = inWeek.filter((post) => post.stage === "published").length
    const waiting = inWeek.filter((post) => post.stage === "client_review").length
    const header = `Conteúdo de ${formatRange(week)}: ${count(inWeek.length, "post", "posts")} (${count(published, "publicado", "publicados")}, ${waiting} aguardando o cliente). ${todayLine(context)}`
    const body = joinSections(
      section(`Atrasados (${late.length})`, limited(late.map((post) => postLine(post, names, today, origin)))),
      ...[...days.entries()].map(([day, list]) =>
        section(`${formatWeekdayShort(day)} ${formatShortDate(day, today)}${day === today ? " (hoje)" : ""}`, list.map((post) => postLine(post, names, today, origin)))
      )
    )
    return textResult(`${header}\n\n${body || "Nenhum post nesta semana."}\n\nNo Boop Admin: ${origin}/conteudo?visao=semana&data=${week.start}`)
  },
}

/* ------------------------------------------------------------------ */
/* Posts                                                               */
/* ------------------------------------------------------------------ */

const POST_FIELDS = {
  titulo: { type: "string", maxLength: 200 },
  cliente: { type: "string", description: "Nome (ou id) do cliente." },
  projeto: { type: "string", description: "Nome (ou id) do projeto do cliente. \"nenhum\" tira." },
  formato: { type: "string", enum: enumOptions(CONTENT_FORMATS, CONTENT_FORMAT_LABEL) },
  redes: { type: "array", items: { type: "string", enum: enumOptions(CONTENT_NETWORKS, CONTENT_NETWORK_LABEL) }, description: "Padrão: Instagram." },
  intencoes: { type: "array", items: { type: "string", enum: enumOptions(CONTENT_INTENTS, CONTENT_INTENT_LABEL) } },
  data: { type: "string", description: "Dia de publicação (aaaa-mm-dd ou dd/mm). \"nenhum\" tira a data (e o horário)." },
  horario: { type: "string", description: "Horário de publicação (HH:MM), só com dia. \"nenhum\" tira." },
  etapa: { type: "string", enum: enumOptions(CONTENT_STAGES, CONTENT_STAGE_LABEL) },
  copy: { type: "string", enum: enumOptions(CONTENT_FRONT_STATUSES, CONTENT_FRONT_STATUS_LABEL), description: "Situação da frente de copy." },
  design: { type: "string", enum: enumOptions(CONTENT_FRONT_STATUSES, CONTENT_FRONT_STATUS_LABEL), description: "Situação da frente de design." },
  video: { type: "string", enum: enumOptions(CONTENT_FRONT_STATUSES, CONTENT_FRONT_STATUS_LABEL), description: "Situação da frente de vídeo." },
  responsavel: { type: "string", description: "Pessoa da equipe (\"eu\" = você). \"nenhum\" tira." },
  conteudo: { type: "string", maxLength: 5000, description: "Conteúdo/ideia do post (briefing)." },
  orientacao_design: { type: "string", maxLength: 5000 },
  roteiro: { type: "string", maxLength: 10000 },
  legenda: { type: "string", maxLength: 5000 },
  slides: { type: "array", items: { type: "string" }, description: "Texto de cada slide do carrossel, na ordem. As imagens dos slides ficam como estão." },
  link_drive: { type: "string", description: "Link do Drive com o material (https://)." },
  fixado: { type: "boolean", description: "Fixado no topo do feed (até 3 por cliente)." },
} as const

const TEXT_FIELDS = [
  ["conteudo", "brief"],
  ["orientacao_design", "design_notes"],
  ["roteiro", "script"],
  ["legenda", "caption"],
  ["link_drive", "drive_url"],
] as const

function enumListArg<T extends string>(args: Args, key: string, values: readonly T[], labels: Record<T, string>): Parsed<T[]> {
  const items = readList(args, key)
  if (!items.ok) return items
  const result: T[] = []
  for (const item of items.value) {
    const value = enumValue(item, values, labels)
    if (!value) return { ok: false, error: `Valor inválido em "${key}": ${item}. Opções: ${values.map((option) => labels[option]).join(", ")}.` }
    result.push(value)
  }
  return { ok: true, value: result }
}

/** Converte os argumentos para o formato da Server Action (só o que veio). */
function readPostPatch(args: Args, context: McpContext, directory: Directory, current: ContentPost | null): Parsed<Record<string, unknown>> {
  const patch: Record<string, unknown> = {}
  if ("titulo" in args) patch.title = args.titulo
  let clientId = current?.client_id ?? null
  if ("cliente" in args) {
    const client = findClient(directory, String(args.cliente))
    if (!client.ok) return client
    clientId = patch.client_id = client.value.id
  }
  if ("projeto" in args) {
    if (isClear(args.projeto)) patch.project_id = null
    else {
      const project = findProject(directory, String(args.projeto), clientId)
      if (!project.ok) return project
      patch.project_id = project.value.id
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
  const enums = [
    ["formato", "format", CONTENT_FORMATS, CONTENT_FORMAT_LABEL],
    ["etapa", "stage", CONTENT_STAGES, CONTENT_STAGE_LABEL],
    ["copy", "copy_status", CONTENT_FRONT_STATUSES, CONTENT_FRONT_STATUS_LABEL],
    ["design", "design_status", CONTENT_FRONT_STATUSES, CONTENT_FRONT_STATUS_LABEL],
    ["video", "video_status", CONTENT_FRONT_STATUSES, CONTENT_FRONT_STATUS_LABEL],
  ] as const
  for (const [key, field, values, labels] of enums) {
    if (!(key in args)) continue
    const raw = readText(args, key, 40)
    const value = enumValue(raw.ok ? raw.value : null, values as readonly string[], labels as Record<string, string>)
    if (!value) return { ok: false, error: `Valor inválido em "${key}". Opções: ${values.map((option) => (labels as Record<string, string>)[option]).join(", ")}.` }
    patch[field] = value
  }
  if ("redes" in args) {
    const networks = enumListArg(args, "redes", CONTENT_NETWORKS, CONTENT_NETWORK_LABEL)
    if (!networks.ok) return networks
    patch.networks = networks.value
  }
  if ("intencoes" in args) {
    const intents = enumListArg(args, "intencoes", CONTENT_INTENTS, CONTENT_INTENT_LABEL)
    if (!intents.ok) return intents
    patch.intents = intents.value
  }
  const date = readOptionalDate(args, "data", context.today)
  if (!date.ok) return date
  if (date.value !== undefined) patch.publish_on = date.value
  if ("horario" in args) {
    if (isClear(args.horario)) patch.publish_time = null
    else if (isTimeLabel(args.horario)) patch.publish_time = args.horario
    else return { ok: false, error: "Horário inválido: use HH:MM (ex.: 18:30)." }
  }
  for (const [key, field] of TEXT_FIELDS) if (key in args) patch[field] = isClear(args[key]) ? null : args[key]
  if ("slides" in args) {
    const slides = args.slides
    if (!Array.isArray(slides) || !slides.every((text) => typeof text === "string")) return { ok: false, error: "\"slides\" deve ser uma lista de textos." }
    const texts = { value: slides as string[] }
    // As imagens ficam onde estavam (pela posição); tirar um slide com imagem é só pela tela.
    const before = current?.slides ?? []
    if (before.slice(texts.value.length).some((slide) => slide.image_path)) {
      return { ok: false, error: "Um dos slides que sairiam tem imagem. Para tirar slides com imagem, use a tela do post." }
    }
    patch.slides = texts.value.map((text, index) => ({ text, image_path: before[index]?.image_path ?? null }))
  }
  if ("fixado" in args) patch.pinned = readBoolean(args, "fixado")
  return { ok: true, value: patch }
}

async function findPost(context: McpContext, query: string): Promise<Parsed<ContentPost>> {
  const { data, error } = await context.supabase
    .from("content_posts")
    .select("id, title, client_id, publish_on")
    .order("updated_at", { ascending: false })
    .limit(1000)
  if (error) return { ok: false, error: "Não foi possível ler os posts." }
  const found = findByName(data, query, (post) => post.title, (post) => post.id, "post", (post) =>
    post.publish_on ? formatShortDate(post.publish_on, context.today) : "sem data"
  )
  if (!found.ok) return found
  const post = await fetchPost(context.supabase, found.value.id)
  return post ? { ok: true, value: post } : { ok: false, error: "Esse post não existe mais." }
}

const POST_ARG = { type: "string", description: "Id do post (de preferência) ou o título." } as const

const viewPost: Tool<McpContext> = {
  name: "ver_post",
  title: "Ver post",
  description: "Um post por inteiro: cliente, formato, redes, data, etapa, frentes (copy, design, vídeo), responsável, textos (conteúdo, orientação de design, roteiro, slides, legenda) e as tarefas das frentes.",
  inputSchema: { type: "object", properties: { post: POST_ARG }, required: ["post"], additionalProperties: false },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const query = readRequiredText(args, "post", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findPost(context, query.value)
    if (!found.ok) return toolError(found.error)
    const post = found.value
    const [directory, tasks] = await Promise.all([loadDirectory(supabase), fetchTasks(supabase)])
    const names = namesOf(directory)
    const own = tasks.filter((task) => task.content_post_id === post.id)
    const text = (title: string, value: string | null) => (value ? `${title}:\n${value}` : null)

    return textResult(
      joinSections(
        `Post "${post.title}" (id ${post.id})`,
        [
          bullet(names.client(post.client_id), CONTENT_FORMAT_LABEL[post.format], post.networks.map((network) => CONTENT_NETWORK_LABEL[network]).join(", ")),
          bullet(publishLabel(post, today), CONTENT_STAGE_LABEL[post.stage], post.pinned ? "fixado no feed" : null),
          bullet(...CONTENT_FRONTS.map((front) => `${CONTENT_FRONT_LABEL[front]}: ${CONTENT_FRONT_STATUS_LABEL[post[`${front}_status`]].toLowerCase()}`)),
          bullet(
            `Responsável: ${names.person(post.owner_id) ?? "ninguém"}`,
            names.project(post.project_id) ? `projeto ${names.project(post.project_id)}` : null,
            post.intents.length > 0 ? post.intents.map((intent) => CONTENT_INTENT_LABEL[intent]).join(", ") : null,
            post.drive_url ? `Drive: ${post.drive_url}` : null
          ),
        ].join("\n"),
        text("Conteúdo", post.brief),
        text("Orientação de design", post.design_notes),
        text("Roteiro", post.script),
        post.slides.length > 0 ? `Slides:\n${post.slides.map((slide, index) => `${index + 1}. ${slide.text}${slide.image_path ? " [com imagem]" : ""}`).join("\n")}` : null,
        text("Legenda", post.caption),
        section(`Tarefas das frentes (${own.length})`, own.map((task) => taskLine(task, names, today)))
      ) + `\n\n${origin}/conteudo?post=${post.id}`
    )
  },
}

const createPost: Tool<McpContext> = {
  name: "criar_post",
  title: "Criar post",
  description: "Cria um post na Central de Conteúdo. Obrigatórios: cliente, título e formato. Padrões: Instagram, em produção, frentes conforme o formato. Imagens só pela tela.",
  inputSchema: { type: "object", properties: POST_FIELDS, required: ["cliente", "titulo", "formato"], additionalProperties: false },
  annotations: WRITE,
  async run(args, context) {
    const patch = readPostPatch(args, context, await loadDirectory(context.supabase), null)
    if (!patch.ok) return toolError(patch.error)
    const created = await insertPost(context.supabase, patch.value)
    if (!created.ok) return toolError(created.error)
    return textResult(`Post "${String(patch.value.title)}" criado (id ${created.data.id}).\n${context.origin}/conteudo?post=${created.data.id}`)
  },
}

const editPost: Tool<McpContext> = {
  name: "editar_post",
  title: "Editar post",
  description:
    "Muda um post (só os campos informados): etapa, situação de cada frente, textos (conteúdo, orientação de design, roteiro, slides, legenda), data e horário, título, formato, redes, responsável, projeto, Drive e fixado.",
  inputSchema: { type: "object", properties: { post: POST_ARG, ...POST_FIELDS }, required: ["post"], additionalProperties: false },
  annotations: EDIT,
  async run(args, context) {
    const query = readRequiredText(args, "post", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findPost(context, query.value)
    if (!found.ok) return toolError(found.error)
    const patch = readPostPatch(args, context, await loadDirectory(context.supabase), found.value)
    if (!patch.ok) return toolError(patch.error)
    if (Object.keys(patch.value).length === 0) return toolError("Diga o que mudar.")
    const saved = await patchPost(context.supabase, found.value.id, patch.value)
    if (!saved.ok) return toolError(saved.error)
    return textResult(`Post "${found.value.title}" salvo.\n${context.origin}/conteudo?post=${found.value.id}`)
  },
}

const frontTasks: Tool<McpContext> = {
  name: "tarefas_das_frentes",
  title: "Tarefas das frentes do post",
  description:
    "Cria uma tarefa por frente do post (copy, design, vídeo), ligada ao post, ao cliente e ao projeto, com responsáveis e prazo. Sem prazo, usa o padrão da tela: copy 5 dias e design/vídeo 3 dias antes da publicação.",
  inputSchema: {
    type: "object",
    properties: {
      post: POST_ARG,
      frentes: {
        type: "array",
        items: {
          type: "object",
          properties: {
            frente: { type: "string", enum: enumOptions(CONTENT_FRONTS, CONTENT_FRONT_LABEL) },
            responsaveis: { type: "array", items: { type: "string" } },
            prazo: { type: "string", description: "aaaa-mm-dd ou dd/mm." },
          },
          required: ["frente", "responsaveis"],
        },
      },
    },
    required: ["post", "frentes"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const { supabase, user, origin, today } = context
    const query = readRequiredText(args, "post", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findPost(context, query.value)
    if (!found.ok) return toolError(found.error)
    if (!Array.isArray(args.frentes) || args.frentes.length === 0) return toolError("Informe as frentes.")
    const directory = await loadDirectory(supabase)
    const items = []
    for (const raw of args.frentes as Args[]) {
      if (typeof raw !== "object" || raw === null) return toolError("Frente inválida.")
      const front = enumValue(typeof raw.frente === "string" ? raw.frente : null, CONTENT_FRONTS, CONTENT_FRONT_LABEL) as ContentFront | null | undefined
      if (!front) return toolError("Frente inválida: copy, design ou vídeo.")
      const names = readList(raw, "responsaveis")
      if (!names.ok) return toolError(names.error)
      const people = findPeople(directory, names.value, user.id)
      if (!people.ok) return toolError(people.error)
      const due = readDate(raw, "prazo", today)
      if (!due.ok) return toolError(due.error)
      items.push({ front, assignee_ids: people.value, due_date: due.value ?? frontTaskDue(found.value.publish_on, front, today) })
    }
    const created = await insertFrontTasks(supabase, found.value.id, items)
    if (!created.ok) return toolError(created.error)
    return textResult(`${count(created.data.count, "tarefa criada", "tarefas criadas")} para "${found.value.title}".\n${origin}/conteudo?post=${found.value.id}`)
  },
}

/* ------------------------------------------------------------------ */
/* Ideias                                                              */
/* ------------------------------------------------------------------ */

const listIdeas: Tool<McpContext> = {
  name: "ideias",
  title: "Banco de ideias",
  description: "Ideias de conteúdo de um cliente (ou de todos): as livres primeiro, depois as que já viraram post. Com id.",
  inputSchema: {
    type: "object",
    properties: {
      cliente: { type: "string", description: "Nome (ou id) do cliente." },
      incluir_usadas: { type: "boolean", description: "Também as que já viraram post." },
    },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin } = context
    const directory = await loadDirectory(supabase)
    let query = supabase.from("content_ideas").select(IDEA_COLUMNS).order("created_at", { ascending: false }).limit(300)
    if ("cliente" in args && !isClear(args.cliente)) {
      const client = findClient(directory, String(args.cliente))
      if (!client.ok) return toolError(client.error)
      query = query.eq("client_id", client.value.id)
    }
    if (!readBoolean(args, "incluir_usadas")) query = query.is("post_id", null)
    const { data, error } = await query
    if (error) return toolError("Não foi possível ler as ideias.")
    const names = namesOf(directory)
    const lines = data.map((idea) =>
      bullet(
        idea.title,
        names.client(idea.client_id),
        idea.format ? CONTENT_FORMAT_LABEL[idea.format] : null,
        idea.notes ? `"${excerpt(idea.notes, 120)}"` : null,
        idea.post_id ? "já virou post" : null,
        `id ${idea.id}`,
        `${origin}${ideaHref(idea)}`
      )
    )
    return textResult(lines.length > 0 ? limited(lines).join("\n") : "Nenhuma ideia.")
  },
}

const IDEA_FIELDS = {
  titulo: { type: "string", description: "Título curto da ideia.", maxLength: 200 },
  notas: { type: "string", description: "A ideia em detalhe: gancho, roteiro, referências. \"nenhum\" apaga.", maxLength: 5000 },
  formato: { type: "string", enum: enumOptions(CONTENT_FORMATS, CONTENT_FORMAT_LABEL), description: "Formato pensado para o post. \"nenhum\" tira." },
  link_referencia: { type: "string", description: "Link de referência (post, perfil, vídeo). \"nenhum\" tira." },
} as const

function readIdeaPatch(args: Args): Parsed<Record<string, unknown>> {
  const patch: Record<string, unknown> = {}
  if ("titulo" in args) patch.title = args.titulo
  if ("notas" in args) patch.notes = isClear(args.notas) ? null : args.notas
  if ("link_referencia" in args) patch.reference_url = isClear(args.link_referencia) ? null : args.link_referencia
  if ("formato" in args) {
    const raw = readText(args, "formato", 40)
    const format = isClear(args.formato) ? null : enumValue(raw.ok ? raw.value : null, CONTENT_FORMATS, CONTENT_FORMAT_LABEL)
    if (format === undefined) return { ok: false, error: `Formato inválido. Opções: ${CONTENT_FORMATS.map((value) => CONTENT_FORMAT_LABEL[value]).join(", ")}.` }
    patch.format = format
  }
  return { ok: true, value: patch }
}

async function findIdea(context: McpContext, query: string): Promise<Parsed<{ id: string; title: string; client_id: string }>> {
  const { data, error } = await context.supabase.from("content_ideas").select("id, title, client_id").order("created_at", { ascending: false }).limit(1000)
  if (error) return { ok: false, error: "Não foi possível ler as ideias." }
  return findByName(data, query, (idea) => idea.title, (idea) => idea.id, "ideia")
}

const createIdea: Tool<McpContext> = {
  name: "criar_ideia_de_post",
  title: "Criar ideia de post",
  description: "Guarda uma ideia ou referência no banco de ideias de um cliente (Central de Conteúdo → Ideias). Depois vira post com ideia_vira_post.",
  inputSchema: {
    type: "object",
    properties: { cliente: { type: "string", description: "Nome (ou id) do cliente." }, ...IDEA_FIELDS },
    required: ["cliente", "titulo"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const clientArg = readRequiredText(args, "cliente", 120)
    if (!clientArg.ok) return toolError(clientArg.error)
    const client = findClient(await loadDirectory(context.supabase), clientArg.value)
    if (!client.ok) return toolError(client.error)
    const patch = readIdeaPatch(args)
    if (!patch.ok) return toolError(patch.error)
    const created = await insertIdea(context.supabase, { client_id: client.value.id, notes: null, format: null, reference_url: null, ...patch.value })
    if (!created.ok) return toolError(created.error)
    return textResult(`Ideia guardada no banco de ideias de ${client.value.name}: "${created.data.title}" · id ${created.data.id}\n${context.origin}${ideaHref(created.data)}`)
  },
}

const editIdea: Tool<McpContext> = {
  name: "editar_ideia",
  title: "Editar ideia",
  description: "Muda uma ideia do banco de ideias (só os campos informados).",
  inputSchema: {
    type: "object",
    properties: { ideia: { type: "string", description: "Id (de preferência) ou título da ideia." }, ...IDEA_FIELDS },
    required: ["ideia"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const query = readRequiredText(args, "ideia", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findIdea(context, query.value)
    if (!found.ok) return toolError(found.error)
    const patch = readIdeaPatch(args)
    if (!patch.ok) return toolError(patch.error)
    if (Object.keys(patch.value).length === 0) return toolError("Diga o que mudar.")
    const saved = await patchIdea(context.supabase, found.value.id, patch.value)
    if (!saved.ok) return toolError(saved.error)
    return textResult(`Ideia "${found.value.title}" salva.\n${context.origin}${ideaHref(found.value)}`)
  },
}

const ideaPost: Tool<McpContext> = {
  name: "ideia_vira_post",
  title: "Ideia vira post",
  description: "Cria o post a partir da ideia (título, formato, notas e link no conteúdo), em produção, sem data e com você como responsável. A ideia fica marcada como usada.",
  inputSchema: {
    type: "object",
    properties: {
      ideia: { type: "string", description: "Id (de preferência) ou título da ideia." },
      formato: { type: "string", enum: enumOptions(CONTENT_FORMATS, CONTENT_FORMAT_LABEL), description: "Obrigatório se a ideia não tem formato." },
    },
    required: ["ideia"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const query = readRequiredText(args, "ideia", 200)
    if (!query.ok) return toolError(query.error)
    const found = await findIdea(context, query.value)
    if (!found.ok) return toolError(found.error)
    const raw = readText(args, "formato", 40)
    const format = enumValue(raw.ok ? raw.value : null, CONTENT_FORMATS, CONTENT_FORMAT_LABEL)
    if (format === undefined) return toolError(`Formato inválido. Opções: ${CONTENT_FORMATS.map((value) => CONTENT_FORMAT_LABEL[value]).join(", ")}.`)
    const created = await ideaToPost(context.supabase, context.user.id, found.value.id, format)
    if (!created.ok) return toolError(created.error)
    return textResult(`A ideia virou o post "${created.data.title}" (id ${created.data.id}).\n${context.origin}/conteudo?post=${created.data.id}`)
  },
}

/* ------------------------------------------------------------------ */
/* O que espera o cliente                                              */
/* ------------------------------------------------------------------ */

const awaitingClient: Tool<McpContext> = {
  name: "aguardando_cliente",
  title: "Aguardando o cliente",
  description: "O que está com o cliente: posts na etapa \"Aguardando cliente\" e etapas de projeto concluídas que esperam a aprovação dele no portal (e as que voltaram com ajustes).",
  inputSchema: {
    type: "object",
    properties: { cliente: { type: "string", description: "Nome (ou id) de um cliente para ver só ele." } },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const directory = await loadDirectory(supabase)
    let clientId: string | null = null
    if ("cliente" in args && !isClear(args.cliente)) {
      const client = findClient(directory, String(args.cliente))
      if (!client.ok) return toolError(client.error)
      clientId = client.value.id
    }
    let postsQuery = supabase.from("content_posts").select("id, client_id, title, format, publish_on, publish_time").eq("stage", "client_review").order("publish_on")
    if (clientId) postsQuery = postsQuery.eq("client_id", clientId)
    const [{ data: posts, error }, tasks] = await Promise.all([postsQuery, fetchTasks(supabase)])
    if (error) return toolError("Não foi possível ler os posts.")
    const names = namesOf(directory)
    const steps = tasks.filter(
      (task) => (!clientId || task.client_id === clientId) && ["awaiting", "changes"].includes(clientApprovalState(task))
    )
    return textResult(
      joinSections(
        section(
          `Posts aguardando o cliente (${posts.length})`,
          posts.map((post) =>
            bullet(names.client(post.client_id), post.title, CONTENT_FORMAT_LABEL[post.format], publishLabel(post, today), `id ${post.id}`, `${origin}/conteudo?post=${post.id}`)
          )
        ),
        section(`Etapas de projeto (${steps.length})`, steps.map((task) => `${taskLine(task, names, today)} · ${approvalLabel(task)}`))
      ) || "Nada esperando o cliente."
    )
  },
}

export const CONTENT_TOOLS = [weekContent, viewPost, createPost, editPost, frontTasks, listIdeas, createIdea, editIdea, ideaPost, awaitingClient]
