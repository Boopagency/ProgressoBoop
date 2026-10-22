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

// Em linha (não um bloco): um nome longo quebra como texto, com o fundo em cada linha.
const CHIP =
  "mx-px rounded-md bg-brand/10 px-1 py-px font-medium text-brand-ink no-underline box-decoration-clone transition-colors [overflow-wrap:anywhere]"
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
  // O ícone fica sempre junto da primeira palavra (não sobra sozinho no fim da linha).
  const space = mention.label.indexOf(" ")
  const first = space === -1 ? mention.label : mention.label.slice(0, space)
  return (
    <>
      <span className="whitespace-nowrap">
        <Icon className="mr-1 inline size-3.5 -translate-y-px" aria-hidden="true" />
        {first}
      </span>
      {space === -1 ? null : mention.label.slice(space)}
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
