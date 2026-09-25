import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { cn } from "@/lib/utils"

/** Cores suaves e fixas por pessoa, na ordem da equipe. */
const PERSON_COLORS = [
  "bg-indigo-100 text-indigo-700",
  "bg-rose-100 text-rose-700",
  "bg-emerald-100 text-emerald-700",
  "bg-amber-100 text-amber-800",
  "bg-sky-100 text-sky-700",
]

export function personColor(index: number): string {
  return PERSON_COLORS[Math.max(index, 0) % PERSON_COLORS.length] ?? PERSON_COLORS[0]!
}

export function initials(fullName: string): string {
  const words = fullName.trim().split(/\s+/).filter(Boolean)
  return words
    .slice(0, 2)
    .map((word) => word.charAt(0).toLocaleUpperCase("pt-BR"))
    .join("")
}

/** Avatares sobrepostos das pessoas indicadas, na ordem da equipe. */
export function AvatarStack({
  ids,
  profiles,
  className,
}: {
  ids: string[]
  profiles: { id: string; full_name: string; avatar_url: string | null }[]
  className?: string
}) {
  return (
    <span className={cn("flex -space-x-1.5", className)}>
      {profiles.map((profile, index) =>
        ids.includes(profile.id) ? (
          <PersonAvatar
            key={profile.id}
            name={profile.full_name}
            avatarUrl={profile.avatar_url}
            colorIndex={index}
            size="sm"
            className="size-5 ring-2 ring-background [&_[data-slot=avatar-fallback]]:text-[10px]"
          />
        ) : null
      )}
    </span>
  )
}

export function PersonAvatar({
  name,
  avatarUrl,
  colorIndex,
  size = "default",
  className,
}: {
  name: string
  avatarUrl?: string | null
  colorIndex: number
  size?: "sm" | "default" | "lg"
  className?: string
}) {
  return (
    <Avatar size={size} className={className}>
      {avatarUrl ? <AvatarImage src={avatarUrl} alt={name} /> : null}
      <AvatarFallback className={cn("font-medium", personColor(colorIndex))}>
        {initials(name)}
      </AvatarFallback>
    </Avatar>
  )
}
