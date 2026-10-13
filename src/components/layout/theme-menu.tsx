"use client"

import { Monitor, Moon, Sun, type LucideIcon } from "lucide-react"

import { DropdownMenuLabel, DropdownMenuRadioGroup, DropdownMenuRadioItem } from "@/components/ui/dropdown-menu"
import { useTheme } from "@/hooks/use-theme"
import { isThemeChoice, THEME_CHOICES, THEME_LABEL, type ThemeChoice } from "@/lib/theme"

const THEME_ICON: Record<ThemeChoice, LucideIcon> = {
  light: Sun,
  dark: Moon,
  system: Monitor,
}

/** "Tema" no menu da pessoa (admin e portal): Claro, Escuro ou Sistema. */
export function ThemeMenuItems() {
  const { choice, setChoice } = useTheme()
  return (
    <>
      <DropdownMenuLabel className="pb-1 text-xs font-normal text-muted-foreground">Tema</DropdownMenuLabel>
      <DropdownMenuRadioGroup
        value={choice}
        onValueChange={(value) => {
          if (isThemeChoice(value)) setChoice(value)
        }}
      >
        {THEME_CHOICES.map((option) => {
          const Icon = THEME_ICON[option]
          return (
            <DropdownMenuRadioItem key={option} value={option} onSelect={(event) => event.preventDefault()}>
              <Icon className="text-muted-foreground" />
              {THEME_LABEL[option]}
            </DropdownMenuRadioItem>
          )
        })}
      </DropdownMenuRadioGroup>
    </>
  )
}
