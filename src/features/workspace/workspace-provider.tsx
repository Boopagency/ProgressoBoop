"use client"

import { createContext, use, useMemo, type ReactNode } from "react"

import type { Workspace } from "@/features/workspace/queries"
import type { Client, Profile, Project, SessionUser } from "@/lib/types"

interface WorkspaceContextValue extends Workspace {
  currentUser: SessionUser
  profileById: Map<string, Profile>
  clientById: Map<string, Client>
  projectById: Map<string, Project>
}

const WorkspaceContext = createContext<WorkspaceContextValue | null>(null)

/**
 * Equipe, clientes, projetos, visões salvas e usuário logado, disponíveis
 * para toda a área autenticada.
 */
export function WorkspaceProvider({
  workspace,
  currentUser,
  children,
}: {
  workspace: Workspace
  currentUser: SessionUser
  children: ReactNode
}) {
  const value = useMemo<WorkspaceContextValue>(
    () => ({
      ...workspace,
      currentUser,
      profileById: new Map(workspace.profiles.map((profile) => [profile.id, profile])),
      clientById: new Map(workspace.clients.map((client) => [client.id, client])),
      projectById: new Map(workspace.projects.map((project) => [project.id, project])),
    }),
    [workspace, currentUser]
  )

  return <WorkspaceContext value={value}>{children}</WorkspaceContext>
}

export function useWorkspace(): WorkspaceContextValue {
  const context = use(WorkspaceContext)
  if (!context) throw new Error("useWorkspace precisa estar dentro de WorkspaceProvider.")
  return context
}
