"use client"

import { ContentView } from "@/features/content/content-view"
import { todayKey } from "@/lib/dates"

import { vbIdeas, vbPosts } from "../fixtures"
import { VitrineB } from "../vitrine-b"

/** Conteúdo de verdade, com posts e ideias de exemplo (a visão vem de `?ver=`). */
export default function VitrineContentPage() {
  return (
    <VitrineB active="/conteudo">
      <ContentView posts={vbPosts(todayKey())} ideas={vbIdeas()} />
    </VitrineB>
  )
}
