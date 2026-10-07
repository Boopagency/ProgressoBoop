"use client"

import { Plus } from "lucide-react"
import Link from "next/link"
import { usePathname } from "next/navigation"
import { createContext, use, useMemo, useState, type ReactNode } from "react"

import { PageContainer, PageHeader } from "@/components/layout/page"
import { Button } from "@/components/ui/button"
import { FinanceDialog, type FinanceDialogState } from "@/features/finance/finance-dialog"
import type { FinanceItem } from "@/features/finance/logic"
import { useUrlTrigger } from "@/hooks/use-url-trigger"
import type { FinanceRecurrence } from "@/lib/types"
import { cn } from "@/lib/utils"

/** Abas do financeiro, na ordem do uso: o mês, a análise e a rotina de controle. */
export const FINANCE_TABS = [
  { href: "/financeiro", label: "Mês" },
  { href: "/financeiro/dre", label: "DRE" },
  { href: "/financeiro/projecao", label: "Projeção" },
  { href: "/financeiro/contratos", label: "Contratos e custos" },
  { href: "/financeiro/lancamentos", label: "Lançamentos" },
  { href: "/financeiro/fechamento", label: "Fechamento" },
  { href: "/financeiro/parametros", label: "Parâmetros" },
] as const

interface FinanceDialogApi {
  openNew: (defaults?: FinanceDialogState["defaults"]) => void
  openItem: (item: FinanceItem) => void
  openRecurrence: (recurrence: FinanceRecurrence) => void
}

const FinanceDialogContext = createContext<FinanceDialogApi | null>(null)

/** Abre o lançamento (novo, do mês ou a recorrência) de qualquer aba. */
export function useFinanceDialog(): FinanceDialogApi {
  const context = use(FinanceDialogContext)
  if (!context) throw new Error("useFinanceDialog precisa estar dentro de FinanceShell.")
  return context
}

/** Moldura do financeiro: título, botão de lançar, abas e o formulário. */
export function FinanceShell({ children }: { children: ReactNode }) {
  const pathname = usePathname()
  const [dialog, setDialog] = useState<FinanceDialogState>({ open: false, key: 0 })
  useUrlTrigger(() => setDialog((current) => ({ open: true, key: current.key + 1 })))

  const api = useMemo<FinanceDialogApi>(
    () => ({
      openNew: (defaults) => setDialog((current) => ({ open: true, key: current.key + 1, defaults })),
      openItem: (item) => setDialog((current) => ({ open: true, key: current.key + 1, item })),
      openRecurrence: (recurrence) => setDialog((current) => ({ open: true, key: current.key + 1, recurrence })),
    }),
    []
  )

  return (
    <FinanceDialogContext value={api}>
      <PageContainer className="max-w-[1240px]">
        <PageHeader
          title="Financeiro"
          description="Caixa, resultado e contratos da Boop, com a mesma lógica da planilha"
          actions={
            <Button onClick={() => api.openNew()} className="gap-1.5">
              <Plus />
              Novo lançamento
            </Button>
          }
        />
        <nav aria-label="Seções do financeiro" className="-mx-4 mt-6 overflow-x-auto border-b px-4 sm:mx-0 sm:px-0">
          <ul className="flex min-w-max gap-1">
            {FINANCE_TABS.map((tab) => {
              const active = tab.href === "/financeiro" ? pathname === tab.href : pathname.startsWith(tab.href)
              return (
                <li key={tab.href}>
                  <Link
                    href={tab.href}
                    aria-current={active ? "page" : undefined}
                    className={cn(
                      "relative inline-flex h-9 items-center px-2.5 text-[13px] font-medium whitespace-nowrap text-muted-foreground transition-colors outline-none hover:text-foreground focus-visible:text-foreground",
                      active && "text-foreground after:absolute after:inset-x-2 after:-bottom-px after:h-0.5 after:rounded-full after:bg-brand"
                    )}
                  >
                    {tab.label}
                  </Link>
                </li>
              )
            })}
          </ul>
        </nav>
        <div className="pt-6">{children}</div>
      </PageContainer>
      <FinanceDialog state={dialog} onOpenChange={(open) => setDialog((current) => ({ ...current, open }))} />
    </FinanceDialogContext>
  )
}
