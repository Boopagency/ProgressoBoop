import "server-only"

import { parseNewMessage } from "@/features/channels/validation"
import { ideaHref } from "@/features/content/ideas-logic"
import { parseIdeaInput } from "@/features/content/ideas-validation"
import type { McpContext } from "@/features/mcp/auth"
import { bullet, dueLabel, findByName, readBoolean, readDate, readList, readRequiredText, readText } from "@/features/mcp/logic"
import { textResult, toolError, type Tool } from "@/features/mcp/protocol"
import { loadChannels, loadDirectory, loadTasks, namesOf } from "@/features/mcp/queries"
import { isDone } from "@/features/tasks/logic"
import { parseTaskInput } from "@/features/tasks/validation"
import {
  CONTENT_FORMATS,
  CONTENT_FORMAT_LABEL,
  TASK_AREAS,
  TASK_AREA_LABEL,
  TASK_PRIORITIES,
  TASK_PRIORITY_LABEL,
} from "@/lib/labels"
import { dbFailure } from "@/lib/supabase/errors"
import { foldText } from "@/lib/text"
import type { Channel } from "@/lib/types"

/*
 * Ferramentas que gravam: criar tarefa, concluir tarefa, criar ideia de post
 * e escrever num canal. Só criam ou atualizam (nada apaga), com as mesmas
 * validações das Server Actions e o RLS da pessoa. Os gatilhos do banco
 * cuidam do resto (autoria, histórico, completed_at, pedidos resolvidos).
 */

const WRITE = { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false } as const

/** Valor de um enum pelo código ("high") ou pelo rótulo ("Alta"), sem acento. */
function enumValue<T extends string>(raw: string | null, values: readonly T[], labels: Record<T, string>): T | null | undefined {
  if (raw === null) return null
  const needle = foldText(raw)
  return values.find((value) => value === needle || foldText(labels[value]) === needle)
}

function isMe(text: string): boolean {
  return ["eu", "mim", "me", "eu mesmo", "eu mesma"].includes(foldText(text.trim()))
}

/* ------------------------------------------------------------------ */
/* Criar tarefa                                                        */
/* ------------------------------------------------------------------ */

