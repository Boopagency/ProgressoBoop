"use client"

import { Plus, X } from "lucide-react"
import { useState } from "react"

import { Button } from "@/components/ui/button"
import { isPendingItem, type MeetingItemsApi } from "@/features/meetings/use-meeting-items"
import { ITEM_MAX } from "@/features/meetings/validation"
import { firstName } from "@/features/tasks/logic"
import { TaskCheckbox } from "@/features/tasks/task-checkbox"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { cn } from "@/lib/utils"

/** Assuntos: o que a equipe quer levar para a reunião. Marca-se como discutido. */
export function TopicsCard({ api }: { api: MeetingItemsApi }) {
  const { profileById } = useWorkspace()
  const [draft, setDraft] = useState("")
  const pendingCount = api.topics.filter((topic) => !topic.done).length

  function submit() {
    const content = draft.trim()
    if (!content) return
    setDraft("")
    api.add({ kind: "topic", content, owner_id: null, due_date: null }, () => setDraft(content))
  }

  return (
    <section aria-labelledby="assuntos-titulo" className="overflow-hidden rounded-xl border bg-card">
      <header className="flex items-center gap-2 border-b px-4 py-3.5">
        <h2 id="assuntos-titulo" className="text-sm font-semibold text-foreground">
          Assuntos
        </h2>
        <span className="text-[13px] text-muted-foreground tabular-nums">{pendingCount}</span>
        <span className="ml-auto text-xs text-subtle-foreground">Qualquer pessoa pode adicionar</span>
      </header>

      {api.topics.length > 0 ? (
        <ul className="divide-y">
          {api.topics.map((topic) => {
            const author = profileById.get(topic.created_by)
            const pending = isPendingItem(topic)
            return (
              <li key={topic.id} className="group/topic flex items-start gap-3 px-4 py-2.5">
                <TaskCheckbox
                  checked={topic.done}
                  disabled={pending}
                  onCheckedChange={() => api.update(topic.id, { done: !topic.done })}
                  aria-label={topic.done ? `Reabrir "${topic.content}"` : `Marcar "${topic.content}" como discutido`}
                  className="mt-[1px]"
                />
                <div className="min-w-0 flex-1">
                  <p
                    className={cn(
                      "text-sm leading-5 break-words whitespace-pre-line text-foreground",
                      topic.done && "text-muted-foreground line-through decoration-muted-foreground/50"
                    )}
                  >
                    {topic.content}
                  </p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    {author ? firstName(author.full_name) : "Equipe"}
                    {topic.done ? " · discutido" : null}
                  </p>
                </div>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  disabled={pending}
                  aria-label={`Remover o assunto "${topic.content}"`}
                  onClick={() => api.remove(topic)}
                  className="-my-1 -mr-2 size-7 text-muted-foreground hover:text-destructive md:opacity-0 md:group-hover/topic:opacity-100 md:focus-visible:opacity-100"
                >
                  <X />
                </Button>
              </li>
            )
          })}
        </ul>
      ) : null}

      <form
        className={cn("flex items-center gap-2 px-4 py-3", api.topics.length > 0 && "border-t")}
        onSubmit={(event) => {
          event.preventDefault()
          submit()
        }}
      >
        <Plus className="size-4 shrink-0 text-muted-foreground" aria-hidden="true" />
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          maxLength={ITEM_MAX}
          placeholder={api.topics.length > 0 ? "Outro assunto…" : "Adicionar um assunto à pauta…"}
          aria-label="Novo assunto"
          className="h-8 min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-subtle-foreground"
        />
        {draft.trim() ? (
          <Button type="submit" size="sm" variant="outline" className="h-7 shadow-none">
            Adicionar
          </Button>
        ) : null}
      </form>
    </section>
  )
}
