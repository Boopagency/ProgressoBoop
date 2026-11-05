import { formatMonthYear } from "@/lib/dates"
import type { DateKey } from "@/lib/types"

/** "Novembro de 2026" com o mês na serifada itálica (títulos de mês das telas de gestão). */
export function MonthTitle({ period }: { period: DateKey }) {
  const label = formatMonthYear(period)
  const cut = label.lastIndexOf(" de ")
  if (cut < 0) return label
  return (
    <>
      <em className="emphasis pr-[0.05em] text-[1.18em] leading-none text-brand-ink">{label.slice(0, cut)}</em>
      {label.slice(cut)}
    </>
  )
}
