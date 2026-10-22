"use client"

import { ChevronRight, LogOut, Monitor, Moon, Sun, type LucideIcon } from "lucide-react"
import Link from "next/link"
import { useTransition, type ReactNode } from "react"

import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { signOut } from "@/features/auth/actions"
import { forgetThisDevice } from "@/features/push/browser"
import { useTheme } from "@/hooks/use-theme"
import { THEME_CHOICES, THEME_LABEL, type ThemeChoice } from "@/lib/theme"
import { cn } from "@/lib/utils"

/*
 * "Mais" do menu de baixo do celular (admin e portal): uma folha que sobe de
 * baixo com o resto do menu, a conta, o tema e "Sair". As mesmas linhas
 * servem a outras folhas de ações (ex.: as de uma mensagem).
 */

export function MoreSheet({
  open,
  onOpenChange,
  title = "Mais",
  description,
  children,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title?: string
  description: string
  children: ReactNode
}) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        // Abre com o foco na folha, não na primeira linha (que ficaria destacada ao abrir pelo toque longo).
        onOpenAutoFocus={(event) => {
          event.preventDefault()
          if (event.currentTarget instanceof HTMLElement) event.currentTarget.focus()
        }}
        className="max-h-[88dvh] gap-0 overflow-y-auto overscroll-contain rounded-t-2xl px-3 pt-2 pb-[max(1rem,env(safe-area-inset-bottom))] outline-none md:hidden"
      >
        <SheetHeader className="p-0 px-3 pt-2 pb-1">
          <SheetTitle className="text-base">{title}</SheetTitle>
          <SheetDescription className="sr-only">{description}</SheetDescription>
        </SheetHeader>
        <div className="space-y-4 pt-2">{children}</div>
      </SheetContent>
    </Sheet>
  )
}

export function MoreSheetSection({ label, children }: { label?: string | null; children: ReactNode }) {
  return (
    <section>
      {label ? <h3 className="px-3 pb-1 text-xs font-medium text-muted-foreground">{label}</h3> : null}
      <ul className="overflow-hidden rounded-xl bg-muted/60">{children}</ul>
    </section>
  )
}

const ROW =
  "flex min-h-12 w-full items-center gap-3 px-3 text-left text-[15px] text-foreground outline-none select-none [-webkit-tap-highlight-color:transparent] focus-visible:bg-accent active:bg-accent"

/** Uma linha da folha: leva a uma tela (`href`) ou faz uma ação (`onClick`). */
export function MoreSheetItem({
  title,
  icon: Icon,
  href,
  onClick,
  active = false,
  detail,
  count = 0,
  destructive = false,
  disabled = false,
}: {
  title: string
  icon?: LucideIcon
  href?: string
  onClick: () => void
  active?: boolean
  /** Texto pequeno à direita (ex.: o cliente escolhido). */
  detail?: string
  count?: number
  /** Apaga ou tira algo (em vermelho). */
  destructive?: boolean
  disabled?: boolean
}) {
  const content = (
    <>
      {Icon ? (
        <Icon
          className={cn("size-5 shrink-0 text-muted-foreground", active && "text-brand-ink", destructive && "text-destructive")}
          aria-hidden="true"
        />
      ) : (
        <span className="size-5 shrink-0" aria-hidden="true" />
      )}
      <span className={cn("min-w-0 flex-1 truncate", active && "font-semibold")}>{title}</span>
      {count > 0 ? (
        <span className="rounded-full bg-brand px-1.5 text-[11px] leading-5 font-semibold text-brand-navy tabular-nums">
          {count > 99 ? "99+" : count}
        </span>
      ) : null}
      {detail ? <span className="max-w-[40%] truncate text-sm text-muted-foreground">{detail}</span> : null}
      {href ? <ChevronRight className="size-4 shrink-0 text-subtle-foreground" aria-hidden="true" /> : null}
    </>
  )
  return (
    <li className="border-b border-border/60 last:border-b-0">
      {href ? (
        <Link href={href} aria-current={active ? "page" : undefined} onClick={onClick} className={ROW}>
          {content}
        </Link>
      ) : (
        <button type="button" onClick={onClick} disabled={disabled} className={cn(ROW, destructive && "text-destructive", "disabled:opacity-50")}>
          {content}
        </button>
      )}
    </li>
  )
}

/** Quem está logado: a foto, o nome e o e-mail; tocar abre Minha conta. */
export function MoreSheetAccount({
  avatar,
  name,
  email,
  onOpenAccount,
}: {
  avatar: ReactNode
  name: string
  email: string
  onOpenAccount: () => void
}) {
  return (
    <button
      type="button"
      onClick={onOpenAccount}
      className="flex w-full items-center gap-3 rounded-xl bg-muted/60 px-3 py-3 text-left outline-none select-none [-webkit-tap-highlight-color:transparent] focus-visible:bg-accent active:bg-accent"
    >
      {avatar}
      <span className="grid min-w-0 flex-1 leading-tight">
        <span className="truncate text-[15px] font-medium text-foreground">{name}</span>
        <span className="truncate text-[13px] text-muted-foreground">{email}</span>
      </span>
      <span className="shrink-0 text-[13px] text-brand-ink">Minha conta</span>
    </button>
  )
}

const THEME_ICON: Record<ThemeChoice, LucideIcon> = { light: Sun, dark: Moon, system: Monitor }

/** Tema: Claro, Escuro ou Sistema, lado a lado. */
export function MoreSheetTheme() {
  const { choice, setChoice } = useTheme()
  return (
    <section>
      <h3 className="px-3 pb-1 text-xs font-medium text-muted-foreground">Tema</h3>
      <div role="radiogroup" aria-label="Tema" className="grid grid-cols-3 gap-1 rounded-xl bg-muted/60 p-1">
        {THEME_CHOICES.map((option) => {
          const Icon = THEME_ICON[option]
          const checked = choice === option
          return (
            <button
              key={option}
              type="button"
              role="radio"
              aria-checked={checked}
              onClick={() => setChoice(option)}
              className={cn(
                "flex h-11 items-center justify-center gap-1.5 rounded-lg text-sm font-medium text-muted-foreground outline-none select-none [-webkit-tap-highlight-color:transparent] focus-visible:ring-2 focus-visible:ring-ring/50",
                checked && "bg-background text-foreground shadow-[0_1px_2px_0_rgb(0_0_0/0.06),0_0_0_1px_rgb(0_0_0/0.04)]"
              )}
            >
              <Icon className={cn("size-4", checked && "text-brand-ink")} aria-hidden="true" />
              {THEME_LABEL[option]}
            </button>
          )
        })}
      </div>
    </section>
  )
}

/** "Sair": esquece este aparelho para os avisos e sai da conta. */
export function MoreSheetSignOut() {
  const [isSigningOut, startSignOut] = useTransition()
  return (
    <MoreSheetSection>
      <MoreSheetItem
        title={isSigningOut ? "Saindo…" : "Sair"}
        icon={LogOut}
        onClick={() => {
          if (isSigningOut) return
          startSignOut(async () => {
            await forgetThisDevice()
            await signOut()
          })
        }}
      />
    </MoreSheetSection>
  )
}
