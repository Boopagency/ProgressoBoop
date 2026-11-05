"use client"

import { useSearchParams } from "next/navigation"
import { useEffect } from "react"

import { PostDialog, usePostDialog } from "@/features/content/post-dialog"
import { todayKey } from "@/lib/dates"

import { vbPosts } from "../fixtures"
import { VitrineB } from "../vitrine-b"

/** A janela do post aberta sobre o Conteúdo (`?id=p1`; `p6` é um publicado, com o Desempenho). */
export default function VitrinePostPage() {
  return (
    <VitrineB active="/conteudo">
      <OpenPost />
    </VitrineB>
  )
}

function OpenPost() {
  const id = useSearchParams().get("id") ?? "p1"
  const dialog = usePostDialog()
  const { openPost } = dialog
  useEffect(() => {
    const post = vbPosts(todayKey()).find((candidate) => candidate.id === id)
    if (post) openPost(post)
    // eslint-disable-next-line react-hooks/exhaustive-deps -- abre uma vez por id
  }, [id])
  return <PostDialog state={dialog.state} onOpenChange={dialog.onOpenChange} />
}
