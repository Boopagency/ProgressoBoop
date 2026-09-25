import Image from "next/image"

import { cn } from "@/lib/utils"

/**
 * Marca oficial da Boop (o "olhar"), o mesmo arquivo do favicon do site.
 * Não redesenhar: para trocar, substitua `public/brand/boop-olhar.svg`.
 */
export function BoopMark({ className }: { className?: string }) {
  return (
    <Image
      src="/brand/boop-olhar.svg"
      alt=""
      width={268}
      height={187}
      loading="eager"
      className={cn("h-auto w-7 shrink-0", className)}
    />
  )
}
