import * as React from "react"
import { cn } from "@/lib/utils"

const DATE_TIME_TYPES = new Set(["date", "time", "datetime-local", "month", "week"])

function Input({ className, type, ...props }: React.ComponentProps<"input">) {
  return (
    <input
      type={type}
      data-slot="input"
      className={cn(
        "h-9 w-full min-w-0 rounded-md border border-input bg-card px-3 py-1 text-base shadow-xs transition-[color,box-shadow] outline-none selection:bg-primary selection:text-primary-foreground file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm dark:bg-input/30",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
        "aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40",
        // Data e horário: no iPhone (Safari), o campo nativo ignora a largura e fica do tamanho do
        // seletor do sistema, saindo da coluna e fazendo a tela rolar para o lado. Sem a aparência
        // nativa, ele respeita a largura (o seletor continua abrindo ao tocar).
        DATE_TIME_TYPES.has(type ?? "") &&
          "max-md:appearance-none max-md:[&::-webkit-date-and-time-value]:min-h-[1lh] max-md:[&::-webkit-date-and-time-value]:text-left",
        className
      )}
      {...props}
    />
  )
}

export { Input }
