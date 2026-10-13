import "server-only"

import type { McpContext } from "@/features/mcp/auth"
import { bullet, count, excerpt, fromClient, readBoolean } from "@/features/mcp/logic"
import { textResult, toolError, type Tool } from "@/features/mcp/protocol"
import { loadDirectory, namesOf } from "@/features/mcp/queries"
import { EDIT, READ_ONLY, limited } from "@/features/mcp/tools/common"
import { describeNotification, notificationSentence } from "@/features/notifications/logic"
import { markRead } from "@/features/notifications/mutations"
import { fetchNotifications } from "@/features/notifications/queries"
import { formatShortDate, toDateKey, toTimeLabel } from "@/lib/dates"

/*
 * Notificações (o sino) pelo conector: listar e marcar como lidas. Nos avisos
 * do portal, o trecho é texto do cliente e volta marcado.
 */

const listNotifications: Tool<McpContext> = {
  name: "notificacoes",
  title: "Notificações",
  description: "Os avisos do sino de quem está conectado (os 30 mais recentes; por padrão só os não lidos): mensagens, pedidos e aprovações de clientes e tarefas atribuídas, com o link e o id de cada um.",
  inputSchema: { type: "object", properties: { incluir_lidas: { type: "boolean" } }, additionalProperties: false },
  annotations: READ_ONLY,
  async run(args, context) {
    const { supabase, user, origin, today } = context
    const [directory, feed] = await Promise.all([loadDirectory(supabase), fetchNotifications(supabase, user.id)])
    const names = namesOf(directory)
    const items = readBoolean(args, "incluir_lidas") ? feed.items : feed.items.filter((item) => !item.read_at)
    const lines = items.map((item) => {
      const text = describeNotification(item, names.client(item.client_id))
      const fromPortal = item.kind.startsWith("client_")
      return bullet(
        `${formatShortDate(toDateKey(item.created_at), today)} ${toTimeLabel(item.created_at)}`,
        notificationSentence(text),
        text.excerpt ? (fromPortal ? fromClient(text.excerpt) : `"${excerpt(text.excerpt, 200)}"`) : null,
        item.read_at ? "lida" : "não lida",
        `${origin}${item.link}`,
        `id ${item.id}`
      )
    })
    return textResult(`${count(feed.unread, "não lida", "não lidas")}.\n${limited(lines).join("\n") || "Nenhum aviso."}`)
  },
}

const markNotifications: Tool<McpContext> = {
  name: "marcar_notificacoes_lidas",
  title: "Marcar notificações como lidas",
  description: "Marca como lido um aviso (pelo id) ou todos os seus avisos de uma vez.",
  inputSchema: {
    type: "object",
    properties: { notificacao: { type: "string", description: "Id do aviso. Sem isso, marca todos." } },
    additionalProperties: false,
  },
  annotations: EDIT,
  async run(args, context) {
    const id = typeof args.notificacao === "string" && args.notificacao.trim() ? args.notificacao.trim() : null
    const saved = await markRead(context.supabase, context.user.id, id)
    if (!saved.ok) return toolError(saved.error)
    return textResult(id ? "Aviso marcado como lido." : "Todos os avisos marcados como lidos.")
  },
}

export const NOTIFICATION_TOOLS = [listNotifications, markNotifications]
