import type { ThreadData, ThreadMessage } from "@/features/channels/logic"
import type { Deliverable } from "@/features/deliverables/logic"
import type { TaskSheetData } from "@/features/tasks/task-sheet-data"
import type { Workspace } from "@/features/workspace/queries"
import { addDaysToKey, weekRangeOf } from "@/lib/dates"
import type {
  ActionResult,
  ActivityEntry,
  CalendarEvent,
  DateKey,
  Decision,
  MeetingItem,
  MeetingRecord,
  Project,
  Task,
} from "@/lib/types"

import { VITRINE_USER, vitrineTasks, vitrineWorkspace } from "../fixtures"

/*
 * Dados de exemplo do lote 2A da vitrine (Tarefas, Projetos, Calendário e
 * Reuniões), só em desenvolvimento. Partem dos exemplos da fase 1
 * (`../fixtures.ts`) e acrescentam visões salvas, projetos em vários
 * status, etapas com aprovação do cliente, eventos, reuniões, histórico e a
 * conversa com o cliente. Nada vem do banco.
 */

const STAMP = "2026-10-01T12:00:00.000Z"
const at = (day: DateKey, hour: string) => `${day}T${hour}:00.000-03:00`

export function adminAWorkspace(today: DateKey): Workspace {
  const base = vitrineWorkspace(today)
  const project = (
    id: string,
    name: string,
    client: string | null,
    status: Project["status"],
    due: number,
    extra: Partial<Project> = {}
  ): Project => ({
    id,
    name,
    client_id: client,
    owner_id: VITRINE_USER.id,
    status,
    template: null,
    description: null,
    starts_on: addDaysToKey(today, -30),
    due_on: addDaysToKey(today, due),
    pinned: false,
    completed_at: status === "done" ? `${addDaysToKey(today, -4)}T12:00:00.000Z` : null,
    created_by: VITRINE_USER.id,
    created_at: STAMP,
    updated_at: STAMP,
    ...extra,
  })
  const projects = base.projects.map((item) =>
    item.id === "p-site"
      ? {
          ...item,
          template: "site",
          description:
            "Site institucional com cardápio, reservas e blog. Escopo: 6 páginas, textos pela Boop, fotos do cliente.",
        }
      : item
  )
  return {
    ...base,
    projects: [
      ...projects,
      project("p-trafego", "Tráfego pago da Vela", "c-vela", "active", 25, { owner_id: "u-bia" }),
      project("p-verao", "Campanha de verão", "c-aurora", "planned", 45, { owner_id: "u-bia" }),
      project("p-manual", "Manual da marca Studio Norte", "c-norte", "paused", -3, { owner_id: "u-leo" }),
      project("p-onboard", "Onboarding Vela Arquitetura", "c-vela", "done", -6),
    ],
    savedViews: [
      { id: "v1", name: "Minhas atrasadas", query: "pessoa=mine&prazo=overdue", created_by: VITRINE_USER.id, created_at: STAMP },
      { id: "v2", name: "Café Aurora", query: "cliente=c-aurora", created_by: VITRINE_USER.id, created_at: STAMP },
      { id: "v3", name: "Quadro do site", query: "projeto=p-site&ver=quadro", created_by: VITRINE_USER.id, created_at: STAMP },
    ],
    clientPeople: [{ id: "cp-marina", full_name: "Marina Alves", avatar_url: null }],
  }
}

export function adminATasks(today: DateKey): Task[] {
  const base = vitrineTasks(today).map((task) =>
    task.id === "t3"
      ? {
          ...task,
          description: "Revisar a home e a página Sobre com os ajustes que a Marina pediu na reunião de terça.",
          client_visible: true,
        }
      : task
  )
  const step = (id: string, title: string, due: number, extra: Partial<Task>): Task => ({
    ...base[0]!,
    id,
    title,
    description: null,
    assignee_ids: ["u-leo"],
    client_id: "c-aurora",
    project_id: "p-site",
    area: null,
    priority: "normal",
    status: "todo",
    due_date: addDaysToKey(today, due),
    completed_at: null,
    client_visible: true,
    client_approval_required: false,
    client_approval: null,
    client_approval_note: null,
    client_approval_by: null,
    client_approval_at: null,
    ...extra,
  })
  return [
    ...base,
    step("t20", "Layout da página inicial", -1, {
      status: "done",
      completed_at: `${addDaysToKey(today, -1)}T14:00:00.000Z`,
      client_approval_required: true,
    }),
    step("t21", "Layout do cardápio", -3, {
      status: "done",
      completed_at: `${addDaysToKey(today, -4)}T14:00:00.000Z`,
      client_approval_required: true,
      client_approval: "approved",
      client_approval_note: "Ficou lindo! Só queria o preço um pouco maior.",
      client_approval_at: `${addDaysToKey(today, -3)}T10:00:00.000Z`,
    }),
    step("t22", "Página de reservas", 5, { client_approval_required: true, assignee_ids: [VITRINE_USER.id, "u-leo"] }),
    step("t23", "Fotos do ambiente", -2, {
      status: "done",
      completed_at: `${addDaysToKey(today, -2)}T14:00:00.000Z`,
      client_approval_required: true,
      client_approval: "changes",
      client_approval_note: "Podemos trocar a foto do balcão por uma com mais luz?",
      client_approval_at: `${addDaysToKey(today, -1)}T09:30:00.000Z`,
      assignee_ids: ["u-bia"],
    }),
    step("t24", "Publicar o site", 16, { priority: "high", assignee_ids: [VITRINE_USER.id] }),
    step("t25", "Campanha de anúncios de novembro", 3, {
      client_id: "c-vela",
      project_id: "p-trafego",
      client_visible: false,
      assignee_ids: ["u-bia"],
      area: "commercial",
    }),
  ]
}

