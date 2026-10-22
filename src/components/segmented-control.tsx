"use client"

import { PillIndicator } from "@/components/pill-indicator"
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group"
import { cn } from "@/lib/utils"

/**
 * Controle segmentado em pílulas (ex.: Todas | Minhas, Semana | Mês), sobre o
 * ToggleGroup do shadcn: a opção escolhida fica preenchida, e o preenchimento
 * desliza de uma opção para a outra (`PillIndicator`).
 */
export function SegmentedControl<T extends string>({
  value,
  onValueChange,
  options,
  className,
  "aria-label": ariaLabel,
}: {
  value: T
  onValueChange: (value: T) => void
  options: readonly { value: T; label: string }[]
  className?: string
  "aria-label": string
}) {
  return (
    <ToggleGroup
      type="single"
      value={value}
      onValueChange={(next) => {
        const option = options.find((candidate) => candidate.value === next)
        if (option) onValueChange(option.value)
      }}
      spacing={0.5}
      aria-label={ariaLabel}
      className={cn("group/pill relative rounded-full bg-card p-1 shadow-card", className)}
    >
      <PillIndicator selector="[data-state=on]" active={value} />
      {options.map((option) => (
        <ToggleGroupItem
          key={option.value}
          value={option.value}
          className="h-8 rounded-full! px-4 text-[13px] font-medium text-muted-foreground hover:bg-transparent hover:text-foreground data-[state=on]:bg-primary data-[state=on]:text-primary-foreground data-[state=on]:shadow-[0_6px_14px_-8px_rgb(11_27_44/0.7)] group-data-[pill]/pill:data-[state=on]:bg-transparent group-data-[pill]/pill:data-[state=on]:shadow-none"
        >
          {option.label}
        </ToggleGroupItem>
      ))}
    </ToggleGroup>
  )
}
