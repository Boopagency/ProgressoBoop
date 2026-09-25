import { cn } from "@/lib/utils"

/** Marca do Boop Admin: um "b" geométrico. */
export function BoopMark({ className }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 32 32"
      fill="none"
      aria-hidden="true"
      className={cn("size-7 shrink-0", className)}
    >
      <rect width="32" height="32" rx="8" className="fill-primary" />
      <rect x="9" y="7" width="3.4" height="18" rx="1.7" className="fill-primary-foreground" />
      <circle cx="17.2" cy="19.4" r="5.1" strokeWidth="3.4" className="stroke-primary-foreground" />
    </svg>
  )
}
