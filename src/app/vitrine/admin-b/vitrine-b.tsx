"use client"

import type { ReactNode } from "react"

import type { ThreadData } from "@/features/channels/logic"
import type { PostPerformance } from "@/features/instagram/metrics-actions"
import { NewTaskProvider } from "@/features/tasks/new-task-dialog"
import { TasksProvider } from "@/features/tasks/tasks-provider"
import { WorkspaceProvider } from "@/features/workspace/workspace-provider"
import { addDaysToKey, todayKey } from "@/lib/dates"
import { DemoLoadersProvider, type DemoLoaders } from "@/lib/demo-loaders"
import type { ContentPost } from "@/lib/types"

import { VITRINE_USER } from "../fixtures"
import { VitrineShell } from "../vitrine-shell"
import { vbPosts, vbTasks, vbThread, vbWorkspace } from "./fixtures"

const CAPTIONS: Record<string, string> = {
  p1: "O inverno chegou com notas de chocolate amargo e laranja. ☕🍊\n\nNosso blend de inverno está de volta, só por tempo limitado. Vem provar!",
}

function demoPost(id: string): ContentPost | null {
  const today = todayKey()
  const post = vbPosts(today).find((candidate) => candidate.id === id)
  if (!post) return null
  return {
    ...post,
    brief: "Lançamento do blend sazonal, com foco na origem e nas notas de sabor.",
    design_notes: null,
    script: null,
    caption: CAPTIONS[id] ?? "Legenda em produção.",
    slides: [
      { text: "Blend de inverno", image_path: null },
      { text: "Chocolate amargo e laranja", image_path: null },
      { text: "Da fazenda para a xícara", image_path: null },
      { text: "Só neste inverno", image_path: null },
    ],
  }
}

function performance(): PostPerformance {
  const today = todayKey()
  const reading = (checkpoint: "1h" | "24h" | "3d", views: number, reach: number, likes: number, days: number) => ({
    post_id: "p6",
    checkpoint,
    collected_at: `${addDaysToKey(today, days)}T21:00:00.000Z`,
    media_kind: "feed" as const,
    views,
    reach,
    likes,
    comments: Math.round(likes / 12),
    saved: Math.round(likes / 6),
    shares: Math.round(likes / 9),
    total_interactions: Math.round(likes * 1.4),
    follows: 6,
    profile_visits: 84,
    replies: null,
    navigation: null,
    avg_watch_time_ms: null,
    total_watch_time_ms: null,
  })
  return {
    linked: true,
    permalink: "https://www.instagram.com/p/exemplo",
    publishedAt: `${addDaysToKey(today, -2)}T21:00:00.000Z`,
    kind: "feed",
    readings: [reading("1h", 640, 512, 58, -2), reading("24h", 2310, 1780, 196, -1), reading("3d", 3480, 2650, 271, 0)],
    nextAt: `${addDaysToKey(today, 5)}T21:00:00.000Z`,
    lastError: null,
    canLink: true,
  }
}

const LOADERS: DemoLoaders = {
  loadThread: async (): Promise<{ ok: true; data: ThreadData }> => ({ ok: true, data: vbThread(todayKey()) }),
  loadPostThread: async (postId) => {
    const thread = vbThread(todayKey())
    const only = (list: ThreadData["messages"]) => list.filter((message) => message.post_id === postId)
    return {
      ok: true,
      data: { messages: only(thread.messages), pending: only(thread.pending), reads: thread.reads, hasMore: false, channelId: "ch-aurora" },
    }
  },
  loadPost: async (id) => {
    const post = demoPost(id)
    return post ? { ok: true, data: post } : { ok: false, error: "Post de exemplo não encontrado." }
  },
  loadActivity: async () => ({ ok: true, data: [] }),
  loadAutoPublishContext: async () => ({
    ok: true,
    data: { configured: true, account: { username: "aurora.cafe", status: "connected", tokenExpiresAt: `${addDaysToKey(todayKey(), 40)}T12:00:00.000Z` } },
  }),
  loadPostPerformance: async () => ({ ok: true, data: performance() }),
}

/** Casca e provedores do lote 2B: equipe, tarefas e leituras de exemplo, sem banco. */
export function VitrineB({ active, children }: { active: string; children: ReactNode }) {
  const today = todayKey()
  return (
    <DemoLoadersProvider loaders={LOADERS}>
      <WorkspaceProvider workspace={vbWorkspace(today)} currentUser={VITRINE_USER}>
        <NewTaskProvider>
          <TasksProvider tasks={vbTasks(today)} today={today}>
            <VitrineShell area="admin" active={active}>
              {children}
            </VitrineShell>
          </TasksProvider>
        </NewTaskProvider>
      </WorkspaceProvider>
    </DemoLoadersProvider>
  )
}
