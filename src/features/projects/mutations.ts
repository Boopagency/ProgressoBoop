import "server-only"

import { checklistItems } from "@/features/docs/logic"
import { copiedTasks, templateTasks, type SeedTask } from "@/features/projects/logic"
import { templateByKey } from "@/features/projects/templates"
import {
  parseProjectInput,
  parseProjectPatch,
  parseProjectSource,
  type ProjectSource,
} from "@/features/projects/validation"
import { dbFailure } from "@/lib/supabase/errors"
import type { SupabaseServerClient } from "@/lib/supabase/server"
import type { ActionResult } from "@/lib/types"
import { isUuid } from "@/lib/utils"

/*
 * Gravações dos projetos, usadas pelas Server Actions e pelo conector do
 * Claude (mesma validação, mesmo RLS). O banco cuida de datas, de quem
 * concluiu e do histórico (triggers) e das permissões (RLS).
 */

const NOT_FOUND = { ok: false, error: "Esse projeto não existe mais." } as const
const TITLE_MAX = 200
const SEED_MAX = 60

async function seedTasks(
  supabase: SupabaseServerClient,
  source: ProjectSource,
  startsOn: string
): Promise<ActionResult<SeedTask[]>> {
  if (source.type === "blank") return { ok: true, data: [] }
  if (source.type === "template") {
    const template = templateByKey(source.key)
    if (!template) return { ok: false, error: "Modelo inválido." }
    return { ok: true, data: templateTasks(template, startsOn) }
  }
  if (source.type === "project") {
    const [{ data: project, error }, { data: tasks, error: tasksError }] = await Promise.all([
      supabase.from("projects").select("starts_on").eq("id", source.id).maybeSingle(),
      supabase.from("tasks").select("title, due_date, area, priority, client_visible, client_approval_required, created_at").eq("project_id", source.id),
    ])
    if (error || tasksError) return dbFailure((error ?? tasksError)!, "Não foi possível copiar as tarefas.")
    if (!project) return { ok: false, error: "O projeto de origem não existe mais." }
    return { ok: true, data: copiedTasks(project, tasks, startsOn) }
  }
  const { data: doc, error } = await supabase.from("docs").select("content, area").eq("id", source.id).maybeSingle()
  if (error) return dbFailure(error, "Não foi possível ler o processo.")
  if (!doc) return { ok: false, error: "O processo de origem não existe mais." }
  return {
    ok: true,
    data: checklistItems(doc.content).map((item) => ({ title: item.text, due_date: null, area: doc.area })),
  }
}

/**
 * Cria o projeto e as tarefas iniciais (de um modelo, de outro projeto ou do
 * checklist de um processo). As tarefas ficam com o responsável do projeto
 * (ou com quem criou) e com o cliente do projeto.
 */
export async function insertProject(
  supabase: SupabaseServerClient,
  userId: string,
  input: unknown,
  rawSource: unknown
): Promise<ActionResult<{ id: string; tasks: number }>> {
  const parsed = parseProjectInput(input)
  if (!parsed.ok) return parsed
  const source = parseProjectSource(rawSource)
  if (!source) return { ok: false, error: "Modelo inválido." }
  const project = parsed.value

  const seeds = await seedTasks(supabase, source, project.starts_on)
  if (!seeds.ok) return seeds
  if (seeds.data.length > SEED_MAX) return { ok: false, error: `O modelo tem mais de ${SEED_MAX} tarefas.` }

  const { data: created, error } = await supabase
    .from("projects")
    .insert({ ...project, template: source.type === "template" ? source.key : null })
    .select("id")
    .single()
  if (error) return dbFailure(error, "Não foi possível criar o projeto.")

  if (seeds.data.length > 0) {
    const { data: tasks, error: tasksError } = await supabase
      .from("tasks")
      .insert(
        seeds.data.map((seed) => ({
          title: seed.title.length > TITLE_MAX ? `${seed.title.slice(0, TITLE_MAX - 1).trimEnd()}…` : seed.title,
          description: seed.title.length > TITLE_MAX ? seed.title : null,
          due_date: seed.due_date,
          area: seed.area,
          priority: seed.priority ?? "normal",
          client_id: project.client_id,
          project_id: created.id,
          client_visible: project.client_id ? (seed.client_visible ?? false) : false,
          client_approval_required: project.client_id ? (seed.client_approval_required ?? false) : false,
        }))
      )
      .select("id")
    const owner = project.owner_id ?? userId
    const assignError =
      tasksError ??
      (
        await supabase
          .from("task_assignees")
          .insert(tasks!.map((task) => ({ task_id: task.id, profile_id: owner })))
      ).error
    if (assignError) {
      // Projeto pela metade confunde mais do que ajuda: desfaz tudo.
      await supabase.from("tasks").delete().eq("project_id", created.id)
      await supabase.from("projects").delete().eq("id", created.id)
      return dbFailure(assignError, "Não foi possível criar as tarefas do projeto.")
    }
  }

  return { ok: true, data: { id: created.id, tasks: seeds.data.length } }
}

/**
 * Altera o projeto. Se o cliente muda, as tarefas do projeto que estavam com
 * o cliente antigo (ou sem cliente) passam para o novo.
 */
export async function patchProject(supabase: SupabaseServerClient, id: string, patch: unknown): Promise<ActionResult> {
  if (!isUuid(id)) return NOT_FOUND
  const parsed = parseProjectPatch(patch)
  if (!parsed.ok) return parsed
  if (Object.keys(parsed.value).length === 0) return { ok: true, data: null }

  const { data: current, error: readError } = await supabase
    .from("projects")
    .select("client_id, starts_on, due_on")
    .eq("id", id)
    .maybeSingle()
  if (readError) return dbFailure(readError, "Não foi possível salvar o projeto.")
  if (!current) return NOT_FOUND
  const startsOn = parsed.value.starts_on ?? current.starts_on
  const dueOn = parsed.value.due_on === undefined ? current.due_on : parsed.value.due_on
  if (dueOn && dueOn < startsOn) return { ok: false, error: "O prazo não pode ser antes do começo." }

  const { error } = await supabase.from("projects").update(parsed.value).eq("id", id)
  if (error) return dbFailure(error, "Não foi possível salvar o projeto.")

  const nextClient = parsed.value.client_id
  if (nextClient !== undefined && nextClient !== current.client_id) {
    let query = supabase.from("tasks").update({ client_id: nextClient }).eq("project_id", id)
    query = current.client_id
      ? query.or(`client_id.is.null,client_id.eq.${current.client_id}`)
      : query.is("client_id", null)
    const { error: tasksError } = await query
    if (tasksError) return dbFailure(tasksError, "O projeto foi salvo, mas as tarefas não mudaram de cliente.")
  }

  return { ok: true, data: null }
}

/**
 * Exclui o projeto. As tarefas continuam (sem projeto), a não ser que a
 * pessoa peça para excluir também as tarefas.
 */
export async function removeProject(supabase: SupabaseServerClient, id: string, withTasks: unknown): Promise<ActionResult> {
  if (!isUuid(id) || typeof withTasks !== "boolean") return NOT_FOUND

  if (withTasks) {
    const { error } = await supabase.from("tasks").delete().eq("project_id", id)
    if (error) return dbFailure(error, "Não foi possível excluir as tarefas do projeto.")
  }
  const { data, error } = await supabase.from("projects").delete().eq("id", id).select("id")
  if (error) return dbFailure(error, "Não foi possível excluir o projeto.")
  if (data.length === 0) return NOT_FOUND

  return { ok: true, data: null }
}
