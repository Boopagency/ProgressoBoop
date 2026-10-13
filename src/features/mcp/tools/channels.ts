import "server-only"

import { taskTitleFrom } from "@/features/channels/logic"
import { insertMessage, messageTask, removeMessage, writeMessageBody, writeMessageResolved } from "@/features/channels/mutations"
import { fetchCounts, fetchThread } from "@/features/channels/queries"
import { insertCommunication } from "@/features/communications/mutations"
import type { McpContext } from "@/features/mcp/auth"
import {
  bullet,
  count,
  excerpt,
  findByName,
  fromClient,
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
import { loadChannels, loadDirectory, loadPendingRequests, namesOf, type Directory, type Names } from "@/features/mcp/queries"
import {
  CONFIRM,
  DESTRUCTIVE,
  EDIT,
  READ_ONLY,
  WRITE,
  confirmFirst,
  enumOptions,
  enumValue,
  findClient,
  findPeople,
  findProject,
  limited,
} from "@/features/mcp/tools/common"
import { formatShortDate, toDateKey, toTimeLabel } from "@/lib/dates"
import {
  COMMUNICATION_CHANNELS,
  COMMUNICATION_CHANNEL_LABEL,
  COMMUNICATION_KINDS,
  COMMUNICATION_KIND_LABEL,
  TASK_STATUS_LABEL,
} from "@/lib/labels"
import { dbFailure } from "@/lib/supabase/errors"
import type { Channel, DateKey } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Comunicações pelo conector: canais, ler a conversa, escrever (inclusive
 * interno), editar e apagar a própria mensagem, resolver pedido, mensagem
 * vira tarefa, pedidos pendentes e registrar comunicação com o cliente. O
 * texto que vem do cliente volta marcado (fromClient). As gravações passam
 * por features/channels/mutations.ts e communications/mutations.ts.
 */

interface ChannelOption {
  channel: Channel
  /** Nome para achar e mostrar: "Alterações – Velmont", "Financeiro", "Conversa com Renatha". */
  label: string
  /** O que a pessoa digita: o cliente, o assunto ou a outra pessoa. */
  key: string
}

function channelOptions(channels: (Channel & { member_ids: string[] })[], names: Names, userId: string): ChannelOption[] {
  return channels.flatMap((channel) => {
    if (channel.kind === "client") {
      const client = names.client(channel.client_id) ?? "Cliente"
      return [{ channel, label: channel.name ?? `Alterações – ${client}`, key: client }]
    }
    if (channel.kind === "direct") {
      const partner = channel.member_ids.find((id) => id !== userId) ?? channel.member_ids[0]
      const name = names.person(partner ?? null)
      return name && partner !== userId ? [{ channel, label: `Conversa com ${name}`, key: name }] : []
    }
    return channel.name ? [{ channel, label: channel.name, key: channel.name }] : []
  })
}

/**
 * O canal que o Claude indicou: o cliente, o nome do canal interno, a pessoa
 * da conversa direta ou o id. Com `openDirect`, abre a conversa direta que
 * ainda não existe (pelo banco, como na tela).
 */
async function resolveChannel(
  context: McpContext,
  query: string,
  directory: Directory,
  openDirect: boolean
): Promise<Parsed<{ id: string; label: string; channel: Channel | null }>> {
  const { supabase, user } = context
  const names = namesOf(directory)
  const options = channelOptions(await loadChannels(supabase), names, user.id)
  const byKey = findByName(options, query, (item) => item.key, (item) => item.channel.id, "canal")
  const found = byKey.ok ? byKey : findByName(options, query, (item) => item.label, (item) => item.channel.id, "canal")
  if (found.ok) return { ok: true, value: { id: found.value.channel.id, label: found.value.label, channel: found.value.channel } }
  const notFound = { ok: false as const, error: byKey.ok ? "Canal não encontrado." : byKey.error }
  if (!openDirect) return notFound
  const teammates = directory.profiles.filter((profile) => profile.id !== user.id)
  const person = findByName(teammates, query, (profile) => profile.full_name, (profile) => profile.id, "pessoa")
  if (!person.ok) return notFound
  const { data, error } = await supabase.rpc("open_direct_channel", { profile_id: person.value.id })
  if (error) return dbFailure(error, "Não foi possível abrir a conversa.")
  return { ok: true, value: { id: data, label: `Conversa com ${person.value.full_name}`, channel: null } }
}

interface MessageRow {
  id: string
  body: string
  kind: string
  author_id: string | null
  internal: boolean
  resolved_at: string | null
  task_id: string | null
  created_at: string
  channel_id: string
}

/** Uma mensagem em uma linha; o texto do cliente (autor sem perfil) vai marcado. */
function messageLine(message: MessageRow & { post?: { title: string } | null; project?: { name: string } | null }, names: Names, today: DateKey): string {
  const author = names.person(message.author_id)
  return bullet(
    `${formatShortDate(toDateKey(message.created_at), today)} ${toTimeLabel(message.created_at)}`,
    author ?? (message.kind === "system" ? "aviso" : "cliente"),
    message.internal ? "interna" : null,
    message.kind === "change_request" ? (message.resolved_at ? "pedido resolvido" : "pedido pendente") : message.kind === "approval" ? "aprovação" : null,
    message.post ? `post "${message.post.title}"` : null,
    message.project ? `projeto ${message.project.name}` : null,
    author || message.kind === "system" ? `"${excerpt(message.body, 600)}"` : fromClient(message.body, 600),
    message.task_id ? `virou tarefa ${message.task_id}` : null,
    `id ${message.id}`
  )
}

async function findMessage(context: McpContext, raw: unknown): Promise<Parsed<MessageRow>> {
  if (!isUuid(raw)) return { ok: false, error: "Informe o id da mensagem (vem em ler_canal ou ajustes_pendentes)." }
  const { data, error } = await context.supabase
    .from("messages")
    .select("id, body, kind, author_id, internal, resolved_at, task_id, created_at, channel_id")
    .eq("id", raw.toLowerCase())
    .maybeSingle()
  if (error) return dbFailure(error, "Não foi possível ler a mensagem.")
  return data ? { ok: true, value: data } : { ok: false, error: "Essa mensagem não existe mais." }
}

const MESSAGE_ARG = { type: "string", description: "Id da mensagem (vem em ler_canal ou ajustes_pendentes)." } as const

/* ------------------------------------------------------------------ */
/* Canais e conversa                                                   */
/* ------------------------------------------------------------------ */

const listChannels: Tool<McpContext> = {
  name: "canais",
  title: "Canais",
  description: "Os canais das Comunicações que você vê (de clientes, internos e conversas diretas), com não lidas e pedidos pendentes.",
  inputSchema: { type: "object", properties: { incluir_arquivados: { type: "boolean" } }, additionalProperties: false },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, user, origin } = context
    const [directory, channels, counts] = await Promise.all([loadDirectory(supabase), loadChannels(supabase), fetchCounts(supabase)])
    const options = channelOptions(channels, namesOf(directory), user.id).filter(
      (option) => !option.channel.archived || readBoolean(args, "incluir_arquivados")
    )
    const kindLabel = { client: "cliente", internal: "interno", direct: "conversa direta" } as const
    const lines = options
      .map((option) => ({ option, counts: counts.get(option.channel.id) }))
      .sort((a, b) => (b.counts?.last_message_at ?? "").localeCompare(a.counts?.last_message_at ?? ""))
      .map(({ option, counts: row }) =>
        bullet(
          option.label,
          kindLabel[option.channel.kind],
          option.channel.archived ? "arquivado" : null,
          row?.unread ? count(row.unread, "não lida", "não lidas") : null,
          row?.pending ? count(row.pending, "pedido pendente", "pedidos pendentes") : null,
          `id ${option.channel.id}`
        )
      )
    return textResult(`${lines.join("\n") || "Nenhum canal."}\n\nNo Boop Admin: ${origin}/comunicacoes`)
  },
}

