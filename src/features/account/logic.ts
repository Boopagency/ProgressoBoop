/*
 * Minha conta: regras de nome, e-mail, senha e foto, iguais para a equipe e
 * para quem acessa o portal. O Supabase Auth confere a senha de novo (mínimo
 * de 8 caracteres, com letras e números).
 */

export const NAME_MAX = 120
export const EMAIL_MAX = 320
export const PASSWORD_MIN = 8
export const PASSWORD_MAX = 72

/** Bucket público das fotos, em "<user_id>/<uuid>". */
export const AVATAR_BUCKET = "avatars"
export const AVATAR_TYPES = ["image/png", "image/jpeg", "image/webp"] as const
export const AVATAR_MAX = 1024 * 1024

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}"

export function cleanName(value: unknown): string | null {
  const name = String(value ?? "").trim().replace(/\s+/g, " ")
  return name.length >= 1 && name.length <= NAME_MAX ? name : null
}

export function cleanEmail(value: unknown): string | null {
  const email = String(value ?? "").trim().toLowerCase()
  return email.length <= EMAIL_MAX && EMAIL_PATTERN.test(email) ? email : null
}

/** O que falta na senha nova, ou null se ela serve. */
export function passwordProblem(password: string): string | null {
  if (password.length < PASSWORD_MIN) return `A senha precisa ter pelo menos ${PASSWORD_MIN} caracteres.`
  if (password.length > PASSWORD_MAX) return `A senha pode ter até ${PASSWORD_MAX} caracteres.`
  if (!/[A-Za-z]/.test(password) || !/[0-9]/.test(password)) return "Use letras e números na senha."
  return null
}

/** Caminho de uma foto da própria conta no bucket (o arquivo é sempre um uuid novo). */
export function isOwnAvatarPath(userId: string, path: string): boolean {
  return new RegExp(`^${userId}/${UUID}$`).test(path)
}

/** URL pública de uma foto do bucket, a partir da URL do projeto no Supabase. */
export function avatarPublicUrl(supabaseUrl: string, path: string): string {
  return `${supabaseUrl.replace(/\/+$/, "")}/storage/v1/object/public/${AVATAR_BUCKET}/${path}`
}

/** Caminho no bucket a partir da URL pública salva no perfil, se for uma foto da própria conta. */
export function ownAvatarPathFromUrl(userId: string, url: string | null): string | null {
  if (!url) return null
  const marker = `/storage/v1/object/public/${AVATAR_BUCKET}/`
  const index = url.indexOf(marker)
  if (index < 0) return null
  const path = url.slice(index + marker.length)
  return isOwnAvatarPath(userId, path) ? path : null
}