const createTask: Tool<McpContext> = {
  name: "criar_tarefa",
  title: "Criar tarefa",
  description:
    "Cria uma tarefa no Boop Admin. Só o título é obrigatório; sem responsáveis, fica com quem está conectado. Cliente, projeto e pessoas podem ir pelo nome. O projeto leva o cliente dele junto.",
  inputSchema: {
    type: "object",
    properties: {
      titulo: { type: "string", description: "Título da tarefa.", maxLength: 200 },
      prazo: { type: "string", description: "Prazo: aaaa-mm-dd, \"hoje\" ou \"amanhã\"." },
      responsaveis: {
        type: "array",
        items: { type: "string" },
        description: "Nomes das pessoas da equipe (\"eu\" = você). Padrão: você.",
      },
      cliente: { type: "string", description: "Nome (ou id) do cliente." },
      projeto: { type: "string", description: "Nome (ou id) do projeto." },
      prioridade: { type: "string", enum: ["alta", "normal", "baixa"], description: "Padrão: normal." },
      area: { type: "string", enum: TASK_AREAS.map((area) => foldText(TASK_AREA_LABEL[area])), description: "Área da Boop." },
      descricao: { type: "string", description: "Detalhes (opcional).", maxLength: 5000 },
    },
    required: ["titulo"],
    additionalProperties: false,
  },
  annotations: WRITE,
  async run(args, context) {
    const { supabase, user, origin, today } = context
    const title = readRequiredText(args, "titulo", 200)
    if (!title.ok) return toolError(title.error)
    const due = readDate(args, "prazo", today)
    if (!due.ok) return toolError(due.error)
    const people = readList(args, "responsaveis")
    if (!people.ok) return toolError(people.error)
    const clientArg = readText(args, "cliente", 120)
    if (!clientArg.ok) return toolError(clientArg.error)
    const projectArg = readText(args, "projeto", 200)
    if (!projectArg.ok) return toolError(projectArg.error)
    const description = readText(args, "descricao", 5000)
    if (!description.ok) return toolError(description.error)
    const priorityArg = readText(args, "prioridade", 20)
    const priority = enumValue(priorityArg.ok ? priorityArg.value : null, TASK_PRIORITIES, TASK_PRIORITY_LABEL)
    if (priority === undefined) return toolError("Prioridade inválida: use alta, normal ou baixa.")
    const areaArg = readText(args, "area", 40)
    const area = enumValue(areaArg.ok ? areaArg.value : null, TASK_AREAS, TASK_AREA_LABEL)
    if (area === undefined) return toolError(`Área inválida. Opções: ${TASK_AREAS.map((value) => TASK_AREA_LABEL[value]).join(", ")}.`)

    const directory = await loadDirectory(supabase)
    const names = namesOf(directory)

    const assigneeIds: string[] = []
    for (const name of people.value.length > 0 ? people.value : ["eu"]) {
      if (isMe(name)) {
        assigneeIds.push(user.id)
        continue
      }
      const found = findByName(directory.profiles, name, (profile) => profile.full_name, (profile) => profile.id, "pessoa da equipe")
      if (!found.ok) return toolError(found.error)
      assigneeIds.push(found.value.id)
    }

    let clientId: string | null = null
    if (clientArg.value) {
      const found = findByName(directory.clients, clientArg.value, (client) => client.name, (client) => client.id, "cliente")
      if (!found.ok) return toolError(found.error)
      clientId = found.value.id
    }
    let projectId: string | null = null
    if (projectArg.value) {
      const candidates = clientId ? directory.projects.filter((project) => project.client_id === clientId) : directory.projects
      const found = findByName(candidates, projectArg.value, (project) => project.name, (project) => project.id, "projeto")
      if (!found.ok) return toolError(found.error)
      projectId = found.value.id
      clientId = clientId ?? found.value.client_id
    }

    const parsed = parseTaskInput({
      title: title.value,
      description: description.value,
      assignee_ids: assigneeIds,
      due_date: due.value,
      area,
      client_id: clientId,
      project_id: projectId,
      priority: priority ?? "normal",
      status: "todo",
    })
    if (!parsed.ok) return toolError(parsed.error)
    const { assignee_ids, ...fields } = parsed.value

    const { data: task, error } = await supabase.from("tasks").insert(fields).select("id").single()
    if (error) return toolError(dbFailure(error, "Não foi possível criar a tarefa.").error)
    const link = `${origin}/tarefas?tarefa=${task.id}`

    const { error: assignError } = await supabase
      .from("task_assignees")
      .insert(assignee_ids.map((profileId) => ({ task_id: task.id, profile_id: profileId })))
    if (assignError) {
      console.error(`[mcp] responsáveis: ${assignError.code ?? "?"}: ${assignError.message}`)
      return toolError(`A tarefa foi criada, mas sem responsáveis (não deu para salvá-los). Ajuste no Boop Admin: ${link}`)
    }

    return textResult(
      `Tarefa criada.\n${bullet(
        fields.title,
        dueLabel(fields.due_date, today),
        `responsáveis ${assignee_ids.map((id) => names.person(id)).join(", ")}`,
        fields.priority === "high" ? "prioridade alta" : fields.priority === "low" ? "prioridade baixa" : null,
        names.client(fields.client_id),
        names.project(fields.project_id) ? `projeto ${names.project(fields.project_id)}` : null,
        fields.area ? TASK_AREA_LABEL[fields.area] : null,
        `id ${task.id}`
      )}\n${link}`
    )
  },
}

/* ------------------------------------------------------------------ */
/* Concluir tarefa                                                     */
/* ------------------------------------------------------------------ */

const completeTask: Tool<McpContext> = {
  name: "concluir_tarefa",
  title: "Concluir tarefa",
  description:
    "Marca uma tarefa como concluída (pelo id, que vem de minhas_tarefas ou buscar, ou pelo título). Os pedidos de ajuste ligados a ela são resolvidos junto. Dá para reabrir no Boop Admin.",
  inputSchema: {
    type: "object",
    properties: { tarefa: { type: "string", description: "Id da tarefa (de preferência) ou o título." } },
    required: ["tarefa"],
    additionalProperties: false,
  },
  annotations: { ...WRITE, idempotentHint: true },
  async run(args, context) {
    const { supabase, origin } = context
    const query = readRequiredText(args, "tarefa", 200)
    if (!query.ok) return toolError(query.error)

    const tasks = await loadTasks(supabase)
    // Pelo título, só entre as abertas (há muitas concluídas com nomes parecidos).
    const open = tasks.filter((task) => !isDone(task))
    const found = findByName(open, query.value, (task) => task.title, (task) => task.id, "tarefa aberta")
    if (!found.ok) {
      const any = findByName(tasks, query.value, (task) => task.title, (task) => task.id, "tarefa")
      if (any.ok && isDone(any.value)) return textResult(`A tarefa "${any.value.title}" já estava concluída.`)
      return toolError(found.error)
    }
    const task = found.value

    const { data, error } = await supabase.from("tasks").update({ status: "done" }).eq("id", task.id).select("id")
    if (error) return toolError(dbFailure(error, "Não foi possível concluir a tarefa.").error)
    if (data.length === 0) return toolError("Essa tarefa não existe mais.")
    return textResult(`Concluída: "${task.title}" (id ${task.id}). Para reabrir: ${origin}/tarefas?tarefa=${task.id}`)
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

export const WRITE_TOOLS = [createTask, completeTask, createIdea, writeToChannel]
