"use client"

import { createContext, use, type ReactNode } from "react"

import type { ThreadData } from "@/features/channels/logic"
import type { PostPerformance } from "@/features/instagram/metrics-actions"
import type { AutoPublishContext } from "@/features/instagram/publish-actions"
import type { ActionResult, ActivityEntry, ContentPost } from "@/lib/types"

/**
 * Leituras que a vitrine (`/vitrine`, só em desenvolvimento) troca por dados
 * de exemplo: a conversa do canal, os textos e o histórico do post, a
 * conversa do post, a conta do Instagram e o desempenho. Fora da vitrine não
 * há provedor e cada tela usa a Server Action de sempre; gravar continua
 * indo para o servidor (na vitrine, falha sem sessão).
 */
export interface DemoLoaders {
  loadThread?: (channelId: string, before?: string) => Promise<ActionResult<ThreadData>>
  loadPostThread?: (postId: string, before?: string) => Promise<ActionResult<ThreadData & { channelId: string | null }>>
  loadPost?: (id: string) => Promise<ActionResult<ContentPost>>
  loadActivity?: (type: string, id: string) => Promise<ActionResult<ActivityEntry[]>>
  loadAutoPublishContext?: (clientId: string) => Promise<ActionResult<AutoPublishContext>>
  loadPostPerformance?: (postId: string) => Promise<ActionResult<PostPerformance>>
}

const DemoLoadersContext = createContext<DemoLoaders | null>(null)

export function DemoLoadersProvider({ loaders, children }: { loaders: DemoLoaders; children: ReactNode }) {
  return <DemoLoadersContext value={loaders}>{children}</DemoLoadersContext>
}

/** As leituras de exemplo da vitrine; vazio no app de verdade. */
export function useDemoLoaders(): DemoLoaders {
  return use(DemoLoadersContext) ?? {}
}
