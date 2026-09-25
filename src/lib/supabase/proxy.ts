import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"

import type { Database } from "@/lib/supabase/database.types"
import { supabaseEnv } from "@/lib/supabase/env"

/**
 * Renova a sessão do Supabase a cada requisição (tokens expirados são
 * trocados aqui e gravados nos cookies) e devolve se há usuário válido.
 * Segue o padrão do @supabase/ssr para Next.js.
 */
export async function updateSession(
  request: NextRequest
): Promise<{ response: NextResponse; isAuthenticated: boolean }> {
  let response = NextResponse.next({ request })
  const { url, publishableKey } = supabaseEnv()

  const supabase = createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll()
      },
      setAll(cookiesToSet, headers) {
        for (const { name, value } of cookiesToSet) request.cookies.set(name, value)
        response = NextResponse.next({ request })
        for (const { name, value, options } of cookiesToSet) {
          response.cookies.set(name, value, options)
        }
        // Evita que CDNs guardem em cache uma resposta com a sessão de alguém.
        for (const [key, value] of Object.entries(headers)) response.headers.set(key, value)
      },
    },
  })

  // Nada entre createServerClient e getClaims(): getClaims valida o JWT e,
  // se preciso, renova a sessão.
  const { data } = await supabase.auth.getClaims()

  return { response, isAuthenticated: Boolean(data?.claims) }
}
