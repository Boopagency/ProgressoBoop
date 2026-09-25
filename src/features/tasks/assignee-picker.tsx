"use client"

import { Users } from "lucide-react"
import type { ReactNode } from "react"

import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { assigneesLabel } from "@/features/tasks/logic"
import { AvatarStack, PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { cn } from "@/lib/utils"

/** Seleção de responsáveis (uma ou mais pessoas; sempre pelo menos uma). */
export function AssigneePicker({
  value,
  onChange,
  className,
  align = "start",
  icon,
}: {
  value: string[]
  onChange: (ids: string[]) => void
  className?: string
  align?: "start" | "end"
  icon?: ReactNode
}) {
  const { profiles } = useWorkspace()
  const everyone = profiles.map((profile) => profile.id)
  const allSelected = everyone.every((id) => value.includes(id))

  function toggle(id: string, checked: boolean) {
    const next = checked ? [...value, id] : value.filter((current) => current !== id)
    if (next.length === 0) return
    onChange(everyone.filter((profileId) => next.includes(profileId)))
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className={cn(
            "inline-flex min-w-0 items-center gap-2 rounded-md text-sm outline-none transition-colors hover:bg-accent focus-visible:ring-[3px] focus-visible:ring-ring/40 data-[state=open]:bg-accent",
            className
          )}
        >
          {icon}
          {value.length > 0 ? <AvatarStack ids={value} profiles={profiles} /> : null}
          <span className="truncate">{assigneesLabel(value, profiles)}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-56">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Responsáveis
        </DropdownMenuLabel>
        {profiles.map((profile, index) => {
          const checked = value.includes(profile.id)
          const isLast = checked && value.length === 1
          return (
            <DropdownMenuCheckboxItem
              key={profile.id}
              checked={checked}
              disabled={isLast}
              onCheckedChange={(state) => toggle(profile.id, state === true)}
              onSelect={(event) => event.preventDefault()}
              className="gap-2"
            >
              <PersonAvatar
                name={profile.full_name}
                avatarUrl={profile.avatar_url}
                colorIndex={index}
                size="sm"
                className="size-5 [&_[data-slot=avatar-fallback]]:text-[10px]"
              />
              {profile.full_name}
            </DropdownMenuCheckboxItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem disabled={allSelected} onSelect={() => onChange(everyone)}>
          <Users />
          Todos
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
