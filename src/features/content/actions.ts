"use server"

import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { isContentImagePath, postImagePaths } from "@/features/content/logic"
import { insertFrontTasks, insertPost, NOT_FOUND, patchPost } from "@/features/content/mutations"
import { asSlides, fetchPost } from "@/features/content/queries"
import { CONTENT_BUCKET, removeContentImages } from "@/features/content/storage"
import {
  DISCARD_MAX,
  IMAGE_MAX,
  IMAGE_TYPES,
  parseFeedProfile,
  type FeedProfileInput,
  type FrontTaskInput,
  type PostInput,
  type PostPatch,
} from "@/features/content/validation"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult, ContentPost } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Server Actions da Central de Conteúdo. O banco cuida do resto: frente de
 * vídeo pelo formato, published_at, autoria, histórico e RLS. As imagens
 * (bucket `content`) saem do Storage quando o post é excluído ou quando a
 * imagem é trocada ou tirada.
 */

const CLIENT_NOT_FOUND = { ok: false, error: "Esse cliente não existe mais." } as const

function refreshApp() {
  revalidatePath("/", "layout")
}

function refreshed<T extends ActionResult<unknown>>(result: T): T {
  if (result.ok) refreshApp()
  return result
}

/** O post inteiro, com os textos (o diálogo abre com o resumo e lê o resto aqui). */
export async function loadPost(id: string): Promise<ActionResult<ContentPost>> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  try {
    const post = await fetchPost(await createClient(), id)
    return post ? { ok: true, data: post } : NOT_FOUND
  } catch {
    return { ok: false, error: "Não foi possível abrir o post." }
  }
}

export async function createPost(input: PostInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  return refreshed(await insertPost(await createClient(), input))
}

/**
 * Edita o post (inclusive mudar de etapa pelo quadro ou fixar no feed). Só os
 * campos enviados mudam (regra em mutations.ts).
 */
export async function updatePost(id: string, patch: PostPatch): Promise<ActionResult> {
  await requireUser()
  return refreshed(await patchPost(await createClient(), id, patch))
}

/** Exclui o post e as imagens dele. As tarefas geradas continuam, sem o vínculo (o banco limpa). */
export async function deletePost(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("content_posts").delete().eq("id", id).select("cover_path, slides")
  if (error) return dbFailure(error, "Não foi possível excluir o post.")
  if (data.length === 0) return NOT_FOUND
  await removeContentImages(
    supabase,
    data.flatMap((post) => postImagePaths({ cover_path: post.cover_path, slides: asSlides(post.slides) }))
  )
  refreshApp()
  return { ok: true, data: null }
}

/** Uma tarefa por frente escolhida (copy, design, vídeo), ligada ao post (regra em mutations.ts). */
export async function createFrontTasks(postId: string, items: FrontTaskInput[]): Promise<ActionResult<{ count: number }>> {
  await requireUser()
  return refreshed(await insertFrontTasks(await createClient(), postId, items))
}

/* ------------------------------------------------------------------ */
/* Imagens e perfil do feed                                            */
/* ------------------------------------------------------------------ */

/**
 * URL assinada para o navegador enviar uma imagem (capa, slide ou foto do
 * perfil) direto ao Storage, sem passar pelo limite de tamanho das Server
 * Actions, e o caminho que vai no banco (`<client_id>/<arquivo>`). A imagem
 * só abre pelo app (/api/conteudo/…), para a equipe.
 */
