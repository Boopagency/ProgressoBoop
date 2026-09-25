"use client"

import { ptBR } from "date-fns/locale"
import { useState, type ReactNode } from "react"

import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import {
  addDaysToKey,
  formatDateKey,
  nextWeekdayKey,
  parseDateKey,
  WEEK_STARTS_ON,
} from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Seletor de data: atalhos (hoje, amanhã, sexta, próxima segunda) + calendário. */
export function DatePicker({
  value,
  onChange,
  today,
  renderValue,
  placeholder,
  clearLabel,
  className,
  align = "start",
  icon,
  "aria-label": ariaLabel,
}: {
  value: DateKey | null
  onChange: (value: DateKey | null) => void
  today: DateKey
  renderValue: (value: DateKey) => ReactNode
  placeholder: string
  /** Quando informado, mostra um botão para limpar a data. */
  clearLabel?: string
  className?: string
  align?: "start" | "end"
  icon?: ReactNode
  "aria-label"?: string
}) {
  const [open, setOpen] = useState(false)

  const shortcuts: { label: string; value: DateKey }[] = [
    { label: "Hoje", value: today },
    { label: "Amanhã", value: addDaysToKey(today, 1) },
    { label: "Sexta", value: nextWeekdayKey(today, 5) },
    { label: "Próx. segunda", value: nextWeekdayKey(today, 1) },
  ]

  function choose(next: DateKey | null) {
    onChange(next)
    setOpen(false)
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          className={cn(
            "inline-flex items-center gap-2 rounded-md text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:bg-accent",
            className
          )}
        >
          {icon}
          {value ? renderValue(value) : <span className="text-muted-foreground">{placeholder}</span>}
        </button>
      </PopoverTrigger>
      <PopoverContent align={align} className="w-auto p-0">
        <div className="grid grid-cols-2 gap-1 border-b p-2">
          {shortcuts.map((shortcut) => (
            <Button
              key={shortcut.label}
              type="button"
              variant="ghost"
              size="sm"
              className={cn(
                "justify-start font-normal",
                value === shortcut.value && "bg-accent font-medium"
              )}
              onClick={() => choose(shortcut.value)}
            >
              {shortcut.label}
            </Button>
          ))}
        </div>
        <Calendar
          mode="single"
          locale={ptBR}
          weekStartsOn={WEEK_STARTS_ON}
          selected={value ? parseDateKey(value) : undefined}
          defaultMonth={parseDateKey(value ?? today)}
          onSelect={(date) => {
            if (date) choose(formatDateKey(date))
          }}
        />
        {value && clearLabel ? (
          <div className="border-t p-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="w-full font-normal text-muted-foreground"
              onClick={() => choose(null)}
            >
              {clearLabel}
            </Button>
          </div>
        ) : null}
      </PopoverContent>
    </Popover>
  )
}
