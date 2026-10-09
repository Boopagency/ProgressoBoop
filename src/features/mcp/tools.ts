import "server-only"

import type { McpContext, McpUser } from "@/features/mcp/auth"
import type { Tool } from "@/features/mcp/protocol"
import { READ_TOOLS } from "@/features/mcp/read-tools"
import { WRITE_TOOLS } from "@/features/mcp/write-tools"
import { formatLongDate } from "@/lib/dates"
import type { DateKey } from "@/lib/types"

/**
 * As ferramentas do conector do Claude. Nenhuma apaga nada e nenhuma lê o
 * financeiro; tudo passa pelo RLS com o token de quem conectou.
 */
export const MCP_TOOLS: Tool<McpContext>[] = [...READ_TOOLS, ...WRITE_TOOLS]

/** Orientação geral, enviada ao Claude quando ele conecta. */
export function serverInstructions(user: McpUser, today: DateKey): string {
  return [
    `Boop Admin é a ferramenta interna da Boop, agência de marketing de Curitiba. Você está conectado como ${user.full_name} e vê só o que essa pessoa vê.`,
    `Hoje é ${formatLongDate(today).toLowerCase()} de ${today.slice(0, 4)} (fuso de São Paulo). As semanas vão de segunda a domingo e as datas vão no formato aaaa-mm-dd.`,
    "Para agir sobre um item (concluir uma tarefa, escrever num canal), use o id que as outras ferramentas devolvem ou o nome exato. Clientes, projetos e pessoas podem ser informados pelo nome.",
    "Nada aqui apaga dados e o financeiro não está disponível. Antes de criar ou concluir algo que a pessoa não pediu claramente, confirme com ela.",
    "Responda em português e, quando ajudar, mande o link do Boop Admin que vem nos resultados.",
  ].join("\n")
}
