/** Cookie com a preferência "Todas / Minhas" da tela Hoje. */
export const TODAY_SCOPE_COOKIE = "boop_hoje_escopo"

export type TodayScope = "all" | "mine"

export function parseTodayScope(value: string | undefined): TodayScope {
  return value === "mine" ? "mine" : "all"
}
