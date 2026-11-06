"use client"

import { useState, type ComponentProps, type DragEvent, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/*
 * Peças dos quadros: colunas largas com a lista rolando por dentro (rolagem
 * discreta, sem a barra grossa do sistema), cartões grandes e, quando a tela
 * pede, colunas recolhidas numa faixa estreita com a contagem. Arrastar e
 * soltar é o nativo do HTML (sem biblioteca).
 */

/** As colunas lado a lado, com rolagem lateral (no celular, de coluna em coluna). */
export function KanbanBoard({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
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
        if (id) onDrop(id, target)
      },
    }
  }
  return { over, dropTarget }
}

/** Eventos de um cartão que pode ser arrastado. */
export function dragSource(dragType: string, id: string): Pick<ComponentProps<"div">, "draggable" | "onDragStart"> {
  return {
    draggable: true,
    onDragStart(event) {
      event.dataTransfer.setData(dragType, id)
      event.dataTransfer.effectAllowed = "move"
    },
  }
}

/** Contorno do cartão do quadro (o conteúdo é de cada tela). */
export const KANBAN_CARD =
  "cursor-grab rounded-2xl border border-glass-edge bg-board-card shadow-[inset_0_1px_0_var(--glass-highlight),0_1px_3px_rgb(15_29_43/0.08),0_6px_16px_-10px_rgb(15_29_43/0.18)] transition-[border-color,box-shadow,translate] duration-150 ease-glide hover:border-glow/40 hover:shadow-[inset_0_1px_0_var(--glass-highlight),0_14px_30px_-18px_var(--glow)] active:cursor-grabbing motion-safe:hover:-translate-y-px"

/**
 * Fundo da coluna: rebaixado em relação ao painel (`--board`), para o cartão
 * sólido e mais claro (`--board-card`) se separar dele, nos dois temas.
 */
const COLUMN =
  "rounded-3xl border border-glass-edge bg-board shadow-[inset_0_1px_0_var(--glass-highlight)] transition-[border-color,background-color,box-shadow] duration-150"

/** Destaque da coluna quando um cartão passa por cima. */
const OVER = "border-glow/60 bg-glow-soft shadow-glow"

/**
 * Coluna aberta: cabeçalho fixo e a lista de cartões rolando por dentro. No
 * computador, as colunas dividem a largura (de 18,5rem a 26rem cada); no
 * celular, cada uma ocupa quase a tela.
 */
export function KanbanColumn({
  label,
  header,
  active = false,
  className,
  children,
  ...handlers
}: {
  label: string
  header: ReactNode
  /** Um cartão está sendo arrastado por cima. */
  active?: boolean
  className?: string
  children: ReactNode
} & DropHandlers) {
  return (
    <section
      aria-label={label}
      {...handlers}
      className={cn(
        COLUMN,
        "flex min-h-0 w-[86%] shrink-0 snap-start flex-col sm:w-[18.5rem] lg:w-auto lg:max-w-[26rem] lg:min-w-[18.5rem] lg:flex-1 lg:basis-0",
        active && OVER,
        className
      )}
    >
      {header}
      <div
        role="list"
        className="scrollbar-soft flex min-h-0 flex-1 flex-col gap-2.5 overflow-y-auto px-2.5 pb-2.5 [&>*]:shrink-0"
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
    <header className="relative flex flex-col items-center px-11 pt-4 pb-3 text-center">
      <div className="flex max-w-full items-center gap-2">
        {dot}
        <h2 className="truncate text-[15px] leading-6 font-semibold text-foreground">{title}</h2>
        <span className="display-number text-[22px] leading-none text-muted-foreground">{count}</span>
      </div>
      <p className="min-h-4 max-w-full truncate text-xs leading-4 text-brand-ink tabular-nums">{hint}</p>
      {action ? <div className="absolute top-3 right-3">{action}</div> : null}
    </header>
  )
}

/**
 * Coluna recolhida: uma faixa estreita com o ponto, a contagem e o nome na
 * vertical. Clicar abre a coluna; dá para soltar um cartão nela.
 */
export function KanbanRail({
  label,
  dot,
  count,
  badge,
  onExpand,
  active = false,
  ...handlers
}: {
  label: string
  dot: ReactNode
  count: number
  /** Marca abaixo da contagem (ex.: quantos pedem atenção). */
  badge?: ReactNode
  onExpand: () => void
  active?: boolean
} & DropHandlers) {
  return (
    <section
      aria-label={label}
      {...handlers}
      className={cn(
        COLUMN,
        "flex w-12 shrink-0 snap-start flex-col",
        active && OVER
      )}
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
        <span className="display-number text-[22px] leading-none text-foreground">{count}</span>
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
