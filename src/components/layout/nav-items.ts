import { CalendarDays, ListTodo, Presentation, Sun, type LucideIcon } from "lucide-react"

export interface NavItem {
  title: string
  href: string
  icon: LucideIcon
}

export const NAV_ITEMS: NavItem[] = [
  { title: "Hoje", href: "/", icon: Sun },
  { title: "Tarefas", href: "/tarefas", icon: ListTodo },
  { title: "Calendário", href: "/calendario", icon: CalendarDays },
  { title: "Segunda", href: "/segunda", icon: Presentation },
]

export function isActivePath(pathname: string, href: string): boolean {
  return href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`)
}
