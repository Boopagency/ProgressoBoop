import "server-only"

import { parseNewMessage } from "@/features/channels/validation"
import type { McpContext } from "@/features/mcp/auth"
import { bullet, excerpt, findByName, fromClient, readBoolean, readRequiredText, readText } from "@/features/mcp/logic"
import { textResult, toolError, type Tool } from "@/features/mcp/protocol"
import { loadChannels, loadDirectory, loadPendingRequests, namesOf } from "@/features/mcp/queries"
import { READ_ONLY, WRITE, limited } from "@/features/mcp/tools/common"
import { formatShortDate, toDateKey } from "@/lib/dates"
import { TASK_STATUS_LABEL } from "@/lib/labels"
import { dbFailure } from "@/lib/supabase/errors"
import type { Channel } from "@/lib/types"

/*
 * Comunicações pelo conector: pedidos de ajuste pendentes e escrever num
 * canal. O texto que vem do cliente volta marcado (fromClient).
 */

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
      const found = findByName(directory.clients, clientArg.value, (client) => client.name, (client) => client.id, "cliente")
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
/* Escrever num canal                                                  */
/* ------------------------------------------------------------------ */

interface ChannelOption {
  channel: Channel
  /** Nome para achar e mostrar: "Alterações – Velmont", "Financeiro", "Conversa com Renatha". */
  label: string
  /** O que a pessoa digita: o cliente, o assunto ou a outra pessoa. */
  key: string
}

const writeToChannel: Tool<McpContext> = {
  name: "escrever_no_canal",
  title: "Escrever num canal",
  description:
    "Envia uma mensagem como você num canal das Comunicações: o canal de um cliente (pelo nome do cliente), um canal interno (pelo nome) ou a conversa direta com alguém da equipe (pelo nome da pessoa; cria a conversa se ainda não existe). No canal de cliente, a mensagem pode ser um pedido de ajuste.",
  inputSchema: {
    type: "object",
    properties: {
      canal: { type: "string", description: "Cliente, nome do canal interno ou pessoa da equipe (ou o id do canal)." },
      mensagem: { type: "string", description: "Texto da mensagem.", maxLength: 5000 },
      pedido_de_ajuste: { type: "boolean", description: "Marcar como pedido de ajuste (só no canal de cliente)." },
    },
    required: ["canal", "mensagem"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const { supabase, user, origin } = context
    const target = readRequiredText(args, "canal", 200)
    if (!target.ok) return toolError(target.error)
    const changeRequest = readBoolean(args, "pedido_de_ajuste")

    const [directory, channels] = await Promise.all([loadDirectory(supabase), loadChannels(supabase)])
    const names = namesOf(directory)
    const options: ChannelOption[] = channels
      .filter((channel) => !channel.archived)
      .flatMap((channel) => {
        if (channel.kind === "client") {
          const client = names.client(channel.client_id) ?? "Cliente"
          return [{ channel, label: channel.name ?? `Alterações – ${client}`, key: client }]
        }
        if (channel.kind === "direct") {
          const partner = channel.member_ids.find((id) => id !== user.id) ?? channel.member_ids[0]
          const name = names.person(partner ?? null)
          return name && partner !== user.id ? [{ channel, label: `Conversa com ${name}`, key: name }] : []
        }
        return channel.name ? [{ channel, label: channel.name, key: channel.name }] : []
      })

    let option: ChannelOption | null = null
    const byKey = findByName(options, target.value, (item) => item.key, (item) => item.channel.id, "canal")
    if (byKey.ok) option = byKey.value
    else {
      const byLabel = findByName(options, target.value, (item) => item.label, (item) => item.channel.id, "canal")
      if (byLabel.ok) option = byLabel.value
    }

    let channelId = option?.channel.id ?? null
    let label = option?.label ?? null
    if (!option) {
      // Conversa direta que ainda não existe: abre pelo banco, como na tela.
      const teammates = directory.profiles.filter((profile) => profile.id !== user.id)
      const person = findByName(teammates, target.value, (profile) => profile.full_name, (profile) => profile.id, "pessoa")
      if (!person.ok) return toolError("error" in byKey ? byKey.error : person.error)
      const { data, error } = await supabase.rpc("open_direct_channel", { profile_id: person.value.id })
      if (error) return toolError(dbFailure(error, "Não foi possível abrir a conversa.").error)
      channelId = data
      label = `Conversa com ${person.value.full_name}`
    }
    if (changeRequest && option?.channel.kind !== "client") {
      return toolError("Pedido de ajuste só existe no canal de um cliente. Envie sem pedido_de_ajuste ou escolha o canal do cliente.")
    }

    const parsed = parseNewMessage({ channel_id: channelId, body: args.mensagem, kind: changeRequest ? "change_request" : "text", post_id: null })
    if (!parsed.ok) return toolError(parsed.error)
    const { error } = await supabase.from("messages").insert(parsed.value)
    if (error) {
      if (error.message.includes("arquivado")) return toolError("Este canal está arquivado.")
      if (error.code === "42501") return toolError("Você não participa deste canal.")
      return toolError(dbFailure(error, "Não foi possível enviar a mensagem.").error)
    }
    return textResult(`Mensagem enviada em "${label}"${changeRequest ? " como pedido de ajuste" : ""}.\n${origin}/comunicacoes?canal=${channelId}`)
  },
}

export const CHANNEL_TOOLS = [pendingRequests, writeToChannel]
