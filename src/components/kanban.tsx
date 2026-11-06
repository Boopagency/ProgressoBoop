"use client"

import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentProps,
  type CSSProperties,
  type DragEvent,
  type ReactNode,
  type RefObject,
} from "react"

import { CountUp } from "@/components/count-up"
import { cn } from "@/lib/utils"

/*
 * Peças dos quadros: colunas com a lista rolando por dentro (rolagem
 * discreta, sem a barra grossa do sistema), cartões compactos e, quando a
 * tela pede, colunas recolhidas numa faixa estreita com a contagem. Arrastar
 * e soltar é o nativo do HTML (sem biblioteca).
 *
 * Movimento (tudo some com "reduzir movimento"):
 * - entrada: as colunas sobem uma a uma e os cartões em cascata (CSS, pelo
 *   `data-kanban-intro` do quadro nos primeiros instantes);
 * - depois: a coluna que abre se desdobra, a faixa que recolhe aparece de
 *   lado e os cartões novos (filtros) surgem (Web Animations, ao montar);
 * - arrastar: o cartão sai inclinado, o lugar dele fica marcado e a coluna
 *   de destino "respira"; ao soltar, o cartão voa do ponto onde foi solto até
 *   o lugar dele e acende um anel azul;
 * - o cartão tem um brilho que segue o mouse e os números contam.
 */

const REDUCED_MOTION = "(prefers-reduced-motion: reduce)"
const GLIDE = "cubic-bezier(0.16, 1, 0.3, 1)"
/** Duração da entrada (o CSS da entrada termina antes disso). */
const INTRO_MS = 1600

function reducedMotion(): boolean {
  return window.matchMedia(REDUCED_MOTION).matches
}

/** O quadro ainda está na entrada? (lido no DOM, ao montar) */
function inIntro(element: HTMLElement): boolean | null {
  const board = element.closest<HTMLElement>("[data-kanban-intro]")
  return board ? board.dataset.kanbanIntro === "true" : null
}

/**
 * O cartão que acabou de ser solto: de onde foi pego (o ponto dentro do
 * cartão) e onde foi solto. O cartão que monta com esse id logo depois (na
 * coluna nova, ou de volta se a mudança falhar) voa de lá.
 */
const flight = { id: "", grabX: 0, grabY: 0, dropX: 0, dropY: 0, at: 0 }

/** Acende o anel azul de "chegou aqui" (CSS em `[data-kanban-landed]`). */
function flashLanded(element: HTMLElement) {
  element.removeAttribute("data-kanban-landed")
  void element.offsetWidth
  element.setAttribute("data-kanban-landed", "")
  window.setTimeout(() => element.removeAttribute("data-kanban-landed"), 1200)
}

/** As colunas lado a lado, com rolagem lateral (no celular, de coluna em coluna). */
export function KanbanBoard({ className, ...props }: ComponentProps<"div">) {
  const [intro, setIntro] = useState(true)
  useEffect(() => {
    const timer = window.setTimeout(() => setIntro(false), INTRO_MS)
    return () => window.clearTimeout(timer)
  }, [])
  return (
    <div
      data-kanban-intro={intro ? "true" : "false"}
      className={cn(
        "scrollbar-soft -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:px-0 lg:snap-none",
        className
      )}
      {...props}
    />
  )
}

/**
 * Altura do quadro nas telas em que ele vem abaixo de outros blocos (Tarefas,
 * Conteúdo): ao rolar até ele, o quadro ocupa a janela e as colunas rolam por
 * dentro. O Comercial encaixa o quadro no resto da janela, sem rolar a página.
 */
export const KANBAN_SCREEN_HEIGHT = "md:h-[calc(100svh-9.5rem)] md:min-h-[28rem]"

type DropHandlers = Pick<ComponentProps<"section">, "onDragOver" | "onDragLeave" | "onDrop">

