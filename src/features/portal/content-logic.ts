import { comparePosts, feedOrder, isFeedPost } from "@/features/content/logic"
import { addDaysToKey, isWithin } from "@/lib/dates"
import type { ContentFormat, ContentNetwork, ContentSlide, ContentStage, DateKey } from "@/lib/types"

/*
 * Regras do conteúdo no portal do cliente: funções puras, sem React.
 *
 * - O banco só devolve o que o cliente pode ver: posts a partir de "com o
 *   cliente" e os que voltaram para a equipe depois de o cliente escrever
 *   neles (`private.portal_visible_post`).
 * - Para o cliente, a etapa vira uma situação: aprovar (com o cliente), em
 *   ajuste (produção ou revisão interna), aprovado, programado e publicado.
 * - Só "aprovar" aceita a decisão; em ajuste o post é só leitura com o chat.
 */

/** Post como o portal recebe de `portal_posts` (sem nada interno da equipe). */
export interface PortalPost {
  id: string
  title: string
  format: ContentFormat
  networks: ContentNetwork[]
  publish_on: DateKey | null
  publish_time: string | null
  stage: ContentStage
  caption: string | null
  slides: ContentSlide[]
  cover_path: string | null
  pinned: boolean
  published_at: string | null
  updated_at: string
}

export type PortalStatus = "review" | "adjusting" | "approved" | "scheduled" | "published"

export function portalStatus(stage: ContentStage): PortalStatus {
  switch (stage) {
    case "client_review":
      return "review"
    case "production":
    case "internal_review":
      return "adjusting"
    case "approved":
      return "approved"
    case "scheduled":
      return "scheduled"
    case "published":
      return "published"
  }
}

export const PORTAL_STATUS_LABEL: Record<PortalStatus, string> = {
  review: "Para aprovar",
  adjusting: "Em ajuste",
  approved: "Aprovado",
  scheduled: "Programado",
  published: "Publicado",
}

/** Tamanho máximo de uma mensagem ou nota (o banco confere o mesmo). */
export const MESSAGE_MAX = 5000

/** Só o post "com o cliente" pode ser aprovado ou receber pedido de ajuste. */
export function canReview(post: Pick<PortalPost, "stage">): boolean {
  return post.stage === "client_review"
}

/** Imagem que representa o post: a capa, senão a do primeiro slide que tiver. */
export function postThumbnail(post: Pick<PortalPost, "cover_path" | "slides">): string | null {
  return post.cover_path ?? post.slides.find((slide) => slide.image_path)?.image_path ?? null
}

/** Imagens do post na ordem de ver: capa e depois os slides, sem repetir. */
export function postGallery(post: Pick<PortalPost, "cover_path" | "slides">): string[] {
  const paths = [post.cover_path, ...post.slides.map((slide) => slide.image_path)]
  return [...new Set(paths.filter((path): path is string => path !== null))]
}

/** Quantos dias a lista "Próximos" do início cobre (hoje incluído). */
export const UPCOMING_DAYS = 14

export interface PortalHome {
  /** Com o cliente, esperando a decisão dele. */
  review: PortalPost[]
  /** Voltaram para a equipe depois de o cliente escrever. */
  adjusting: PortalPost[]
  /** Aprovados ou programados para sair de hoje até `UPCOMING_DAYS` dias. */
  upcoming: PortalPost[]
}

/** Listas do início do portal. Cada post aparece numa lista só. */
export function portalHome(posts: readonly PortalPost[], today: DateKey): PortalHome {
  const range = { start: today, end: addDaysToKey(today, UPCOMING_DAYS - 1) }
  const byStatus = (status: PortalStatus) =>
    posts.filter((post) => portalStatus(post.stage) === status).sort(comparePosts)
  return {
    review: byStatus("review"),
    adjusting: byStatus("adjusting"),
    upcoming: posts
      .filter((post) => {
        const status = portalStatus(post.stage)
        return (
          (status === "approved" || status === "scheduled") &&
          post.publish_on !== null &&
          isWithin(post.publish_on, range)
        )
      })
      .sort(comparePosts),
  }
}

/** Quadrados do feed do Instagram do cliente, na ordem do grid da equipe. */
export function portalFeed(posts: readonly PortalPost[]): PortalPost[] {
  // `feedOrder` desempata pelo criado por último; o portal não recebe a
  // criação, e a última alteração serve para isso.
  const feed = posts.filter(isFeedPost).map((post) => ({ ...post, created_at: post.updated_at }))
  return feedOrder(feed)
}
