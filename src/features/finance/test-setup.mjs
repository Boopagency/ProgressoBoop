// Deixa os testes do financeiro importarem os .ts do app direto no Node (que
// já roda TypeScript): resolve o atalho "@/" para src/ e os imports sem
// extensão para .ts. Sem dependências.
import { register } from "node:module"

const src = new URL("../../", import.meta.url).href

const hooks = `
const src = ${JSON.stringify(src)}
const typed = (result) => (result.url.endsWith(".ts") ? { ...result, format: "module-typescript" } : result)
export async function resolve(specifier, context, next) {
  const target = specifier.startsWith("@/") ? src + specifier.slice(2) : specifier
  const local = target.startsWith("file:") || target.startsWith(".")
  if (local && !/\\.[cm]?[jt]sx?$/.test(target)) {
    try {
      return typed(await next(target + ".ts", context))
    } catch {}
  }
  return typed(await next(target, context))
}
`

register(`data:text/javascript,${encodeURIComponent(hooks)}`)

/** Importa um módulo do app (ex.: "@/features/finance/logic") depois do registro. */
export function load(path) {
  return import(path)
}
