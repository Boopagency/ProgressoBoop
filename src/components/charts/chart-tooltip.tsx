import { cn } from "@/lib/utils"

export interface TooltipLine {
  label: string
  value: string
  /** Chave de cor da série (traço curto ao lado do nome). */
  tone?: "primary" | "light" | "secondary" | "negative" | "muted"
}

const KEY: Record<NonNullable<TooltipLine["tone"]>, string> = {
  primary: "bg-chart-1",
  light: "bg-chart-1-light",
  secondary: "bg-chart-2",
  negative: "bg-overdue",
  muted: "bg-chart-muted",
}

/**
 * Detalhe flutuante de uma posição do gráfico: o valor em destaque e o nome
 * da série depois. Fica dentro da área do gráfico, sem sair pelas bordas.
 */
export function ChartTooltip({
  index,
  count,
  title,
  lines,
  hint,
}: {
  index: number
  count: number
  title: string
  lines: TooltipLine[]
  hint?: string
}) {
  const center = ((index + 0.5) / count) * 100
  const edge = index < count * 0.25 ? "left" : index >= count * 0.75 ? "right" : "center"
  return (
    <div
      role="presentation"
      className={cn(
        "pointer-events-none absolute top-0 z-20 w-max max-w-60 rounded-lg border bg-popover px-3 py-2 text-popover-foreground shadow-md",
        edge === "center" && "-translate-x-1/2",
        edge === "right" && "-translate-x-full"
      )}
      style={{ left: edge === "left" ? `max(0px, calc(${center}% - 12px))` : edge === "right" ? `min(100%, calc(${center}% + 12px))` : `${center}%` }}
    >
      <p className="text-xs font-medium text-foreground">{title}</p>
      <dl className="mt-1 space-y-0.5">
        {lines.map((line) => (
          <div key={line.label} className="flex items-center justify-between gap-4 text-xs">
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              {line.tone ? <span aria-hidden="true" className={cn("h-0.5 w-2.5 rounded-full", KEY[line.tone])} /> : null}
              {line.label}
            </dt>
            <dd className="font-medium text-foreground tabular-nums">{line.value}</dd>
          </div>
        ))}
      </dl>
      {hint ? <p className="mt-1.5 text-[11px] text-subtle-foreground">{hint}</p> : null}
    </div>
  )
}