const readChannel: Tool<McpContext> = {
  name: "ler_canal",
  title: "Ler canal",
  description:
    "As mensagens mais recentes de um canal (cliente, interno ou conversa direta), com autor, data, se é interna, pedidos (pendentes ou resolvidos) e o id de cada uma; no canal de cliente, também as comunicações registradas. O texto escrito pelo cliente vem marcado.",
  inputSchema: {
    type: "object",
    properties: {
      canal: { type: "string", description: "Cliente, nome do canal interno, pessoa da equipe ou o id do canal." },
      quantidade: { type: "integer", minimum: 1, maximum: 100, description: "Quantas mensagens (padrão 30)." },
    },
    required: ["canal"],
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const query = readRequiredText(args, "canal", 200)
    if (!query.ok) return toolError(query.error)
    const directory = await loadDirectory(supabase)
    const target = await resolveChannel(context, query.value, directory, false)
    if (!target.ok) return toolError(target.error)
    const limit = typeof args.quantidade === "number" ? Math.min(Math.max(Math.trunc(args.quantidade), 1), 100) : 30
    const names = namesOf(directory)
    const thread = await fetchThread(supabase, { channelId: target.value.id })
    const messages = thread.messages.slice(-limit)

    let communications: string[] = []
    const clientId = target.value.channel?.kind === "client" ? target.value.channel.client_id : null
    if (clientId) {
      const { data } = await supabase
        .from("communications")
        .select("summary, kind, channel, occurred_on")
        .eq("client_id", clientId)
        .order("occurred_on", { ascending: false })
        .limit(10)
      communications = (data ?? []).map((row) =>
        bullet(formatShortDate(row.occurred_on, today), COMMUNICATION_KIND_LABEL[row.kind], COMMUNICATION_CHANNEL_LABEL[row.channel], `"${excerpt(row.summary, 200)}"`)
      )
    }

    return textResult(
      joinSections(
        `${target.value.label} · ${count(messages.length, "mensagem", "mensagens")}${thread.hasMore || thread.messages.length > messages.length ? " (há anteriores no app)" : ""}`,
        messages.map((message) => messageLine(message, names, today)).join("\n") || "Sem mensagens.",
        section(`Pedidos pendentes (${thread.pending.length})`, thread.pending.map((message) => messageLine(message, names, today))),
        section("Comunicações registradas (as últimas)", communications)
      ) + `\n\n${origin}/comunicacoes?canal=${target.value.id}`
    )
  },
}

