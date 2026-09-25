import "server-only"

import { createSeed, type MockData } from "@/server/mock/seed"

/**
 * "Banco" em memória do protótipo (etapa 1). Os dados ficam em `globalThis`
 * para sobreviver ao hot reload e voltam ao estado inicial quando o servidor
 * reinicia. Na etapa 2 este módulo é removido e as queries/actions passam a
 * usar o Supabase.
 */
const store = globalThis as typeof globalThis & { __boopMockDb?: MockData }

export function mockDb(): MockData {
  store.__boopMockDb ??= createSeed()
  return store.__boopMockDb
}

/** Cópia defensiva: quem lê não altera o "banco" por acidente. */
export function snapshot<T>(value: T): T {
  return structuredClone(value)
}

export function newId(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}`
}