/**
 * Áreas que recebem um cartão arrastado (do tipo `dragType`): `dropTarget(chave)`
 * devolve os eventos da área e `over` diz sobre qual o cartão está.
 */
export function useKanbanDrop<K extends string>(dragType: string, onDrop: (id: string, target: K) => void) {
  const [over, setOver] = useState<K | null>(null)
  function dropTarget(target: K): DropHandlers {
    return {
      onDragOver(event: DragEvent<HTMLElement>) {
        if (!event.dataTransfer.types.includes(dragType)) return
        event.preventDefault()
        event.dataTransfer.dropEffect = "move"
        setOver(target)
      },
      onDragLeave(event: DragEvent<HTMLElement>) {
        if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOver(null)
      },
      onDrop(event: DragEvent<HTMLElement>) {
        event.preventDefault()
        setOver(null)
        const id = event.dataTransfer.getData(dragType)
        if (!id) return
        Object.assign(flight, { id, dropX: event.clientX, dropY: event.clientY, at: performance.now() })
        onDrop(id, target)
      },
    }
  }
  return { over, dropTarget }
}

/** Contorno do cartão do quadro (o conteúdo é de cada tela). */
export const KANBAN_CARD =
  "kanban-card cursor-grab rounded-2xl border border-glass-edge bg-board-card shadow-[inset_0_1px_0_var(--glass-highlight),0_1px_3px_rgb(15_29_43/0.08),0_6px_16px_-10px_rgb(15_29_43/0.18)] transition-[border-color,box-shadow,translate,opacity,scale] duration-150 ease-glide hover:border-glow/40 hover:shadow-[inset_0_1px_0_var(--glass-highlight),0_14px_30px_-18px_var(--glow)] active:cursor-grabbing motion-safe:hover:-translate-y-px"

/**
 * Cartão do quadro: arrastável (sai inclinado e pousa voando no lugar novo),
 * com o brilho que segue o mouse e a entrada em cascata. `index` é a posição
 * na coluna (para a cascata).
 */
export function KanbanCard({
  id,
  dragType,
  index = 0,
  draggable = true,
  className,
  children,
}: {
  id: string
  dragType: string
  index?: number
  draggable?: boolean
  className?: string
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    const element = ref.current
    if (!element || reducedMotion()) return
    const animations: Animation[] = []
    let timer = 0
    // Acabou de ser solto aqui: voa do ponto onde foi solto até o lugar dele.
    if (flight.id === id && performance.now() - flight.at < 1500) {
      element.scrollIntoView({ block: "nearest", inline: "nearest" })
      const rect = element.getBoundingClientRect()
      const dx = flight.dropX - flight.grabX - rect.left
      const dy = flight.dropY - flight.grabY - rect.top
      animations.push(
        element.animate(
          [
            { transform: `translate(${dx}px, ${dy}px) rotate(2.5deg) scale(1.03)`, opacity: 0.85 },
            { transform: "none", opacity: 1 },
          ],
          { duration: 560, easing: GLIDE }
        )
      )
      timer = window.setTimeout(() => flashLanded(element), 360)
    } else if (inIntro(element) === false) {
      // Cartão que aparece depois da entrada (filtro, coluna aberta): surge de leve.
      animations.push(
        element.animate(
          [
            { opacity: 0, transform: "translateY(8px) scale(0.98)" },
            { opacity: 1, transform: "none" },
          ],
          { duration: 320, delay: Math.min(index, 8) * 35, easing: GLIDE, fill: "backwards" }
        )
      )
    }
    return () => {
      window.clearTimeout(timer)
      for (const animation of animations) animation.cancel()
    }
    // Só ao montar: a posição muda sem animar de novo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  function onDragStart(event: DragEvent<HTMLDivElement>) {
    const card = event.currentTarget
    const rect = card.getBoundingClientRect()
    flight.grabX = event.clientX - rect.left
    flight.grabY = event.clientY - rect.top
    event.dataTransfer.setData(dragType, id)
    event.dataTransfer.effectAllowed = "move"
    if (!reducedMotion()) {
      // A imagem do arraste: uma cópia inclinada, com sombra (some no próximo instante).
      const holder = document.createElement("div")
      holder.setAttribute("aria-hidden", "true")
      holder.style.cssText = "position:fixed;top:0;left:-10000px;padding:24px;pointer-events:none"
      const ghost = card.cloneNode(true) as HTMLElement
      ghost.style.width = `${rect.width}px`
      ghost.style.transform = "rotate(2.5deg) scale(1.03)"
      ghost.style.boxShadow = "var(--shadow-float)"
      holder.appendChild(ghost)
      document.body.appendChild(holder)
      event.dataTransfer.setDragImage(holder, flight.grabX + 24, flight.grabY + 24)
      window.setTimeout(() => holder.remove(), 0)
    }
    // Depois da foto do arraste: o lugar do cartão fica marcado.
    requestAnimationFrame(() => card.setAttribute("data-dragging", ""))
  }

  return (
    <div
      ref={ref}
      role="listitem"
      draggable={draggable}
      onDragStart={draggable ? onDragStart : undefined}
      onDragEnd={(event) => event.currentTarget.removeAttribute("data-dragging")}
      onPointerMove={(event) => {
        const rect = event.currentTarget.getBoundingClientRect()
        event.currentTarget.style.setProperty("--spot-x", `${event.clientX - rect.left}px`)
        event.currentTarget.style.setProperty("--spot-y", `${event.clientY - rect.top}px`)
      }}
      style={{ "--i": Math.min(index, 7) } as CSSProperties}
      className={cn(KANBAN_CARD, !draggable && "cursor-pointer", className)}
    >
      {children}
    </div>
  )
}

