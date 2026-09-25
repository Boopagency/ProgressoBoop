"use client"

import type { ReactNode } from "react"

import { DatePicker } from "@/components/date-picker"
import { DueLabel } from "@/features/tasks/task-meta"
import type { DateKey } from "@/lib/types"

/** Prazo da tarefa: mostra "Hoje", "Amanhã", "Venceu 24/09"… e permite remover. */
export function DueDatePicker({
  value,
  onChange,
  today,
  className,
  align,
  icon,
  placeholder = "Prazo",
}: {
  value: DateKey | null
  onChange: (value: DateKey | null) => void
  today: DateKey
  className?: string
  align?: "start" | "end"
  icon?: ReactNode
  placeholder?: string
}) {
  return (
    <DatePicker
      value={value}
      onChange={onChange}
      today={today}
      placeholder={placeholder}
      clearLabel="Remover prazo"
      aria-label="Prazo"
      renderValue={(due) => <DueLabel due={due} today={today} className="text-sm" />}
      className={className}
      align={align}
      icon={icon}
    />
  )
}
