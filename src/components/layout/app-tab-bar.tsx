"use client"

import { Menu, Search } from "lucide-react"
import { usePathname } from "next/navigation"
import { useState } from "react"

import { MoreSheet, MoreSheetAccount, MoreSheetItem, MoreSheetSection, MoreSheetSignOut, MoreSheetTheme } from "@/components/layout/more-sheet"
import { CLAUDE_NAV_ITEM, isActivePath, NAV_GROUPS, NAV_ITEMS } from "@/components/layout/nav-items"
import { TabBar, TabBarItem } from "@/components/layout/tab-bar"
import { AccountDialog } from "@/features/account/account-dialog"
import { useUnread } from "@/features/channels/unread-provider"
import { ClaudePanel } from "@/features/mcp/claude-panel"
import { useCommandPalette } from "@/features/search/command-palette"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"

/** Telas do menu de baixo; o resto do menu fica em "Mais". */
const TAB_HREFS = ["/hoje", "/tarefas", "/conteudo", "/comunicacoes"]
const TABS = NAV_ITEMS.filter((item) => TAB_HREFS.includes(item.href))

/**
 * Menu de baixo do admin no celular: Hoje (com os pedidos de ajuste
 * pendentes), Tarefas, Conteúdo, Comunicações (com as não lidas) e Mais, que
 * abre uma folha com o resto do menu, a busca, o Claude, a conta e o tema.
 */
export function AppTabBar() {
  const pathname = usePathname()
  const { unread, pending } = useUnread()
  const { currentUser, profiles } = useWorkspace()
  const { openPalette } = useCommandPalette()
  const [moreOpen, setMoreOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const [claudeOpen, setClaudeOpen] = useState(false)
  const colorIndex = profiles.findIndex((profile) => profile.id === currentUser.id)
  const inMore = !TABS.some((item) => isActivePath(pathname, item.href))
  const groups = NAV_GROUPS.map((group) => ({ ...group, items: group.items.filter((item) => !TAB_HREFS.includes(item.href)) })).filter(
    (group) => group.items.length > 0
  )

  // Fecha a folha e, depois da animação, abre o que foi pedido nela.
  function closeThen(next?: () => void) {
    setMoreOpen(false)
    if (next) window.setTimeout(next, 150)
  }

  return (
    <>
      <TabBar label="Menu">
        {TABS.map((item) => {
          const count = item.href === "/comunicacoes" ? unread : item.href === "/hoje" ? pending : 0
          return (
            <TabBarItem
              key={item.href}
              href={item.href}
              title={item.title}
              icon={item.icon}
              active={isActivePath(pathname, item.href)}
              count={count}
              countLabel={
                item.href === "/comunicacoes"
                  ? `${unread} ${unread === 1 ? "mensagem não lida" : "mensagens não lidas"}`
                  : `${pending} ${pending === 1 ? "pedido de ajuste pendente" : "pedidos de ajuste pendentes"}`
              }
            />
          )
        })}
        <TabBarItem title="Mais" icon={Menu} active={inMore || moreOpen} onClick={() => setMoreOpen(true)} />
      </TabBar>

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} description="O resto do menu, a busca, a conta e o tema.">
        <MoreSheetAccount
          avatar={
            <PersonAvatar name={currentUser.full_name} avatarUrl={currentUser.avatar_url} colorIndex={colorIndex} className="size-10" />
          }
          name={currentUser.full_name}
          email={currentUser.email}
          onOpenAccount={() => closeThen(() => setAccountOpen(true))}
        />
        <MoreSheetSection>
          <MoreSheetItem title="Buscar" icon={Search} onClick={() => closeThen(openPalette)} />
          <MoreSheetItem title={CLAUDE_NAV_ITEM.title} icon={CLAUDE_NAV_ITEM.icon} onClick={() => closeThen(() => setClaudeOpen(true))} />
        </MoreSheetSection>
        {groups.map((group) => (
          <MoreSheetSection key={group.label ?? "principal"} label={group.label}>
            {group.items.map((item) => (
              <MoreSheetItem
                key={item.href}
                href={item.href}
                title={item.title}
                icon={item.icon}
                active={isActivePath(pathname, item.href)}
                onClick={() => closeThen()}
              />
            ))}
          </MoreSheetSection>
        ))}
        <MoreSheetTheme />
        <MoreSheetSignOut />
      </MoreSheet>

      <AccountDialog
        open={accountOpen}
        onOpenChange={setAccountOpen}
        user={{ name: currentUser.full_name, email: currentUser.email, avatarUrl: currentUser.avatar_url }}
        colorIndex={colorIndex}
      />
      <ClaudePanel open={claudeOpen} onOpenChange={setClaudeOpen} />
    </>
  )
}
