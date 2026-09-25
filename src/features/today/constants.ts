/** Cookie com a preferência "Todas / Minhas" da tela Hoje. */
export const TODAY_SCOPE_COOKIE = "boop_hoje_escopo"

export type TodayScope = "all" | "mine"

/** "Minhas" é o padrão; "Todas" só quando a pessoa escolheu. */
export function parseTodayScope(value: string | undefined): TodayScope {
  return value === "all" ? "all" : "mine"
}
