"use client"

import { useSyncExternalStore } from "react"

import {
  DARK_QUERY,
  isThemeChoice,
  THEME_COLOR,
  THEME_STORAGE_KEY,
  type ResolvedTheme,
  type ThemeChoice,
} from "@/lib/theme"

function readChoice(): ThemeChoice {
  try {
    const stored = window.localStorage.getItem(THEME_STORAGE_KEY)
    return isThemeChoice(stored) ? stored : "system"
  } catch {
    return "system"
  }
}

function resolve(choice: ThemeChoice): ResolvedTheme {
  if (choice !== "system") return choice
  return window.matchMedia(DARK_QUERY).matches ? "dark" : "light"
}

function readResolved(): ResolvedTheme {
  return document.documentElement.classList.contains("dark") ? "dark" : "light"
}

function syncThemeColor(theme: ResolvedTheme) {
  for (const meta of document.querySelectorAll('meta[name="theme-color"]')) {
    meta.setAttribute("content", THEME_COLOR[theme])
  }
}

/** Troca a classe do <html> sem as transições dos componentes: tudo muda de uma vez. */
function apply(choice: ThemeChoice) {
  const theme = resolve(choice)
  const root = document.documentElement
  if (readResolved() === theme && root.style.colorScheme === theme) return
  const pause = document.createElement("style")
  pause.textContent = "*,*::before,*::after{transition:none!important}"
  document.head.append(pause)
  root.classList.toggle("dark", theme === "dark")
  root.style.colorScheme = theme
  syncThemeColor(theme)
  void window.getComputedStyle(document.body).opacity
  window.setTimeout(() => pause.remove(), 1)
}

const listeners = new Set<() => void>()
let stopWatching: (() => void) | null = null

function emit() {
  for (const listener of listeners) listener()
}

/** Acompanha o tema do sistema (quando a escolha é "Sistema") e a troca feita em outra aba. */
function subscribe(listener: () => void) {
  listeners.add(listener)
  if (!stopWatching) {
    syncThemeColor(readResolved())
    const media = window.matchMedia(DARK_QUERY)
    const onSystemChange = () => {
      if (readChoice() === "system") apply("system")
      emit()
    }
    const onStorage = (event: StorageEvent) => {
      if (event.key !== null && event.key !== THEME_STORAGE_KEY) return
      apply(readChoice())
      emit()
    }
    media.addEventListener("change", onSystemChange)
    window.addEventListener("storage", onStorage)
    stopWatching = () => {
      media.removeEventListener("change", onSystemChange)
      window.removeEventListener("storage", onStorage)
    }
  }
  return () => {
    listeners.delete(listener)
    if (listeners.size === 0) {
      stopWatching?.()
      stopWatching = null
    }
  }
}

function setThemeChoice(choice: ThemeChoice) {
  try {
    if (choice === "system") window.localStorage.removeItem(THEME_STORAGE_KEY)
    else window.localStorage.setItem(THEME_STORAGE_KEY, choice)
  } catch {
    // Sem localStorage (navegação privada restrita): vale só nesta página.
  }
  apply(choice)
  emit()
}

/**
 * O tema escolhido (claro, escuro ou sistema), o que está na tela e a troca.
 * No servidor e na hidratação vale "sistema"/claro; logo depois, o real.
 */
export function useTheme(): { choice: ThemeChoice; resolved: ResolvedTheme; setChoice: (choice: ThemeChoice) => void } {
  const choice = useSyncExternalStore(subscribe, readChoice, () => "system" as const)
  const resolved = useSyncExternalStore(subscribe, readResolved, () => "light" as const)
  return { choice, resolved, setChoice: setThemeChoice }
}