export async function createContentImageUpload(
  clientId: string,
  contentType: string,
  size: number
): Promise<ActionResult<{ uploadUrl: string; path: string }>> {
  await requireUser()
  if (!isUuid(clientId)) return CLIENT_NOT_FOUND
  if (!(IMAGE_TYPES as readonly string[]).includes(contentType)) {
    return { ok: false, error: "Use uma imagem PNG, JPG ou WebP." }
  }
  if (!Number.isFinite(size) || size <= 0 || size > IMAGE_MAX) {
    return { ok: false, error: "A imagem precisa ter até 5 MB." }
  }

  const path = `${clientId}/${crypto.randomUUID()}`
  const supabase = await createClient()
  const { data, error } = await supabase.storage.from(CONTENT_BUCKET).createSignedUploadUrl(path)
  if (error || !data) {
    console.error(`[storage] ${error?.message ?? "sem dados"}`)
    return { ok: false, error: "Não foi possível enviar a imagem." }
  }
  return { ok: true, data: { uploadUrl: data.signedUrl, path } }
}

/**
 * Apaga imagens enviadas que não chegaram a ser salvas (o post foi fechado
 * sem salvar, ou a imagem foi trocada antes de salvar). Por segurança, as que
 * algum post ou cliente usa ficam.
 */
export async function discardContentImages(paths: string[]): Promise<ActionResult> {
  await requireUser()
  if (!Array.isArray(paths) || paths.length > DISCARD_MAX || !paths.every(isContentImagePath)) {
    return { ok: false, error: "Imagens inválidas." }
  }
  const unique = [...new Set(paths)]
  if (unique.length === 0) return { ok: true, data: null }

  const supabase = await createClient()
  const [[covers, avatars], slideUses] = await Promise.all([
    Promise.all([
      supabase.from("content_posts").select("cover_path").in("cover_path", unique),
      supabase.from("clients").select("avatar_path").in("avatar_path", unique),
    ]),
    Promise.all(
      unique.map((path) =>
        supabase.from("content_posts").select("id").contains("slides", JSON.stringify([{ image_path: path }])).limit(1)
      )
    ),
  ])
  if (covers.error || avatars.error || slideUses.some((use) => use.error)) {
    return { ok: false, error: "Não foi possível conferir as imagens." }
  }
  const inUse = new Set<string>([
    ...covers.data.flatMap((post) => (post.cover_path ? [post.cover_path] : [])),
    ...avatars.data.flatMap((client) => (client.avatar_path ? [client.avatar_path] : [])),
    ...unique.filter((_, index) => (slideUses[index]?.data?.length ?? 0) > 0),
  ])
  await removeContentImages(supabase, unique.filter((path) => !inUse.has(path)))
  return { ok: true, data: null }
}

/** Foto do perfil do cliente (cabeçalho do feed e a marca do cliente nas telas). A anterior sai do Storage. */
export async function setClientAvatar(clientId: string, path: string | null): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId)) return CLIENT_NOT_FOUND
  if (path !== null && !(isContentImagePath(path) && path.startsWith(`${clientId}/`))) {
    return { ok: false, error: "Imagem inválida." }
  }

  const supabase = await createClient()
  const { data: current, error: readError } = await supabase
    .from("clients")
    .select("avatar_path")
    .eq("id", clientId)
    .maybeSingle()
  if (readError) return dbFailure(readError, "Não foi possível salvar a foto.")
  if (!current) return CLIENT_NOT_FOUND
  const { error } = await supabase.from("clients").update({ avatar_path: path }).eq("id", clientId)
  if (error) return dbFailure(error, "Não foi possível salvar a foto.")
  if (current.avatar_path && current.avatar_path !== path) await removeContentImages(supabase, [current.avatar_path])

  refreshApp()
  return { ok: true, data: null }
}

/** @ e bio do Instagram do cliente, editados no cabeçalho do feed. */
export async function updateFeedProfile(clientId: string, input: FeedProfileInput): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(clientId)) return CLIENT_NOT_FOUND
  const parsed = parseFeedProfile(input)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
  const { data, error } = await supabase.from("clients").update(parsed.value).eq("id", clientId).select("id")
  if (error) {
    if (error.code === "23514") return { ok: false, error: "Confira o @ (letras, números, ponto e sublinhado) e a bio (até 150)." }
    return dbFailure(error, "Não foi possível salvar o perfil.")
  }
  if (data.length === 0) return CLIENT_NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}
