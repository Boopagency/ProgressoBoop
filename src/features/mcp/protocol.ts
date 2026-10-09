/*
 * Servidor MCP mínimo, sem dependência: JSON-RPC 2.0 sobre o transporte
 * "Streamable HTTP", sem estado e sem SSE (cada POST recebe a resposta em
 * JSON). O protocolo daqui é só o necessário para ferramentas: initialize,
 * ping, tools/list e tools/call. As ferramentas ficam em tools.ts.
 */

/** Versões do protocolo que este servidor fala, da mais nova para a mais antiga. */
export const PROTOCOL_VERSIONS = ["2025-11-25", "2025-06-18", "2025-03-26", "2024-11-05"] as const

export const SERVER_INFO = { name: "boop-admin", title: "Boop Admin", version: "1.0.0" } as const

type JsonRpcId = string | number

/** JSON Schema da entrada de uma ferramenta (o subconjunto usado aqui). */
export interface InputSchema {
  type: "object"
  properties: Record<string, Record<string, unknown>>
  required?: string[]
  additionalProperties?: boolean
}

export interface ToolResult {
  content: { type: "text"; text: string }[]
  isError?: boolean
}

export interface Tool<Context> {
  name: string
  title: string
  description: string
  inputSchema: InputSchema
  /** Dicas para o Claude: só leitura, se apaga algo, se repetir não muda nada. */
  annotations: { readOnlyHint: boolean; destructiveHint: boolean; idempotentHint: boolean; openWorldHint: boolean }
  run: (args: Record<string, unknown>, context: Context) => Promise<ToolResult>
}

export function textResult(text: string): ToolResult {
  return { content: [{ type: "text", text }] }
}

/** Erro que o Claude lê e corrige (entrada inválida, item não encontrado). */
export function toolError(text: string): ToolResult {
  return { content: [{ type: "text", text }], isError: true }
}

interface JsonRpcError {
  jsonrpc: "2.0"
  id: JsonRpcId | null
  error: { code: number; message: string }
}

interface JsonRpcSuccess {
  jsonrpc: "2.0"
  id: JsonRpcId
  result: unknown
}

export type JsonRpcResponse = JsonRpcError | JsonRpcSuccess

export function rpcError(id: JsonRpcId | null, code: number, message: string): JsonRpcError {
  return { jsonrpc: "2.0", id, error: { code, message } }
}

export const PARSE_ERROR = -32700
const INVALID_REQUEST = -32600
const METHOD_NOT_FOUND = -32601
const INVALID_PARAMS = -32602

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
}

function isId(value: unknown): value is JsonRpcId {
  return typeof value === "string" || (typeof value === "number" && Number.isFinite(value))
}

export interface ServerOptions<Context> {
  tools: Tool<Context>[]
  context: Context
  /** Orientação geral para o Claude, enviada no initialize. */
  instructions: string
}

/**
 * Responde a uma mensagem JSON-RPC (ou a um lote). Notificações e respostas
 * vindas do cliente não têm resposta: devolve null e a rota responde 202.
 */
export async function handleMessage<Context>(
  message: unknown,
  options: ServerOptions<Context>
): Promise<JsonRpcResponse | JsonRpcResponse[] | null> {
  if (Array.isArray(message)) {
    if (message.length === 0) return rpcError(null, INVALID_REQUEST, "Lote vazio.")
    const responses = await Promise.all(message.map((item) => handleSingle(item, options)))
    const answered = responses.filter((response): response is JsonRpcResponse => response !== null)
    return answered.length > 0 ? answered : null
  }
  return handleSingle(message, options)
}

async function handleSingle<Context>(
  message: unknown,
  { tools, context, instructions }: ServerOptions<Context>
): Promise<JsonRpcResponse | null> {
  if (!isRecord(message) || message.jsonrpc !== "2.0") return rpcError(null, INVALID_REQUEST, "Mensagem JSON-RPC inválida.")
  // Resposta do cliente (a um pedido que este servidor não faz) ou notificação.
  if (typeof message.method !== "string") return null
  if (!("id" in message) || message.id === undefined) return null
  if (!isId(message.id)) return rpcError(null, INVALID_REQUEST, "Id inválido.")

  const id = message.id
  const params = isRecord(message.params) ? message.params : {}

  switch (message.method) {
    case "initialize": {
      const requested = params.protocolVersion
      const protocolVersion = PROTOCOL_VERSIONS.find((version) => version === requested) ?? PROTOCOL_VERSIONS[0]
      return {
        jsonrpc: "2.0",
        id,
        result: {
          protocolVersion,
          capabilities: { tools: { listChanged: false } },
          serverInfo: SERVER_INFO,
          instructions,
        },
      }
    }
    case "ping":
      return { jsonrpc: "2.0", id, result: {} }
    case "tools/list":
      return {
        jsonrpc: "2.0",
        id,
        result: {
          tools: tools.map(({ name, title, description, inputSchema, annotations }) => ({
            name,
            title,
            description,
            inputSchema,
            annotations: { title, ...annotations },
          })),
        },
      }
    case "tools/call": {
      const tool = tools.find((candidate) => candidate.name === params.name)
      if (!tool) return rpcError(id, INVALID_PARAMS, `Ferramenta desconhecida: ${String(params.name)}`)
      const args = isRecord(params.arguments) ? params.arguments : {}
      try {
        return { jsonrpc: "2.0", id, result: await tool.run(args, context) }
      } catch (error) {
        console.error(`[mcp] ${tool.name}: ${error instanceof Error ? error.message : String(error)}`)
        return {
          jsonrpc: "2.0",
          id,
          result: toolError(error instanceof Error && error.message ? error.message : "Não foi possível concluir agora. Tente de novo."),
        }
      }
    }
    default:
      return rpcError(id, METHOD_NOT_FOUND, `Método não suportado: ${message.method}`)
  }
}
