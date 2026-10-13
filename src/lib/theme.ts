/*
 * Tema da interface: claro, escuro ou o do sistema. A escolha fica no
 * navegador (localStorage); sem escolha, vale o do sistema. THEME_SCRIPT roda
 * no <head>, antes da primeira pintura, e põe a classe `dark` no <html>, então
 * a página não pisca ao abrir. A troca na hora fica em `useTheme`.
 */

export type ThemeChoice = "light" | "dark" | "system"
export type ResolvedTheme = "light" | "dark"

export const THEME_CHOICES = ["light", "dark", "system"] as const satisfies readonly ThemeChoice[]

export const THEME_LABEL: Record<ThemeChoice, string> = {
  light: "Claro",
  dark: "Escuro",
  system: "Sistema",
}

export const THEME_STORAGE_KEY = "boop-theme"
export const DARK_QUERY = "(prefers-color-scheme: dark)"

/** Cor da barra do navegador no celular: o fundo geral (`--canvas`) de cada tema. */
export const THEME_COLOR: Record<ResolvedTheme, string> = {
  light: "#f7f7f5",
  dark: "#131211",
}

export function isThemeChoice(value: unknown): value is ThemeChoice {
  return THEME_CHOICES.includes(value as ThemeChoice)
}

/** Aplica o tema salvo (ou o do sistema) antes da pintura. Sem acesso ao localStorage, fica o claro. */
export const THEME_SCRIPT = `(function(){try{var c=localStorage.getItem(${JSON.stringify(THEME_STORAGE_KEY)});var d=c==="dark"||(c!=="light"&&window.matchMedia(${JSON.stringify(DARK_QUERY)}).matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light"}catch(e){}})()`
