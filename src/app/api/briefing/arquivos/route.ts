import type { NextRequest } from "next/server"

import { BRIEFING_BUCKET } from "@/features/briefing/storage"
import { createClient } from "@/lib/supabase/server"

/**
 * Arquivo enviado no briefing (logo, manual, fotos), por `?caminho=`. Confere
 * a sessão e redireciona para uma URL assinada de uma hora; o RLS do Storage
 * deixa o cliente ler só a pasta do briefing dele e a equipe, tudo.
 * `?baixar=1` baixa com o nome de `?nome=`.
 */
export async function GET(request: NextRequest) {
  const path = request.nextUrl.searchParams.get("caminho") ?? ""
  if (!/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/files\/[0-9a-f-]{36}$/.test(path)) return new Response("Arquivo não encontrado.", { status: 404 })

  const supabase = await createClient()
  const { data: claims } = await supabase.auth.getClaims()
  if (!claims?.claims) return new Response("Faça login para abrir este arquivo.", { status: 401 })

  const download = request.nextUrl.searchParams.get("baixar") === "1" ? (request.nextUrl.searchParams.get("nome") || true) : undefined
  const { data, error } = await supabase.storage.from(BRIEFING_BUCKET).createSignedUrl(path, 3600, download ? { download } : undefined)
  if (error || !data) return new Response("Arquivo não encontrado.", { status: 404 })
  return new Response(null, { status: 302, headers: { Location: data.signedUrl, "Cache-Control": "private, max-age=3000" } })
}
