import type { ReactNode } from "react"

import { MentionText } from "@/features/mentions/mention-text"
import { AudioPlayer } from "@/features/voice/audio-player"
import type { MessageAudio } from "@/features/voice/logic"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { MESSAGE_KIND_LABEL } from "@/lib/labels"
import type { MessageKind, Timestamp } from "@/lib/types"
import { cn } from "@/lib/utils"

/** O que o balão precisa da mensagem (do canal do cliente ou da conversa do post/projeto). */
interface BubbleMessage {
  id: string
  kind: MessageKind
  body: string
  author_name: string
  from_team: boolean
  mine: boolean
  created_at: Timestamp
  /** Pedido de ajuste já resolvido pela equipe. */
  resolved?: boolean
  /** Mensagem de voz: o player no lugar do texto. */
  audio?: MessageAudio | null
}

/**
 * Uma mensagem no portal: as do cliente logado à direita, num balão com a cor
 * de destaque, sem foto nem nome; as dos outros à esquerda, com as iniciais e
 * o nome; os avisos do sistema no meio. No celular, como nos aplicativos de
 * conversa: o nome e a hora dentro do balão e o "rabinho" na primeira de cada
 * sequência.
 */
export function PortalMessageBubble({
  message,
  time,
  continued = false,
  oneToOne = false,
  mentionHref = (path) => path,
  children,
}: {
  message: BubbleMessage
  /** Hora (ou dia e hora) já formatada. */
  time: string
  /** Continua a mensagem anterior da mesma pessoa: sem nome nem foto de novo. */
  continued?: boolean
  /** Conversa a dois: no celular, sem a foto e o nome da outra pessoa em cada balão. */
  oneToOne?: boolean
  /** Endereço das menções (posts e projetos) no portal, com o cliente escolhido. */
  mentionHref?: (path: string) => string
  /** Dentro do balão, depois do texto (ex.: o post ou projeto de que fala). */
  children?: ReactNode
}) {
  if (message.kind === "system") {
    return (
      <li className={cn("flex justify-center px-4 text-center", continued ? "pt-1" : "pt-3")}>
        <p className="max-w-[85%] text-[12px] leading-5 text-muted-foreground max-md:rounded-lg max-md:bg-card/80 max-md:px-2.5 max-md:py-1 max-md:shadow-xs">
          <span className="italic">{message.body}</span>
          <time dateTime={message.created_at} className="ml-1.5 text-[11px] tabular-nums">
            {time}
          </time>
        </p>
      </li>
    )
  }

  const { mine } = message
  return (
    <li className={cn("flex gap-2 px-4 max-md:gap-1.5 max-md:px-3", mine && "justify-end", continued ? "pt-1 max-md:pt-0.5" : "pt-3 max-md:pt-2")}>
      {mine ? null : (
        <div className={cn("w-7 shrink-0", oneToOne && "max-md:hidden")}>
          {continued ? null : (
            <PersonAvatar
              name={message.author_name}
              colorIndex={message.from_team ? 0 : 2}
              className="mt-4 size-7 max-md:mt-0 [&_[data-slot=avatar-fallback]]:text-[11px]"
            />
          )}
        </div>
      )}
      <div className={cn("flex min-w-0 max-w-[85%] flex-col", mine ? "items-end" : "items-start")}>
        {continued ? null : (
          <p className="mb-0.5 text-[11px] text-muted-foreground max-md:hidden">
            {mine ? null : (
              <>
                <span className="font-medium text-foreground">{message.author_name}</span>
                {message.from_team ? " · Boop" : ""} ·{" "}
              </>
            )}
            <time dateTime={message.created_at} className="tabular-nums">
              {time}
            </time>
          </p>
        )}
        <div
          className={cn(
            "max-w-full rounded-2xl px-3 py-2 text-sm leading-5 break-words whitespace-pre-line text-foreground",
            mine ? "rounded-tr-md bg-brand-soft" : "rounded-tl-md bg-muted max-md:bg-card",
            "max-md:relative max-md:flow-root max-md:px-2.5 max-md:pt-1 max-md:pb-1.5 max-md:text-[15px] max-md:leading-[1.4] max-md:shadow-[0_1px_0.5px_rgb(0_0_0/0.12)]",
            // O "rabinho" da primeira mensagem de cada sequência, para o lado de quem escreveu.
            !continued && "max-md:before:absolute max-md:before:top-0 max-md:before:h-2.5 max-md:before:w-2 max-md:before:bg-inherit",
            !continued && mine && "max-md:rounded-tr-none max-md:before:-right-2 max-md:before:[clip-path:polygon(0_0,100%_0,0_100%)]",
            !continued && !mine && "max-md:rounded-tl-none max-md:before:-left-2 max-md:before:[clip-path:polygon(0_0,100%_0,100%_100%)]"
          )}
        >
          {continued || mine || oneToOne ? null : (
            <span className="block text-[12.5px] leading-5 font-semibold md:hidden">
              {message.author_name}
              {message.from_team ? <span className="font-normal text-muted-foreground"> · Boop</span> : null}
            </span>
          )}
          {message.kind === "change_request" || message.kind === "approval" ? (
            <span
              className={cn(
                "mb-1 block text-[11px] font-semibold",
                message.kind === "approval" ? "text-success-ink" : "text-warning-ink"
              )}
            >
              {MESSAGE_KIND_LABEL[message.kind]}
              {message.kind === "change_request" && message.resolved ? " · resolvido" : ""}
            </span>
          ) : null}
          {message.audio ? (
            <AudioPlayer messageId={message.id} durationMs={message.audio.duration_ms} mine={mine} />
          ) : (
            <MentionText text={message.body} portalHref={mentionHref} />
          )}
          {/* No celular, a hora fica dentro do balão, no canto. */}
          <time
            dateTime={message.created_at}
            className="float-right mt-[7px] -mb-1 ml-2.5 text-[11px] leading-4 whitespace-nowrap text-muted-foreground tabular-nums md:hidden"
          >
            {time}
          </time>
          {children}
        </div>
      </div>
    </li>
  )
}
