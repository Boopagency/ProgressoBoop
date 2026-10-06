import { createClient } from "@/lib/supabase/server"

/**
 * Visita diária ao banco, chamada pelo cron da Vercel (vercel.json). O
 * Supabase gratuito pausa o projeto quando passa 7 dias com poucas consultas;
 * algumas por dia bastam para ele continuar no ar.
 *
 * Roda sem sessão: o RLS devolve zero linhas, mas cada consulta conta como
 * uso do banco. Não expõe nada além do que a chave publicável já permite,
 * então a rota pode ser pública.
 */
const TABLES = ["profiles", "tasks", "events", "clients"] as const

export async function GET() {
  const supabase = await createClient()
  const results = await Promise.all(
    TABLES.map((table) => supabase.from(table).select("id").limit(1))
  )

  const failed = results.flatMap((result, index) =>
    result.error ? [`${TABLES[index]}: ${result.error.message}`] : []
  )
  if (failed.length > 0) console.error(`[keepalive] ${failed.join("; ")}`)

  return Response.json(
    { ok: failed.length === 0, at: new Date().toISOString() },
    { status: failed.length === 0 ? 200 : 503, headers: { "Cache-Control": "no-store" } }
  )
}