const ACTIVITY_BASE = {
  entity_type: "task",
  project_id: "p-site",
  client_id: "c-aurora",
  edited_at: null,
} as const

/** Histórico e entregas do painel da tarefa, sem banco. */
export function adminASheetData(today: DateKey): TaskSheetData {
  const activity = (taskId: string, title: string): ActivityEntry[] => [
    {
      ...ACTIVITY_BASE,
      id: `${taskId}-a3`,
      entity_id: taskId,
      entity_title: title,
      action: "comment",
      changes: {},
      body: "Subi a nova versão com os textos revisados. @Jabez dá uma olhada antes de mandar para a Marina?",
      actor_id: "u-leo",
      created_at: `${today}T11:20:00.000-03:00`,
    },
    {
      ...ACTIVITY_BASE,
      id: `${taskId}-a2`,
      entity_id: taskId,
      entity_title: title,
      action: "updated",
      changes: { status: ["todo", "doing"] },
      body: null,
      actor_id: VITRINE_USER.id,
      created_at: `${addDaysToKey(today, -1)}T16:05:00.000-03:00`,
    },
    {
      ...ACTIVITY_BASE,
      id: `${taskId}-a1`,
      entity_id: taskId,
      entity_title: title,
      action: "created",
      changes: {},
      body: null,
      actor_id: VITRINE_USER.id,
      created_at: `${addDaysToKey(today, -6)}T09:00:00.000-03:00`,
    },
  ]
  const deliverables = (taskId: string): Deliverable[] => [
    {
      id: `${taskId}-d1`,
      task_id: taskId,
      kind: "link",
      title: "Layout da home no Figma",
      url: "https://www.figma.com/",
      file_path: null,
      mime_type: null,
      created_at: STAMP,
    },
  ]
  const titles = new Map(adminATasks(today).map((task) => [task.id, task.title]))
  return {
    loadActivity: async (taskId) => ({ ok: true, data: activity(taskId, titles.get(taskId) ?? "Tarefa") }),
    loadDeliverables: async (taskId) => ({ ok: true, data: deliverables(taskId) }),
  }
}

/* Calendário e reuniões */

function event(
  id: string,
  title: string,
  start: string,
  end: string | null,
  type: CalendarEvent["event_type"],
  client: string | null,
  extra: Partial<CalendarEvent> = {}
): CalendarEvent {
  return {
    id,
    title,
    description: null,
    event_type: type,
    start_at: start,
    end_at: end,
    all_day: false,
    recurrence_rule: null,
    client_id: client,
    created_by: VITRINE_USER.id,
    created_at: STAMP,
    ...extra,
  }
}

export function adminAEvents(today: DateKey): CalendarEvent[] {
  const monday = weekRangeOf(today).start
  const firstMonday = addDaysToKey(monday, -21)
  return [
    event("e-weekly", "Weekly da equipe", at(firstMonday, "09:00"), at(firstMonday, "10:00"), "internal", null, {
      recurrence_rule: "FREQ=WEEKLY",
      description: "Pauta automática: tarefas atrasadas, projetos em foco e combinados da semana anterior.",
    }),
    event("e-site", "Apresentação do site", at(today, "16:30"), at(today, "17:30"), "meeting", "c-aurora", {
      description: "Mostrar a home e o cardápio no celular; alinhar a data de publicação.",
    }),
    event("e-kick", "Kickoff do rebranding", at(addDaysToKey(today, -8), "14:00"), at(addDaysToKey(today, -8), "15:00"), "meeting", "c-norte"),
    event("e-vela", "Resultados de outubro com a Vela", at(addDaysToKey(today, 4), "11:00"), at(addDaysToKey(today, 4), "12:00"), "meeting", "c-vela"),
    event("e-manual", "Entrega do manual da marca", at(addDaysToKey(today, 2), "09:00"), null, "delivery", "c-norte"),
    event("e-foto", "Sessão de fotos no café", at(addDaysToKey(today, 1), "08:00"), at(addDaysToKey(today, 1), "11:00"), "internal", "c-aurora"),
    event("e-bf", "Entrega da campanha de Black Friday", at(addDaysToKey(today, 11), "10:00"), null, "delivery", "c-aurora"),
    event("e-plan", "Planejamento de dezembro", at(addDaysToKey(today, 7), "15:00"), at(addDaysToKey(today, 7), "16:30"), "internal", null),
  ]
}

