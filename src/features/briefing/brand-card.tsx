import { Sparkles } from "lucide-react"

import type { BrandCard } from "@/features/briefing/flow-logic"
import { cn } from "@/lib/utils"

/**
 * "Sua marca": o progresso do briefing, que se monta com o que o cliente
 * escolheu e enviou (nome, canal de venda, tom, cores, referências e
 * materiais). Nada escrito pela IA. É o painel de destaque da tela.
 */
export function BrandCardView({
  card,
  doneBlocks,
  totalBlocks,
  className,
}: {
  card: BrandCard
  doneBlocks: number
  totalBlocks: number
  className?: string
}) {
  const rows: { label: string; value: string | null; wide?: boolean }[] = [
    { label: "Tom", value: card.tones.length ? card.tones.join(" + ") : null, wide: true },
    { label: "Desde", value: card.since },
    { label: "Vende por", value: card.channel },
    { label: "Preço", value: card.price },
    { label: "Referências", value: card.references ? `${card.references} ${card.references === 1 ? "link" : "links"}` : null },
    { label: "Materiais", value: card.materials ? `${card.materials} ${card.materials === 1 ? "arquivo" : "arquivos"}` : null },
  ]
  const filled = rows.filter((row) => row.value).length + (card.colors.length ? 1 : 0)

  return (
    <section aria-labelledby="sua-marca" className={cn("glass-panel rounded-3xl p-5", className)}>
      <div className="flex items-center gap-2">
        <Sparkles className="size-4 text-brand-ink" aria-hidden="true" />
        <h2 id="sua-marca" className="eyebrow text-muted-foreground">
          Sua marca
        </h2>
        <span className="ml-auto text-xs text-muted-foreground tabular-nums">
          {doneBlocks} de {totalBlocks} etapas
        </span>
      </div>
      <p className={cn("mt-3 font-display text-[24px] leading-tight font-medium tracking-tight", card.name ? "text-foreground" : "text-subtle-foreground")}>
        {card.name ?? "Sua marca aqui"}
      </p>
      <p className="mt-1 truncate text-[13px] text-muted-foreground">
        {[card.instagram, card.region].filter(Boolean).join(" · ") || "Vai se montando com as suas respostas."}
      </p>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-foreground/10" aria-hidden="true">
        <div
          className="h-full rounded-full bg-brand transition-[width] duration-500 motion-reduce:transition-none"
          style={{ width: `${totalBlocks ? Math.round((doneBlocks / totalBlocks) * 100) : 0}%` }}
        />
      </div>

      <dl className="mt-4 grid grid-cols-2 gap-x-4 gap-y-3">
        {rows.map((row) => (
          <div key={row.label} className={cn("min-w-0", row.wide && "col-span-2")}>
            <dt className="eyebrow text-[10.5px] text-subtle-foreground">{row.label}</dt>
            <dd className={cn("mt-0.5 truncate text-[14px]", row.value ? "text-foreground" : "text-subtle-foreground")}>{row.value ?? "—"}</dd>
          </div>
        ))}
        <div className="min-w-0">
          <dt className="eyebrow text-[10.5px] text-subtle-foreground">Cores</dt>
          <dd className="mt-1.5 flex min-h-6 flex-wrap gap-1.5">
            {card.colors.length ? (
              card.colors.map((color) => (
                <span key={color} className="size-6 rounded-full border border-foreground/15" style={{ backgroundColor: color }} title={color} />
              ))
            ) : (
              <span className="text-[14px] text-subtle-foreground">—</span>
            )}
          </dd>
        </div>
      </dl>
      <p className="sr-only">{filled} itens da sua marca preenchidos.</p>
    </section>
  )
}
