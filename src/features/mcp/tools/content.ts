import "server-only"

import { ideaHref } from "@/features/content/ideas-logic"
import { parseIdeaInput } from "@/features/content/ideas-validation"
import { isLate, pendingFronts, publishLabel } from "@/features/content/logic"
import type { McpContext } from "@/features/mcp/auth"
import { bullet, count, findByName, joinSections, readBoolean, readDate, readRequiredText, readText, section } from "@/features/mcp/logic"
import { textResult, toolError, type Tool } from "@/features/mcp/protocol"
import { loadDirectory, loadPostsAround, namesOf, type Names, type PostRow } from "@/features/mcp/queries"
import { READ_ONLY, WRITE, enumValue, limited, todayLine } from "@/features/mcp/tools/common"
import { formatRange, formatShortDate, formatWeekdayShort, weekRangeOf } from "@/lib/dates"
import {
  CONTENT_FORMATS,
  CONTENT_FORMAT_LABEL,
  CONTENT_FRONT_LABEL,
  CONTENT_FRONT_STATUS_LABEL,
  CONTENT_STAGE_LABEL,
} from "@/lib/labels"
import { dbFailure } from "@/lib/supabase/errors"
import { foldText } from "@/lib/text"

/* Central de Conteúdo pelo conector: a semana de posts e o banco de ideias. */

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
/* Criar ideia de post                                                 */
/* ------------------------------------------------------------------ */

const createIdea: Tool<McpContext> = {
  name: "criar_ideia_de_post",
  title: "Criar ideia de post",
  description:
    "Guarda uma ideia ou referência no banco de ideias de um cliente (Central de Conteúdo → Ideias). Depois a equipe transforma em post pelo Boop Admin.",
  inputSchema: {
    type: "object",
    properties: {
      cliente: { type: "string", description: "Nome (ou id) do cliente." },
      titulo: { type: "string", description: "Título curto da ideia.", maxLength: 200 },
      notas: { type: "string", description: "A ideia em detalhe: gancho, roteiro, referências.", maxLength: 5000 },
      formato: {
        type: "string",
        enum: CONTENT_FORMATS.map((format) => foldText(CONTENT_FORMAT_LABEL[format])),
        description: "Formato pensado para o post (opcional).",
      },
      link_referencia: { type: "string", description: "Link de referência (post, perfil, vídeo), opcional." },
    },
    required: ["cliente", "titulo"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const { supabase, origin } = context
    const clientArg = readRequiredText(args, "cliente", 120)
    if (!clientArg.ok) return toolError(clientArg.error)
    const formatArg = readText(args, "formato", 40)
    const format = enumValue(formatArg.ok ? formatArg.value : null, CONTENT_FORMATS, CONTENT_FORMAT_LABEL)
    if (format === undefined) {
      return toolError(`Formato inválido. Opções: ${CONTENT_FORMATS.map((value) => CONTENT_FORMAT_LABEL[value]).join(", ")}.`)
    }

    const directory = await loadDirectory(supabase)
    const client = findByName(directory.clients, clientArg.value, (item) => item.name, (item) => item.id, "cliente")
    if (!client.ok) return toolError(client.error)

    const parsed = parseIdeaInput({
      client_id: client.value.id,
      title: args.titulo,
      notes: args.notas ?? null,
      format,
      reference_url: args.link_referencia ?? null,
    })
    if (!parsed.ok) return toolError(parsed.error)

    const { data, error } = await supabase.from("content_ideas").insert(parsed.value).select("id, client_id").single()
    if (error) return toolError(dbFailure(error, "Não foi possível salvar a ideia.").error)
    return textResult(
      `Ideia guardada no banco de ideias de ${client.value.name}: "${parsed.value.title}"${format ? ` (${CONTENT_FORMAT_LABEL[format]})` : ""} · id ${data.id}\n${origin}${ideaHref(data)}`
    )
  },
}

export const CONTENT_TOOLS = [weekContent, createIdea]
