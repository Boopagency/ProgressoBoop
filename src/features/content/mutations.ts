import "server-only"

import type { PostgrestError } from "@supabase/supabase-js"

import { frontOfTaskTitle, frontTaskTitle, MAX_PINNED, postImagePaths, removedImages } from "@/features/content/logic"
import { asSlides } from "@/features/content/queries"
import { removeContentImages } from "@/features/content/storage"
import { parseFrontTasks, parsePostInput, parsePostPatch } from "@/features/content/validation"
import { formatShortDate } from "@/lib/dates"
import { CONTENT_FORMAT_LABEL } from "@/lib/labels"
import type { Json } from "@/lib/supabase/database.types"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult, ContentSlide } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Gravações dos posts da Central de Conteúdo, usadas pelas Server Actions e
 * pelo conector do Claude (mesma validação, mesmo RLS). O banco cuida do
 * resto: frente de vídeo pelo formato, published_at, autoria, histórico e
 * RLS. Trocar ou tirar uma imagem apaga o arquivo antigo do Storage.
 */

export const NOT_FOUND = { ok: false, error: "Esse post não existe mais." } as const
const PINNED_FULL = {
  ok: false,
  error: `Já há ${MAX_PINNED} posts fixados no feed deste cliente. Desafixe um antes.`,
} as const

/** Slides para a coluna jsonb. */
function slidesJson(slides: ContentSlide[]): Json {
  return slides.map(({ text, image_path }) => ({ text, image_path }))
}

function saveFailure(error: PostgrestError, message: string): { ok: false; error: string } {
  if (error.code === "23503") return { ok: false, error: "O cliente, o projeto ou o responsável não existe mais." }
  return dbFailure(error, message)
}

/** Posts fixados do cliente, fora o próprio post (para conferir o limite de 3). */
async function pinnedElsewhere(
  supabase: SupabaseServerClient,
  clientId: string,
  postId?: string
): Promise<ActionResult<number>> {
  let query = supabase
    .from("content_posts")
    .select("id", { count: "exact", head: true })
    .eq("client_id", clientId)
    .eq("pinned", true)
  if (postId) query = query.neq("id", postId)
  const { count, error } = await query
  if (error) return dbFailure(error, "Não foi possível fixar o post.")
  return { ok: true, data: count ?? 0 }
}

export async function insertPost(supabase: SupabaseServerClient, input: unknown): Promise<ActionResult<{ id: string }>> {
  const parsed = parsePostInput(input)
  if (!parsed.ok) return parsed
  if (parsed.value.pinned) {
    const pinned = await pinnedElsewhere(supabase, parsed.value.client_id)
    if (!pinned.ok) return pinned
    if (pinned.data >= MAX_PINNED) return PINNED_FULL
  }
  const { data, error } = await supabase
    .from("content_posts")
    .insert({ ...parsed.value, slides: slidesJson(parsed.value.slides) })
    .select("id")
    .single()
  if (error) return saveFailure(error, "Não foi possível criar o post.")
  return { ok: true, data: { id: data.id } }
}

/**
 * Edita o post (inclusive mudar de etapa pelo quadro ou fixar no feed). Só os
 * campos enviados mudam. Trocar ou tirar a capa ou a imagem de um slide apaga
 * o arquivo antigo.
 */
export async function patchPost(supabase: SupabaseServerClient, id: string, patch: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parsePostPatch(patch)
  if (!parsed.ok) return parsed
  if (Object.keys(parsed.value).length === 0) return { ok: true, data: null }
  const { slides, ...fields } = parsed.value

  // O post como está, quando a mudança mexe nas imagens ou no que está fixado.
  const touchesImages = "cover_path" in fields || slides !== undefined
  let imagesBefore: string[] = []
  if (touchesImages || fields.pinned !== undefined || fields.client_id !== undefined) {
    const { data: current, error: readError } = await supabase
      .from("content_posts")
      .select("client_id, pinned, cover_path, slides")
      .eq("id", id)
      .maybeSingle()
    if (readError) return dbFailure(readError, "Não foi possível salvar o post.")
    if (!current) return NOT_FOUND
    imagesBefore = postImagePaths({ cover_path: current.cover_path, slides: asSlides(current.slides) })
    // Fixar (ou levar um post fixado para outro cliente) respeita o limite por cliente.
    const clientId = fields.client_id ?? current.client_id
    if ((fields.pinned ?? current.pinned) && (!current.pinned || clientId !== current.client_id)) {
      const pinned = await pinnedElsewhere(supabase, clientId, id)
      if (!pinned.ok) return pinned
      if (pinned.data >= MAX_PINNED) return PINNED_FULL
    }
  }

  const { data, error } = await supabase
    .from("content_posts")
    .update(slides ? { ...fields, slides: slidesJson(slides) } : fields)
    .eq("id", id)
    .select("cover_path, slides")
  if (error) {
    if (error.code === "23514") return { ok: false, error: "Confira a data e o horário: sem dia, não há horário." }
    return saveFailure(error, "Não foi possível salvar o post.")
  }
  const saved = data[0]
  if (!saved) return NOT_FOUND
  if (touchesImages) {
    const imagesAfter = postImagePaths({ cover_path: saved.cover_path, slides: asSlides(saved.slides) })
    await removeContentImages(supabase, removedImages(imagesBefore, imagesAfter))
  }

  return { ok: true, data: null }
}

/**
 * Gera uma tarefa por frente escolhida (copy, design, vídeo), ligada ao post
 * (`content_post_id`), ao cliente e ao projeto dele, com responsáveis e prazo.
 */
export async function insertFrontTasks(
  supabase: SupabaseServerClient,
  postId: string,
  items: unknown
): Promise<ActionResult<{ count: number }>> {
  if (!isUuid(postId)) return NOT_FOUND
  const parsed = parseFrontTasks(items)
  if (!parsed.ok) return parsed

  const { data: post, error: readError } = await supabase
    .from("content_posts")
    .select("title, client_id, project_id, format, publish_on")
    .eq("id", postId)
    .maybeSingle()
  if (readError) return dbFailure(readError, "Não foi possível criar as tarefas.")
  if (!post) return NOT_FOUND

  const description = `${CONTENT_FORMAT_LABEL[post.format]}${post.publish_on ? ` para ${formatShortDate(post.publish_on)}` : ""}: ${post.title}`
  const { data: tasks, error } = await supabase
    .from("tasks")
    .insert(
      parsed.value.map((item) => ({
        title: frontTaskTitle(item.front, post.title),
        description,
        due_date: item.due_date,
        client_id: post.client_id,
        project_id: post.project_id,
        area: "clients" as const,
        content_post_id: postId,
      }))
    )
    .select("id, title")
  if (error) return dbFailure(error, "Não foi possível criar as tarefas.")

  // Cada tarefa recebe os responsáveis da sua frente (o título começa por ela).
  const assigneesByFront = new Map(parsed.value.map((item) => [item.front, item.assignee_ids]))
  const { error: assignError } = await supabase.from("task_assignees").insert(
    tasks.flatMap((task) => {
      const front = frontOfTaskTitle(task.title)
      return (front ? (assigneesByFront.get(front) ?? []) : []).map((profileId) => ({ task_id: task.id, profile_id: profileId }))
    })
  )
  if (assignError) {
    // Tarefas sem responsável sumiriam das listas "Minhas": desfaz.
    await supabase.from("tasks").delete().in("id", tasks.map((task) => task.id))
    return dbFailure(assignError, "Não foi possível criar as tarefas.")
  }

  return { ok: true, data: { count: tasks.length } }
}
