import "server-only"

import type { PostgrestError } from "@supabase/supabase-js"

/**
 * Resultado de erro de uma Server Action a partir de um erro do banco. O
 * detalhe técnico vai só para o log do servidor; a pessoa vê uma frase curta.
 */
export function dbFailure(error: PostgrestError, message: string): { ok: false; error: string } {
  console.error(`[supabase] ${error.code ?? "?"}: ${error.message}`)
  if (error.code === "42501") return { ok: false, error: "Sem permissão para esta ação." }
  return { ok: false, error: message }
}

/** Erro ao carregar dados de uma tela; cai no error.tsx da área logada. */
export function loadError(error: PostgrestError, what: string): Error {
  console.error(`[supabase] ${error.code ?? "?"}: ${error.message}`)
  return new Error(`Não foi possível carregar ${what}.`)
}
