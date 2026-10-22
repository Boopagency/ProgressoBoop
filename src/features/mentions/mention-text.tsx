"use client"

import {
  BookOpen,
  Building2,
  CheckCircle2,
  FolderKanban,
  Handshake,
  Lightbulb,
  Megaphone,
  Presentation,
  Wallet,
  type LucideIcon,
} from "lucide-react"
import Link from "next/link"
import { Fragment } from "react"

import { MeetingLink } from "@/features/meetings/open-meeting"
import {
  mentionEvent,
  mentionHref,
  portalMentionPath,
  splitMentions,
  type Mention,
  type MentionKind,
} from "@/features/mentions/logic"
import type { DateKey } from "@/lib/types"
import { cn } from "@/lib/utils"

export const MENTION_ICON: Record<MentionKind, LucideIcon> = {
  post: Megaphone,
  meeting: Presentation,
  event: Presentation,
  task: CheckCircle2,
  project: FolderKanban,
  idea: Lightbulb,
  finance: Wallet,
  deal: Handshake,
  doc: BookOpen,
  client: Building2,
}

const URL_PATTERN = /(https?:\/\/[^\s<]+[^\s<.,;:!?)\]'"])/g

const CHIP =
  "mx-px inline-flex max-w-full items-baseline gap-1 rounded-md bg-brand/10 px-1.5 align-baseline font-medium text-brand-ink no-underline transition-colors [overflow-wrap:anywhere]"
const CHIP_LINK = "hover:bg-brand/20 focus-visible:ring-2 focus-visible:ring-ring/40 focus-visible:outline-none"

/** Texto solto com os links clicáveis. */
function Linkified({ text }: { text: string }) {
  const parts = text.split(URL_PATTERN)
  return (
    <>
      {parts.map((part, index) =>
        index % 2 === 1 ? (
          <a key={index} href={part} target="_blank" rel="noreferrer" className="break-all text-brand-ink underline underline-offset-2">
            {part}
          </a>
        ) : (
          <Fragment key={index}>{part}</Fragment>
        )
      )}
    </>
  )
}

function ChipContent({ mention }: { mention: Mention }) {
  const Icon = MENTION_ICON[mention.kind]
  return (
    <>
      <Icon className="size-3.5 shrink-0 translate-y-0.5" aria-hidden="true" />
      <span>{mention.label}</span>
    </>
  )
}

/** Menção na equipe: link para o item (a reunião sem registro abre pelo evento). */
function TeamMention({ mention }: { mention: Mention }) {
  const href = mentionHref(mention)
  if (href) {
    return (
      <Link href={href} className={cn(CHIP, CHIP_LINK)}>
        <ChipContent mention={mention} />
      </Link>
    )
  }
  const event = mentionEvent(mention)
  if (event) {
    return (
      <MeetingLink meetingId={null} eventId={event.eventId} date={event.date as DateKey} className={cn(CHIP, CHIP_LINK)}>
        <ChipContent mention={mention} />
      </MeetingLink>
    )
  }
  return (
    <span className={CHIP}>
      <ChipContent mention={mention} />
    </span>
  )
}

/** Menção no portal: post e projeto viram link; o resto (ex.: reunião) fica só o nome. */
function PortalMention({ mention, href }: { mention: Mention; href: (path: string) => string }) {
  const path = portalMentionPath(mention)
  return path ? (
    <Link href={href(path)} className={cn(CHIP, CHIP_LINK)}>
      <ChipContent mention={mention} />
    </Link>
  ) : (
    <span className={CHIP}>
      <ChipContent mention={mention} />
    </span>
  )
}

/**
 * Texto de uma mensagem: links clicáveis e as menções (posts, reuniões…)
 * como etiquetas que levam ao item. Sem `portalHref`, é a tela da equipe.
 */
export function MentionText({ text, portalHref }: { text: string; portalHref?: (path: string) => string }) {
  return (
    <>
      {splitMentions(text).map((part, index) =>
        part.type === "text" ? (
          <Linkified key={index} text={part.text} />
        ) : portalHref ? (
          <PortalMention key={index} mention={part.mention} href={portalHref} />
        ) : (
          <TeamMention key={index} mention={part.mention} />
        )
      )}
    </>
  )
}
