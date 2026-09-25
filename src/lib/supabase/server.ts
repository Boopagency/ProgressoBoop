import "server-only"

import { createServerClient } from "@supabase/ssr"
import { cookies } from "next/headers"

import type { Database } from "@/lib/supabase/database.types"
import { supabaseEnv } from "@/lib/supabase/env"

/**
 * Cliente do Supabase para Server Components e Server Actions, com a sessão
 * da pessoa (cookies). Todas as consultas passam pelas políticas de RLS.
 */
export async function createClient() {
  const cookieStore = await cookies()
  const { url, publishableKey } = supabaseEnv()

  return createServerClient<Database>(url, publishableKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set(name, value, options)
          }
        } catch {
          // Chamado de um Server Component, que não grava cookies. O proxy
          // renova a sessão a cada requisição, então dá para ignorar.
        }
      },
    },
  })
}

export type SupabaseServerClient = Awaited<ReturnType<typeof createClient>>
