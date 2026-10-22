"use client"

import {
  Bell,
  Building2,
  Check,
  FileText,
  FolderKanban,
  HeartHandshake,
  House,
  Megaphone,
  Menu,
  MessagesSquare,
} from "lucide-react"
import { usePathname, useSearchParams } from "next/navigation"
import { useState } from "react"

import { MoreSheet, MoreSheetAccount, MoreSheetItem, MoreSheetSection, MoreSheetSignOut, MoreSheetTheme } from "@/components/layout/more-sheet"
import { TabBar, TabBarItem } from "@/components/layout/tab-bar"
import { AccountDialog, type AccountDialogUser } from "@/features/account/account-dialog"
import { portalHref, selectedClient } from "@/features/portal/links"
import { usePortalAlerts } from "@/features/portal/portal-alerts"
import { isPortalDetail, PORTAL_CONTENT_HREFS, portalSectionOf } from "@/features/portal/portal-nav"
import type { PortalClient } from "@/features/portal/session"
import { PersonAvatar } from "@/features/workspace/person-avatar"

/**
 * Menu de baixo do portal no celular: Início, Conteúdo (calendário e feed),
 * Comunicação e Notificações, com as não lidas, e Mais (projetos,
 * documentos, indicar, a troca de cliente, a conta e o tema).
 */
export function PortalTabBar({ user, clients }: { user: AccountDialogUser; clients: readonly PortalClient[] }) {
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const client = selectedClient(clients, searchParams.get("cliente"))
  const section = portalSectionOf(pathname)?.href ?? null
  const { counts } = usePortalAlerts()
  const [moreOpen, setMoreOpen] = useState(false)
  const [accountOpen, setAccountOpen] = useState(false)
  const href = (path: string) => (client ? portalHref(path, client, clients) : path)
  const inMore = section === "/portal/projetos" || section === "/portal/documentos" || section === "/portal/indicar"
  // Na troca de cliente, um post ou projeto aberto volta para a seção (o item é do cliente anterior).
  const switchTarget = isPortalDetail(pathname) ? (section ?? "/portal") : pathname

  function closeThen(next?: () => void) {
    setMoreOpen(false)
    if (next) window.setTimeout(next, 150)
  }

  return (
    <>
      <TabBar label="Menu do portal">
        <TabBarItem href={href("/portal")} title="Início" icon={House} active={section === "/portal"} />
        <TabBarItem
          href={href("/portal/calendario")}
          title="Conteúdo"
          icon={Megaphone}
          active={section !== null && PORTAL_CONTENT_HREFS.includes(section)}
        />
        <TabBarItem
          href={href("/portal/comunicacao")}
          title="Comunicação"
          icon={MessagesSquare}
          active={section === "/portal/comunicacao"}
          count={counts.messages}
          countLabel={`${counts.messages} ${counts.messages === 1 ? "mensagem não lida" : "mensagens não lidas"}`}
        />
        <TabBarItem
          href={href("/portal/notificacoes")}
          title="Notificações"
          icon={Bell}
          active={section === "/portal/notificacoes"}
          count={counts.notifications}
          countLabel={`${counts.notifications} ${counts.notifications === 1 ? "aviso não lido" : "avisos não lidos"}`}
        />
        <TabBarItem title="Mais" icon={Menu} active={inMore || moreOpen} onClick={() => setMoreOpen(true)} />
      </TabBar>

      <MoreSheet open={moreOpen} onOpenChange={setMoreOpen} description="Projetos, documentos, indicações, a conta e o tema.">
        <MoreSheetAccount
          avatar={<PersonAvatar name={user.name} avatarUrl={user.avatarUrl} colorIndex={0} className="size-10" />}
          name={user.name}
          email={user.email}
          onOpenAccount={() => closeThen(() => setAccountOpen(true))}
        />
        <MoreSheetSection>
          <MoreSheetItem
            href={href("/portal/projetos")}
            title="Projetos"
            icon={FolderKanban}
            active={section === "/portal/projetos"}
            onClick={() => closeThen()}
          />
          <MoreSheetItem
            href={href("/portal/documentos")}
            title="Documentos"
            icon={FileText}
            active={section === "/portal/documentos"}
            onClick={() => closeThen()}
          />
          <MoreSheetItem
            href={href("/portal/indicar")}
            title="Indicar"
            icon={HeartHandshake}
            active={section === "/portal/indicar"}
            onClick={() => closeThen()}
          />
        </MoreSheetSection>
        {client && clients.length > 1 ? (
          <MoreSheetSection label="Clientes">
            {clients.map((item) => (
              <MoreSheetItem
                key={item.id}
                href={portalHref(switchTarget, item, clients)}
                title={item.name}
                icon={item.id === client.id ? Check : Building2}
                active={item.id === client.id}
                onClick={() => closeThen()}
              />
            ))}
          </MoreSheetSection>
        ) : null}
        <MoreSheetTheme />
        <MoreSheetSignOut />
      </MoreSheet>

      <AccountDialog open={accountOpen} onOpenChange={setAccountOpen} user={user} />
    </>
  )
}
