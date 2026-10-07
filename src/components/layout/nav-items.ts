import {
  BookOpen,
  Building2,
  CalendarDays,
  ChartColumn,
  FileChartColumn,
  FolderKanban,
  Gavel,
  Handshake,
  ListTodo,
  MessagesSquare,
  Presentation,
  Sun,
  Target,
  Wallet,
  type LucideIcon,
} from "lucide-react"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
}

export interface NavGroup {
  /** Rótulo do grupo no menu lateral (o primeiro grupo não tem). */
  label: string | null
  items: NavItem[]
}

/** Menu lateral: o dia a dia primeiro, depois clientes (e o funil) e a gestão da Boop. */
export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { title: "Hoje", href: "/hoje", icon: Sun },
      { title: "Tarefas", href: "/tarefas", icon: ListTodo },
      { title: "Projetos", href: "/projetos", icon: FolderKanban },
      { title: "Calendário", href: "/calendario", icon: CalendarDays },
      { title: "Reuniões", href: "/reunioes", icon: Presentation },
    ],
  },
  {
    label: "Relacionamento",
    items: [
      { title: "Comercial", href: "/comercial", icon: Handshake },
      { title: "Clientes", href: "/clientes", icon: Building2 },
      { title: "Comunicações", href: "/comunicacoes", icon: MessagesSquare },
    ],
  },
  {
    label: "Gestão",
    items: [
      { title: "Indicadores", href: "/indicadores", icon: ChartColumn },
      { title: "Metas", href: "/metas", icon: Target },
      { title: "Financeiro", href: "/financeiro", icon: Wallet },
      { title: "Relatórios", href: "/relatorios", icon: FileChartColumn },
      { title: "Decisões", href: "/decisoes", icon: Gavel },
      { title: "Processos", href: "/processos", icon: BookOpen },
    ],
  },
]

export const NAV_ITEMS: NavItem[] = NAV_GROUPS.flatMap((group) => group.items)

export function isActivePath(pathname: string, href: string): boolean {
  return pathname === href || pathname.startsWith(`${href}/`)
}