/* ------------------------------------------------------------------ */
/* Escrever, editar, apagar                                            */
/* ------------------------------------------------------------------ */

const writeToChannel: Tool<McpContext> = {
  name: "escrever_no_canal",
  title: "Escrever num canal",
  description:
    "Envia uma mensagem como você num canal das Comunicações: o canal de um cliente (pelo nome do cliente), um canal interno (pelo nome) ou a conversa direta com alguém da equipe (pelo nome da pessoa; cria a conversa se ainda não existe). No canal de cliente, pode ser interna (só a equipe vê), um pedido de ajuste e falar de um projeto.",
  inputSchema: {
    type: "object",
    properties: {
      canal: { type: "string", description: "Cliente, nome do canal interno ou pessoa da equipe (ou o id do canal)." },
      mensagem: { type: "string", description: "Texto da mensagem.", maxLength: 5000 },
      interno: { type: "boolean", description: "Só a equipe vê (só no canal de cliente). Na dúvida, use true e confirme com a pessoa." },
      pedido_de_ajuste: { type: "boolean", description: "Marcar como pedido de ajuste (só no canal de cliente)." },
      projeto: { type: "string", description: "Projeto do cliente de que a mensagem fala (só no canal de cliente)." },
    },
    required: ["canal", "mensagem"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const { supabase, origin } = context
    const target = readRequiredText(args, "canal", 200)
    if (!target.ok) return toolError(target.error)
    const directory = await loadDirectory(supabase)
    const channel = await resolveChannel(context, target.value, directory, true)
    if (!channel.ok) return toolError(channel.error)
    const changeRequest = readBoolean(args, "pedido_de_ajuste")
    const internal = readBoolean(args, "interno")
    const clientChannel = channel.value.channel?.kind === "client" ? channel.value.channel : null
    if ((changeRequest || internal || "projeto" in args) && !clientChannel) {
      return toolError("Pedido de ajuste, mensagem interna e projeto só existem no canal de um cliente.")
    }
    let projectId: string | null = null
    if (clientChannel && "projeto" in args && !isClear(args.projeto)) {
      const project = findProject(directory, String(args.projeto), clientChannel.client_id)
      if (!project.ok) return toolError(project.error)
      projectId = project.value.id
    }

    const sent = await insertMessage(supabase, {
      channel_id: channel.value.id,
      body: args.mensagem,
      kind: changeRequest ? "change_request" : "text",
      post_id: null,
      project_id: projectId,
      internal,
    })
    if (!sent.ok) return toolError(sent.error)
    return textResult(
      `Mensagem enviada em "${channel.value.label}"${internal ? " (interna)" : ""}${changeRequest ? " como pedido de ajuste" : ""} · id ${sent.data.id}\n${origin}/comunicacoes?canal=${channel.value.id}`
    )
  },
}

const editMessage: Tool<McpContext> = {
  name: "editar_mensagem",
  title: "Editar mensagem",
  description: "Troca o texto de uma mensagem sua (só quem escreveu edita).",
  inputSchema: {
    type: "object",
    properties: { mensagem: MESSAGE_ARG, texto: { type: "string", maxLength: 5000 } },
    required: ["mensagem", "texto"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const message = await findMessage(context, args.mensagem)
    if (!message.ok) return toolError(message.error)
    if (message.value.author_id !== context.user.id) return toolError("Só quem escreveu pode editar a mensagem.")
    const saved = await writeMessageBody(context.supabase, message.value.id, args.texto)
    if (!saved.ok) return toolError(saved.error)
    return textResult("Mensagem editada.")
  },
}

const deleteMessage: Tool<McpContext> = {
  name: "apagar_mensagem",
  title: "Apagar mensagem",
  description: "Apaga uma mensagem sua (só quem escreveu apaga). Em dois passos: sem confirmar, só mostra o que seria apagado; com confirmar: true, apaga.",
  inputSchema: { type: "object", properties: { mensagem: MESSAGE_ARG, confirmar: CONFIRM }, required: ["mensagem"], additionalProperties: false },
  annotations: DESTRUCTIVE,
  async run(args, context) {
    const message = await findMessage(context, args.mensagem)
    if (!message.ok) return toolError(message.error)
    if (message.value.author_id !== context.user.id) return toolError("Só quem escreveu pode apagar a mensagem.")
    const pending = confirmFirst(args, `a mensagem "${excerpt(message.value.body, 160)}"`, [
      `Enviada em ${formatShortDate(toDateKey(message.value.created_at), context.today)} às ${toTimeLabel(message.value.created_at)}.`,
      "Os avisos ligados a ela (sino da equipe e do cliente) somem junto.",
      message.value.task_id ? "A tarefa criada a partir dela continua." : "Nada mais vai junto.",
    ])
    if (pending) return pending
    const removed = await removeMessage(context.supabase, context.user.id, message.value.id)
    if (!removed.ok) return toolError(removed.error)
    return textResult("Mensagem apagada.")
  },
}

/* ------------------------------------------------------------------ */
/* Pedidos                                                             */
/* ------------------------------------------------------------------ */

const resolveRequest: Tool<McpContext> = {
  name: "resolver_pedido",
  title: "Resolver pedido de ajuste",
  description: "Marca um pedido de ajuste como resolvido (ou reabre, com resolvido: false). O banco grava quem e quando.",
  inputSchema: {
    type: "object",
    properties: { mensagem: MESSAGE_ARG, resolvido: { type: "boolean", description: "Padrão: true." } },
    required: ["mensagem"],
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const message = await findMessage(context, args.mensagem)
    if (!message.ok) return toolError(message.error)
    if (message.value.kind !== "change_request") return toolError("Essa mensagem não é um pedido de ajuste.")
    const resolved = !("resolvido" in args) || readBoolean(args, "resolvido")
    const saved = await writeMessageResolved(context.supabase, message.value.id, resolved)
    if (!saved.ok) return toolError(saved.error)
    return textResult(resolved ? "Pedido resolvido." : "Pedido reaberto.")
  },
}

const messageToTask: Tool<McpContext> = {
  name: "mensagem_vira_tarefa",
  title: "Mensagem vira tarefa",
  description:
    "Transforma uma mensagem (em geral, um pedido de ajuste) em tarefa, com o cliente do canal, o post e o projeto dela. Concluir a tarefa resolve o pedido. Título padrão: a primeira linha da mensagem.",
  inputSchema: {
    type: "object",
    properties: {
      mensagem: MESSAGE_ARG,
      titulo: { type: "string", maxLength: 200 },
      responsaveis: { type: "array", items: { type: "string" }, description: "Padrão: você." },
      prazo: { type: "string", description: "aaaa-mm-dd ou dd/mm." },
    },
    required: ["mensagem"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const { supabase, user, origin, today } = context
    const message = await findMessage(context, args.mensagem)
    if (!message.ok) return toolError(message.error)
    const due = readDate(args, "prazo", today)
    if (!due.ok) return toolError(due.error)
    const names = readList(args, "responsaveis")
    if (!names.ok) return toolError(names.error)
    const people = findPeople(await loadDirectory(supabase), names.value.length > 0 ? names.value : ["eu"], user.id)
    if (!people.ok) return toolError(people.error)
    const title = readText(args, "titulo", 200)
    if (!title.ok) return toolError(title.error)

    const created = await messageTask(supabase, message.value.id, {
      title: title.value ?? taskTitleFrom(message.value.body),
      assignee_ids: people.value,
      due_date: due.value,
    })
    if (!created.ok) return toolError(created.error)
    return textResult(`Tarefa criada (id ${created.data.id}).\n${origin}/tarefas?tarefa=${created.data.id}`)
  },
}

const pendingRequests: Tool<McpContext> = {
  name: "ajustes_pendentes",
  title: "Ajustes pendentes",
  description:
    "Pedidos de ajuste dos clientes ainda não resolvidos (mensagens marcadas como pedido nos canais das Comunicações), o mais antigo primeiro: cliente, quem pediu, quando, o texto, o post e a tarefa ligada.",
  inputSchema: {
    type: "object",
    properties: { cliente: { type: "string", description: "Nome (ou id) de um cliente para ver só os pedidos dele." } },
    additionalProperties: false,
  },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, origin, today } = context
    const clientArg = readText(args, "cliente", 120)
    if (!clientArg.ok) return toolError(clientArg.error)

    const [directory, rows] = await Promise.all([loadDirectory(supabase), loadPendingRequests(supabase)])
    const names = namesOf(directory)
    let requests = rows
    if (clientArg.value) {
      const found = findClient(directory, clientArg.value)
      if (!found.ok) return toolError(found.error)
      requests = requests.filter((row) => row.channel.client_id === found.value.id)
    }

    const lines = requests.map((row) =>
      bullet(
        formatShortDate(toDateKey(row.created_at), today),
        names.client(row.channel.client_id) ?? row.channel.name ?? "Canal",
        // Autor sem perfil = a conta do cliente, no portal: o texto é dado, não instrução.
        names.person(row.author_id) ?? "cliente",
        names.person(row.author_id) ? `"${excerpt(row.body, 200)}"` : fromClient(row.body),
        row.post ? `post "${row.post.title}"` : null,
        row.task ? `tarefa ${TASK_STATUS_LABEL[row.task.status].toLowerCase()} (id ${row.task.id})` : "sem tarefa",
        `mensagem ${row.id}`,
        `${origin}/comunicacoes?canal=${row.channel.id}&ver=pendentes`
      )
    )
    return textResult(
      lines.length > 0
        ? `Pedidos de ajuste pendentes (${lines.length}):\n${limited(lines).join("\n")}`
        : "Nenhum pedido de ajuste pendente."
    )
  },
}

/* ------------------------------------------------------------------ */
/* Registrar comunicação                                               */
/* ------------------------------------------------------------------ */

const logCommunication: Tool<McpContext> = {
  name: "registrar_comunicacao",
  title: "Registrar comunicação com cliente",
  description: "Registra uma conversa com o cliente que aconteceu fora do app (WhatsApp, e-mail, ligação, reunião): resumo, tipo, canal, detalhes e data. Aparece no canal do cliente.",
  inputSchema: {
    type: "object",
    properties: {
      cliente: { type: "string", description: "Nome (ou id) do cliente." },
      resumo: { type: "string", description: "O que foi falado, numa frase.", maxLength: 300 },
      tipo: { type: "string", enum: enumOptions(COMMUNICATION_KINDS, COMMUNICATION_KIND_LABEL), description: "Padrão: atualização." },
      canal: { type: "string", enum: enumOptions(COMMUNICATION_CHANNELS, COMMUNICATION_CHANNEL_LABEL), description: "Padrão: WhatsApp." },
      detalhes: { type: "string", maxLength: 5000 },
      data: { type: "string", description: "Quando foi (aaaa-mm-dd ou dd/mm). Padrão: hoje." },
      projeto: { type: "string", description: "Projeto do cliente, se for sobre um." },
    },
    required: ["cliente", "resumo"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const { supabase, today } = context
    const directory = await loadDirectory(supabase)
    const client = findClient(directory, String(args.cliente ?? ""))
    if (!client.ok) return toolError(client.error)
    let projectId: string | null = null
    if ("projeto" in args && !isClear(args.projeto)) {
      const project = findProject(directory, String(args.projeto), client.value.id)
      if (!project.ok) return toolError(project.error)
      projectId = project.value.id
    }
    const kindArg = readText(args, "tipo", 30)
    const kind = enumValue((kindArg.ok ? kindArg.value : null) ?? "update", COMMUNICATION_KINDS, COMMUNICATION_KIND_LABEL)
    if (!kind) return toolError(`Tipo inválido. Opções: ${COMMUNICATION_KINDS.map((value) => COMMUNICATION_KIND_LABEL[value]).join(", ")}.`)
    const channelArg = readText(args, "canal", 30)
    const channel = enumValue((channelArg.ok ? channelArg.value : null) ?? "whatsapp", COMMUNICATION_CHANNELS, COMMUNICATION_CHANNEL_LABEL)
    if (!channel) return toolError(`Canal inválido. Opções: ${COMMUNICATION_CHANNELS.map((value) => COMMUNICATION_CHANNEL_LABEL[value]).join(", ")}.`)
    const date = readDate(args, "data", today)
    if (!date.ok) return toolError(date.error)

    const created = await insertCommunication(supabase, {
      client_id: client.value.id,
      project_id: projectId,
      kind,
      channel,
      summary: args.resumo,
      details: isClear(args.detalhes ?? null) ? null : args.detalhes,
      occurred_on: date.value ?? today,
    })
    if (!created.ok) return toolError(created.error)
    return textResult(`Comunicação registrada com ${client.value.name} (id ${created.data.id}).\n${context.origin}/clientes/${client.value.id}`)
  },
}

export const CHANNEL_TOOLS = [
  listChannels,
  readChannel,
  pendingRequests,
  writeToChannel,
  editMessage,
  deleteMessage,
  resolveRequest,
  messageToTask,
  logCommunication,
]