/** Entrada de coluna e faixa que aparecem depois da entrada do quadro. */
function useLaterEntrance(ref: RefObject<HTMLElement | null>, keyframes: Keyframe[], duration: number) {
  useLayoutEffect(() => {
    const element = ref.current
    if (!element || reducedMotion() || inIntro(element) !== false) return
    const animation = element.animate(keyframes, { duration, easing: GLIDE })
    return () => animation.cancel()
    // Só ao montar.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}

/**
 * Fundo da coluna: rebaixado em relação ao painel (`--board`), para o cartão
 * sólido e mais claro (`--board-card`) se separar dele, nos dois temas.
 */
const COLUMN =
  "rounded-3xl border border-glass-edge bg-board shadow-[inset_0_1px_0_var(--glass-highlight)] transition-[border-color,background-color,box-shadow] duration-150"

/** Destaque da coluna quando um cartão passa por cima (e ela "respira"). */
const OVER = "kanban-over border-glow/60 bg-glow-soft shadow-glow"

/**
 * Coluna aberta: cabeçalho fixo e a lista de cartões rolando por dentro, com a
 * largura das colunas da referência (18rem; no celular, quase a tela).
 * `index` é a posição no quadro (para a entrada em sequência).
 */
export function KanbanColumn({
  label,
  header,
  index = 0,
  active = false,
  className,
  children,
  ...handlers
}: {
  label: string
  header: ReactNode
  index?: number
  /** Um cartão está sendo arrastado por cima. */
  active?: boolean
  className?: string
  children: ReactNode
} & DropHandlers) {
  const ref = useRef<HTMLElement>(null)
  // Abrir uma faixa: a coluna se desdobra da esquerda para a direita.
  useLaterEntrance(
    ref,
    [
      { clipPath: "inset(0 100% 0 0 round 24px)", opacity: 0.3 },
      { clipPath: "inset(0 0 0 0 round 24px)", opacity: 1 },
    ],
    520
  )
  return (
    <section
      ref={ref}
      aria-label={label}
      {...handlers}
      style={{ "--col": index } as CSSProperties}
      className={cn(COLUMN, "kanban-column flex min-h-0 w-[86%] shrink-0 snap-start flex-col sm:w-[18rem]", active && OVER, className)}
    >
      {header}
      <div
        role="list"
        className="scrollbar-soft flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-2 pb-2 [&>*]:shrink-0"
      >
        {children}
      </div>
    </section>
  )
}

/** Cabeçalho da coluna: ponto da etapa, nome, contagem e a dica abaixo (ex.: o valor). */
export function KanbanColumnHeader({
  dot,
  title,
  count,
  hint,
  action,
}: {
  dot: ReactNode
  title: string
  count: number
  hint?: ReactNode
  /** Botão no canto (ex.: recolher). */
  action?: ReactNode
}) {
  return (
    <header className="relative flex flex-col items-center px-10 pt-3.5 pb-2.5 text-center">
      <div className="flex max-w-full items-center gap-2">
        {dot}
        <h2 className="truncate text-[14px] leading-6 font-semibold text-foreground">{title}</h2>
        <CountUp value={count} className="text-[14px] font-normal text-muted-foreground" />
      </div>
      {hint ? <p className="max-w-full truncate text-xs leading-4 text-brand-ink tabular-nums">{hint}</p> : null}
      {action ? <div className="absolute top-2.5 right-2.5">{action}</div> : null}
    </header>
  )
}

/**
 * Coluna recolhida: uma faixa estreita com o ponto, a contagem e o nome na
 * vertical. Clicar abre a coluna; dá para soltar um cartão nela (a faixa dá
 * um pulo e acende quando recebe um).
 */
export function KanbanRail({
  label,
  dot,
  count,
  badge,
  index = 0,
  onExpand,
  active = false,
  ...handlers
}: {
  label: string
  dot: ReactNode
  count: number
  /** Marca abaixo da contagem (ex.: quantos pedem atenção). */
  badge?: ReactNode
  index?: number
  onExpand: () => void
  active?: boolean
} & DropHandlers) {
  const ref = useRef<HTMLElement>(null)
  const previous = useRef(count)
  // Recolher: a faixa aparece de lado.
  useLaterEntrance(
    ref,
    [
      { transform: "scaleX(0.4)", opacity: 0, transformOrigin: "left center" },
      { transform: "none", opacity: 1, transformOrigin: "left center" },
    ],
    360
  )
  useEffect(() => {
    const element = ref.current
    const grew = count > previous.current
    previous.current = count
    if (!element || !grew || reducedMotion()) return
    element.animate([{ transform: "scale(1)" }, { transform: "scale(1.08)" }, { transform: "scale(1)" }], { duration: 420, easing: GLIDE })
    flashLanded(element)
  }, [count])
  return (
    <section
      ref={ref}
      aria-label={label}
      {...handlers}
      style={{ "--col": index } as CSSProperties}
      className={cn(COLUMN, "kanban-column relative flex w-12 shrink-0 snap-start flex-col", active && OVER)}
    >
      <button
        type="button"
        onClick={onExpand}
        aria-expanded={false}
        aria-label={`Mostrar ${label} (${count})`}
        title={`Mostrar ${label}`}
        className="group/rail flex flex-1 flex-col items-center gap-2.5 rounded-[inherit] px-1 pt-4 pb-4 outline-none transition-colors hover:bg-accent focus-visible:ring-2 focus-visible:ring-ring/40"
      >
        {dot}
        <CountUp value={count} className="text-[13px] font-medium text-muted-foreground" />
        {badge}
        <span className="mt-1 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors [writing-mode:vertical-rl] group-hover/rail:text-foreground">
          {label}
        </span>
      </button>
    </section>
  )
}

/** Coluna sem cartões: o lugar para soltar. */
export function KanbanEmpty({ children }: { children: ReactNode }) {
  return (
    <p className="flex min-h-28 flex-1 items-center justify-center rounded-2xl border border-dashed border-foreground/12 px-4 py-8 text-center text-[13px] text-subtle-foreground">
      {children}
    </p>
  )
}