const record = (id: string, eventId: string, day: DateKey, status: MeetingRecord["status"], extra: Partial<MeetingRecord> = {}): MeetingRecord => ({
  id,
  event_id: eventId,
  occurs_on: day,
  status,
  summary: null,
  transcript_length: 0,
  closed_at: status === "done" ? `${day}T18:00:00.000Z` : null,
  closed_by: status === "done" ? VITRINE_USER.id : null,
  created_by: VITRINE_USER.id,
  created_at: STAMP,
  updated_at: STAMP,
  ...extra,
})

export function adminAMeetings(today: DateKey): { records: MeetingRecord[]; items: MeetingItem[] } {
  const monday = weekRangeOf(today).start
  const records = [
    record("r-w1", "e-weekly", addDaysToKey(monday, -14), "done", { summary: "Semana focada no site do Café Aurora." }),
    record("r-w2", "e-weekly", addDaysToKey(monday, -7), "done", { transcript_length: 4200 }),
    record("r-w3", "e-weekly", monday, "done", { summary: "Prioridades: aprovar o layout, fechar a pauta de novembro." }),
    record("r-w4", "e-weekly", addDaysToKey(monday, 7), "scheduled"),
    record("r-kick", "e-kick", addDaysToKey(today, -8), "done", { transcript_length: 9800 }),
    record("r-site", "e-site", today, "scheduled", {
      summary: "Marina gostou da home. Pediu para destacar o horário de domingo e trocar a foto do balcão.",
    }),
  ]
  const item = (
    id: string,
    meeting: string,
    kind: MeetingItem["kind"],
    content: string,
    extra: Partial<MeetingItem> = {}
  ): MeetingItem => ({
    id,
    meeting_id: meeting,
    kind,
    content,
    owner_id: null,
    due_date: null,
    done: false,
    task_id: null,
    created_by: VITRINE_USER.id,
    created_at: STAMP,
    ...extra,
  })
  return {
    records,
    items: [
      item("i1", "r-site", "topic", "Mostrar a home no celular", { done: true }),
      item("i2", "r-site", "topic", "Fotos do ambiente: qual entra no topo?", { done: true }),
      item("i3", "r-site", "topic", "Data de publicação e domínio"),
      item("i4", "r-site", "agreement", "Trocar a foto do balcão por uma com mais luz", {
        owner_id: "u-bia",
        due_date: addDaysToKey(today, 2),
      }),
      item("i5", "r-site", "agreement", "Revisar textos da home", {
        owner_id: VITRINE_USER.id,
        due_date: today,
        task_id: "t3",
      }),
      item("i6", "r-w3", "agreement", "Fechar pauta de novembro com a Bia", { owner_id: VITRINE_USER.id, task_id: "t4" }),
      item("i7", "r-w3", "topic", "Black Friday do Café Aurora", { done: true }),
      item("i8", "r-w4", "topic", "Revisar processos de onboarding"),
      item("i9", "r-kick", "agreement", "Enviar moodboard em 3 dias", { done: true, owner_id: "u-leo" }),
    ],
  }
}

export function adminADecisions(today: DateKey): Decision[] {
  return [
    {
      id: "d1",
      title: "Publicação do site só depois da aprovação do cardápio",
      context: null,
      decided_on: today,
      status: "active",
      area: null,
      client_id: "c-aurora",
      project_id: "p-site",
      meeting_id: "r-site",
      created_by: VITRINE_USER.id,
      created_at: STAMP,
      updated_at: STAMP,
    },
  ]
}

/* Conversa do projeto com o cliente */

export function adminAThread(today: DateKey): (projectId: string) => Promise<ActionResult<ThreadData & { channelId: string | null }>> {
  const message = (
    id: string,
    author: string,
    body: string,
    when: string,
    extra: Partial<ThreadMessage> = {}
  ): ThreadMessage => ({
    id,
    channel_id: "ch-aurora",
    post_id: null,
    project_id: "p-site",
    author_id: author,
    kind: "text",
    body,
    resolved_at: null,
    resolved_by: null,
    task_id: null,
    internal: false,
    created_at: when,
    edited_at: null,
    post: null,
    project: { id: "p-site", name: "Site novo do Café Aurora" },
    ...extra,
  })
  const messages = [
    message("m1", "u-leo", "Marina, o layout da página inicial está pronto para a sua aprovação no portal.", at(addDaysToKey(today, -1), "17:20")),
    message("m2", "cp-marina", "Amei! Só a foto do balcão: podemos trocar por uma com mais luz?", at(today, "09:15"), {
      kind: "change_request",
    }),
    message("m3", "u-bia", "Combinado, trocamos até sábado e te mandamos aqui.", at(today, "09:42")),
    message("m4", VITRINE_USER.id, "Vamos mostrar tudo na apresentação de hoje às 16h30.", at(today, "10:05"), { internal: true }),
  ]
  return async () => ({
    ok: true,
    data: {
      channelId: "ch-aurora",
      messages,
      hasMore: false,
      pending: messages.filter((item) => item.kind === "change_request"),
      reads: [{ user_id: "cp-marina", last_read_at: at(today, "09:50") }],
    },
  })
}
