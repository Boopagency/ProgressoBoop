"use client"

import { Users } from "lucide-react"

import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { firstName } from "@/features/tasks/logic"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useWorkspace } from "@/features/workspace/workspace-provider"
import { cn } from "@/lib/utils"

const TEAM = "team"

/** Uma pessoa responsável pelo combinado, ou "Equipe" (ninguém em especial). */
export function OwnerPicker({
  value,
  onChange,
  className,
  align = "start",
  disabled = false,
}: {
  value: string | null
  onChange: (ownerId: string | null) => void
  className?: string
  align?: "start" | "end"
  disabled?: boolean
}) {
  const { profiles } = useWorkspace()
  const index = profiles.findIndex((profile) => profile.id === value)
  const owner = index >= 0 ? profiles[index] : undefined

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild disabled={disabled}>
        <button
          type="button"
          aria-label="Responsável"
          className={cn(
            "inline-flex min-w-0 items-center gap-1.5 rounded-md text-[13px] text-muted-foreground outline-none transition-colors hover:bg-accent hover:text-foreground focus-visible:ring-[3px] focus-visible:ring-ring/40 disabled:pointer-events-none data-[state=open]:bg-accent",
            className
          )}
        >
          {owner ? (
            <PersonAvatar
              name={owner.full_name}
              avatarUrl={owner.avatar_url}
              colorIndex={index}
              size="sm"
              className="size-[18px] [&_[data-slot=avatar-fallback]]:text-[9px]"
            />
          ) : (
            <Users className="size-3.5" aria-hidden="true" />
          )}
          <span className="truncate">{owner ? firstName(owner.full_name) : "Equipe"}</span>
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align={align} className="w-52">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          Responsável
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value ?? TEAM}
          onValueChange={(next) => onChange(next === TEAM ? null : next)}
        >
          {profiles.map((profile, profileIndex) => (
            <DropdownMenuRadioItem key={profile.id} value={profile.id} className="gap-2">
              <PersonAvatar
                name={profile.full_name}
                avatarUrl={profile.avatar_url}
                colorIndex={profileIndex}
                size="sm"
                className="size-5 [&_[data-slot=avatar-fallback]]:text-[10px]"
              />
              {profile.full_name}
            </DropdownMenuRadioItem>
          ))}
          <DropdownMenuSeparator />
          <DropdownMenuRadioItem value={TEAM} className="gap-2">
            <Users className="size-4 text-muted-foreground" />
            Equipe (ninguém em especial)
          </DropdownMenuRadioItem>
        </DropdownMenuRadioGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
