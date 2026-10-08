"use server"

import type { PostgrestError } from "@supabase/supabase-js"
import { revalidatePath } from "next/cache"

import { requireUser } from "@/features/auth/session"
import { frontOfTaskTitle, frontTaskTitle } from "@/features/content/logic"
import { asSlides, POST_COLUMNS } from "@/features/content/queries"
import {
  parseFrontTasks,
  parsePostInput,
  parsePostPatch,
  type FrontTaskInput,
  type PostInput,
  type PostPatch,
} from "@/features/content/validation"
import { formatShortDate } from "@/lib/dates"
import { CONTENT_FORMAT_LABEL } from "@/lib/labels"
import type { Json } from "@/lib/supabase/database.types"
import { dbFailure } from "@/lib/supabase/errors"
import { createClient } from "@/lib/supabase/server"
import type { ActionResult, ContentPost, ContentSlide } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Server Actions da Central de Conteúdo. O banco cuida do resto: frente de
 * vídeo pelo formato, published_at, autoria, histórico e RLS.
 */

const NOT_FOUND = { ok: false, error: "Esse post não existe mais." } as const

function refreshApp() {
  revalidatePath("/", "layout")
}

/** Slides para a coluna jsonb. */
function slidesJson(slides: ContentSlide[]): Json {
  return slides.map(({ text, image_path }) => ({ text, image_path }))
}

function saveFailure(error: PostgrestError, message: string): { ok: false; error: string } {
  if (error.code === "23503") return { ok: false, error: "O cliente, o projeto ou o responsável não existe mais." }
  return dbFailure(error, message)
}

/** O post inteiro, com os textos (o diálogo abre com o resumo e lê o resto aqui). */
export async function loadPost(id: string): Promise<ActionResult<ContentPost>> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("content_posts").select(POST_COLUMNS).eq("id", id).maybeSingle()
  if (error) return dbFailure(error, "Não foi possível abrir o post.")
  if (!data) return NOT_FOUND
  return { ok: true, data: { ...data, slides: asSlides(data.slides) } }
}

export async function createPost(input: PostInput): Promise<ActionResult<{ id: string }>> {
  await requireUser()
  const parsed = parsePostInput(input)
  if (!parsed.ok) return parsed
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("content_posts")
    .insert({ ...parsed.value, slides: slidesJson(parsed.value.slides) })
    .select("id")
    .single()
  if (error) return saveFailure(error, "Não foi possível criar o post.")
  refreshApp()
  return { ok: true, data: { id: data.id } }
}

/** Edita o post (inclusive mudar de etapa pelo quadro). Só os campos enviados mudam. */
export async function updatePost(id: string, patch: PostPatch): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parsePostPatch(patch)
  if (!parsed.ok) return parsed
  if (Object.keys(parsed.value).length === 0) return { ok: true, data: null }
  const { slides, ...fields } = parsed.value
  const supabase = await createClient()
  const { data, error } = await supabase
    .from("content_posts")
    .update(slides ? { ...fields, slides: slidesJson(slides) } : fields)
    .eq("id", id)
    .select("id")
  if (error) {
    if (error.code === "23514") return { ok: false, error: "Confira a data e o horário: sem dia, não há horário." }
    return saveFailure(error, "Não foi possível salvar o post.")
  }
  if (data.length === 0) return NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

/** Exclui o post. As tarefas geradas continuam, sem o vínculo (o banco limpa). */
export async function deletePost(id: string): Promise<ActionResult> {
  await requireUser()
  if (!isUuid(id)) return NOT_FOUND
  const supabase = await createClient()
  const { data, error } = await supabase.from("content_posts").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o post.")
  if (data.length === 0) return NOT_FOUND
  refreshApp()
  return { ok: true, data: null }
}

/**
 * Gera uma tarefa por frente escolhida (copy, design, vídeo), ligada ao post
 * (`content_post_id`), ao cliente e ao projeto dele, com responsáveis e prazo.
 */
export async function createFrontTasks(postId: string, items: FrontTaskInput[]): Promise<ActionResult<{ count: number }>> {
  await requireUser()
  if (!isUuid(postId)) return NOT_FOUND
  const parsed = parseFrontTasks(items)
  if (!parsed.ok) return parsed

  const supabase = await createClient()
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

  refreshApp()
  return { ok: true, data: { count: tasks.length } }
}
