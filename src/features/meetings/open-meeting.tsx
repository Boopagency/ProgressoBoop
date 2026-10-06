"use client"

import Link from "next/link"
import { useTransition, type ReactNode } from "react"
import { toast } from "sonner"

import { openMeeting } from "@/features/meetings/actions"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

/**
 * Abre uma reunião a partir do evento e do dia. Se ela ainda não tem
 * registro, o servidor cria e navega para a página dela.
 */
export function useOpenMeeting() {
  const [isPending, startTransition] = useTransition()

  function open(eventId: string, date: DateKey) {
    startTransition(async () => {
      const result = await openMeeting(eventId, date)
      if (result && !result.ok) toast.error(result.error)
    })
  }

  return { open, isPending }
}

/**
 * Link para a reunião: direto quando o registro existe; senão, um botão que
 * cria o registro e navega.
 */
export function MeetingLink({
  meetingId,
  eventId,
  date,
  className,
  children,
  "aria-label": ariaLabel,
}: {
  meetingId: string | null
  eventId: string
  date: DateKey
  className?: string
  children: ReactNode
  "aria-label"?: string
}) {
  const { open, isPending } = useOpenMeeting()

  if (meetingId) {
    return (
      <Link href={`/reunioes/${meetingId}`} className={className} aria-label={ariaLabel}>
        {children}
      </Link>
    )
  }

  return (
    <button
      type="button"
      onClick={() => open(eventId, date)}
      disabled={isPending}
      aria-busy={isPending || undefined}
      aria-label={ariaLabel}
      className={cn("text-left disabled:cursor-progress", className)}
    >
      {children}
    </button>
  )
}
