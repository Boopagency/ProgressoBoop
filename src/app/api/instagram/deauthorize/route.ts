import { forgetFromSignedRequest } from "@/features/instagram/forget"

/**
 * "URL de retorno de chamada para cancelar autorização" do app da Meta: a
 * pessoa tirou o app no Instagram. Apaga a conta conectada e o token (em todos
 * os clientes). Público, vale o `signed_request`.
 */
export async function POST(request: Request) {
  const result = await forgetFromSignedRequest(request)
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  console.info(`[instagram] desautorizado: ${result.removed} conta(s) apagada(s)`)
  return Response.json({ ok: true }, { headers: { "Cache-Control": "no-store" } })
}
