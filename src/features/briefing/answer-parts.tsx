import type { AnswerPart } from "@/features/briefing/team-logic"
import { formatShortDate } from "@/lib/dates"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/*
 * Uma parte legível de uma resposta do briefing (`describeAnswer`): texto,
 * escolhas, tom, cores, links, datas e campos. Usada na aba da equipe e na
 * revisão de etapa do portal.
 */

function PartLabel({ children }: { children?: string }) {
  return children ? <p className="mb-1 text-xs font-medium text-muted-foreground">{children}</p> : null
}

export function AnswerPartView({ part, today }: { part: AnswerPart; today: DateKey }) {
  switch (part.type) {
    case "text":
      return (
        <div>
          <PartLabel>{part.label}</PartLabel>
          <p className="text-[13.5px] leading-6 whitespace-pre-line text-foreground">{part.text}</p>
        </div>
      )
    case "chips":
      return (
        <div>
          <PartLabel>{part.label}</PartLabel>
          <ul className="flex flex-wrap gap-1.5">
            {part.items.map((item, index) => (
              <li key={index} className="inline-flex min-h-7 items-center rounded-full border bg-card px-3 py-0.5 text-[13px] text-foreground">
                {item.label}
              </li>
            ))}
          </ul>
        </div>
      )
    case "tone":
      return (
        <ul className="grid gap-2 sm:grid-cols-2">
          {part.items.map((item, index) => (
            <li
              key={index}
              className={cn("rounded-xl border bg-card px-3.5 py-3", item.primary && "border-primary/40 ring-1 ring-primary/20")}
            >
              <p className="flex items-center gap-2 text-[13.5px] font-medium text-foreground">
                {item.label}
                {item.primary && part.items.length > 1 ? <span className="eyebrow text-brand-ink">Principal</span> : null}
              </p>
              {item.description ? <p className="mt-0.5 text-xs text-muted-foreground">{item.description}</p> : null}
              {item.example ? <p className="mt-2 text-[13px] leading-5 text-foreground/85 italic">“{item.example}”</p> : null}
            </li>
          ))}
        </ul>
      )
    case "colors":
      return (
        <div>
          <PartLabel>{part.label}</PartLabel>
          <ul className="flex flex-wrap gap-2">
            {part.items.map((item, index) => (
              <li key={index} className="flex items-center gap-2 rounded-full border bg-card py-1 pr-3 pl-1 text-xs text-foreground">
                {/* A cor é a resposta do cliente (dado), não um token do visual. */}
                <span aria-hidden="true" className="size-6 rounded-full border" style={{ backgroundColor: item.hex }} />
                <span className="font-mono uppercase">{item.hex}</span>
                {item.use ? (
                  <span className={cn(item.use === "avoid" ? "text-destructive" : "text-success-ink")}>
                    {item.use === "avoid" ? "evitar" : "usar"}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      )
    case "links":
      return (
        <div>
          <PartLabel>{part.label}</PartLabel>
          <ul className="space-y-1">
            {part.items.map((item, index) => (
              <li key={index} className="text-[13.5px] break-all">
                {item.href ? (
                  <a href={item.href} target="_blank" rel="noopener noreferrer nofollow" className="text-brand-ink underline-offset-2 hover:underline">
                    {item.text}
                  </a>
                ) : (
                  <span className="text-foreground">{item.text}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )
    case "dates":
      return (
        <div>
          <PartLabel>{part.label}</PartLabel>
          <ul className="space-y-1">
            {part.items.map((item, index) => (
              <li key={index} className="flex gap-3 text-[13.5px]">
                <span className="w-20 shrink-0 text-muted-foreground tabular-nums">{item.date ? formatShortDate(item.date, today) : "—"}</span>
                <span className="text-foreground">{item.text}</span>
              </li>
            ))}
          </ul>
        </div>
      )
    case "fields":
      return (
        <dl className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
          {part.items.map((item, index) => (
            <div key={index} className="min-w-0">
              <dt className="text-xs font-medium text-muted-foreground">{item.label}</dt>
              <dd className="text-[13.5px] leading-6 break-words whitespace-pre-line text-foreground">{item.text}</dd>
            </div>
          ))}
        </dl>
      )
  }
}
