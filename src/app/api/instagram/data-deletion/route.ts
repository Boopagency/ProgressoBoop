import { type NextRequest } from "next/server"

import { instagramApp } from "@/features/instagram/config"
import { forgetFromSignedRequest } from "@/features/instagram/forget"
import { DATA_DELETION_PATH, deletionCode, deletionKey, readDeletionCode } from "@/features/instagram/logic"
import { formatLongDate, toDateKey } from "@/lib/dates"

/**
 * "URL de solicitação de exclusão de dados" do app da Meta. POST: a Meta
 * manda o `signed_request`; apagamos a conta e o token na hora e devolvemos o
 * JSON que ela exige (`url` de status e `confirmation_code`). GET: a página de
 * status, aberta pela pessoa com o código (`?codigo=`). O código é assinado,
 * então a página reconhece sem guardar nada. Público.
 */
export async function POST(request: NextRequest) {
  const result = await forgetFromSignedRequest(request)
  if (!result.ok) return Response.json({ error: result.error }, { status: result.status })
  console.info(`[instagram] exclusão de dados: ${result.removed} conta(s) apagada(s)`)

  const code = deletionCode(Date.now(), deletionKey(result.appSecret))
  const url = new URL(DATA_DELETION_PATH, request.nextUrl.origin)
  url.searchParams.set("codigo", code)
  return Response.json({ url: url.toString(), confirmation_code: code }, { headers: { "Cache-Control": "no-store" } })
}

function page(title: string, text: string, status = 200) {
  const escape = (value: string) =>
    value.replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] ?? char)
  const html = `<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escape(title)} · Boop Admin</title></head><body style="font-family:system-ui,sans-serif;max-width:560px;margin:48px auto;padding:0 16px;color:#111;line-height:1.5"><h1 style="font-size:20px">${escape(title)}</h1><p>${escape(text)}</p></body></html>`
  return new Response(html, { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" } })
}

export async function GET(request: NextRequest) {
  const app = instagramApp()
  const code = request.nextUrl.searchParams.get("codigo")
  const at = app ? readDeletionCode(code, deletionKey(app.appSecret)) : null
  if (at === null) {
    return page("Pedido não encontrado", "Confira o código de confirmação que o Instagram mostrou.", 404)
  }
  return page(
    "Dados do Instagram apagados",
    `Pedido ${code}, recebido em ${formatLongDate(toDateKey(new Date(at))).toLowerCase()}: o Boop Admin apagou a conexão com a sua conta do Instagram e o acesso guardado. Os posts que a agência preparou para o cliente continuam com ele.`
  )
}
