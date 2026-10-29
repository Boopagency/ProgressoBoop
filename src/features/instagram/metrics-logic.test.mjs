// Teste das regras das métricas do Instagram (sem dependências):
//   node --test src/features/instagram/metrics-logic.test.mjs
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  captionStart,
  dueCheckpoint,
  evolution,
  INSIGHT_METRICS,
  interactionsOf,
  mediaKind,
  metaErrorCode,
  metricValues,
  nextCollectionAt,
  parseAccountMedia,
  parseInsights,
  parseMediaFields,
  pickDue,
  summarize,
} from "./metrics-logic.ts"

const hour = 60 * 60 * 1000
const day = 24 * hour
const published = Date.UTC(2026, 9, 27, 15)

test("tipo da publicação: formato do post e media_type", () => {
  assert.equal(mediaKind("stories"), "story")
  assert.equal(mediaKind("reels"), "reels")
  assert.equal(mediaKind("video"), "reels")
  assert.equal(mediaKind("static"), "feed")
  assert.equal(mediaKind("carousel", "CAROUSEL_ALBUM"), "feed")
  // Post ligado à mão: vídeo no feed é reels.
  assert.equal(mediaKind("static", "VIDEO"), "reels")
  assert.equal(mediaKind("stories", "VIDEO"), "story")
})

test("feed e reels: +1 h, +24 h, +3 d, +7 d e +30 d, e para", () => {
  assert.equal(dueCheckpoint("feed", published, [], published + 30 * 60 * 1000), null)
  assert.equal(dueCheckpoint("feed", published, [], published + hour), "1h")
  assert.equal(dueCheckpoint("feed", published, ["1h"], published + 2 * hour), null)
  assert.equal(dueCheckpoint("feed", published, ["1h"], published + day + 10 * 60 * 1000), "24h")
  assert.equal(dueCheckpoint("reels", published, ["1h", "24h"], published + 3 * day), "3d")
  assert.equal(dueCheckpoint("feed", published, ["1h", "24h", "3d"], published + 7 * day + hour), "7d")
  assert.equal(dueCheckpoint("feed", published, ["1h", "24h", "3d", "7d"], published + 30 * day), "30d")
  assert.equal(dueCheckpoint("feed", published, ["1h", "24h", "3d", "7d", "30d"], published + 31 * day), null)
  // Fora da janela (35 dias), nem a de +30 d atrasada entra.
  assert.equal(dueCheckpoint("feed", published, ["1h", "24h", "3d", "7d"], published + 36 * day), null)
})

test("momentos perdidos ficam para trás: lê o último que passou", () => {
  // Post ligado 10 dias depois: lê como +7 d e não volta para +1 h.
  assert.equal(dueCheckpoint("feed", published, [], published + 10 * day), "7d")
  assert.equal(dueCheckpoint("feed", published, ["7d"], published + 11 * day), null)
  assert.equal(dueCheckpoint("feed", published, ["7d"], published + 30 * day), "30d")
  // Job parado um dia e meio: pula a de +1 h, lê a de +24 h.
  assert.equal(dueCheckpoint("feed", published, [], published + 36 * hour), "24h")
})

test("stories: +1 h, +12 h e +23 h, antes de 24 h", () => {
  assert.equal(dueCheckpoint("story", published, [], published + hour), "1h")
  assert.equal(dueCheckpoint("story", published, ["1h"], published + 12 * hour), "12h")
  assert.equal(dueCheckpoint("story", published, ["1h", "12h"], published + 23 * hour + 30 * 60 * 1000), "23h")
  assert.equal(dueCheckpoint("story", published, ["1h", "12h"], published + 24 * hour), null)
  assert.equal(dueCheckpoint("story", published, ["1h", "12h", "23h"], published + 23.5 * hour), null)
})

test("publicação no futuro ou sem data não lê", () => {
  assert.equal(dueCheckpoint("feed", published, [], published - hour), null)
  assert.equal(dueCheckpoint("feed", Number.NaN, [], published), null)
})

test("próxima leitura", () => {
  assert.equal(nextCollectionAt("feed", published, [], published + 10 * 60 * 1000), published + hour)
  assert.equal(nextCollectionAt("feed", published, ["1h"], published + 2 * hour), published + day)
  const now = published + 2 * day
  assert.equal(nextCollectionAt("feed", published, ["1h"], now), now)
  assert.equal(nextCollectionAt("feed", published, ["1h", "24h", "3d", "7d", "30d"], published + 31 * day), null)
  assert.equal(nextCollectionAt("story", published, ["1h", "12h", "23h"], published + 23.5 * hour), null)
  assert.equal(nextCollectionAt("story", published, ["1h"], published + 2 * hour), published + 12 * hour)
})

test("lote da rodada: stories primeiro, depois os mais antigos, até o limite", () => {
  const now = published + 3 * day
  const base = { client_id: "c", media_id: "m", done: [] }
  const picked = pickDue(
    [
      { ...base, post_id: "novo", format: "static", published_at: new Date(published + 2 * day).toISOString() },
      { ...base, post_id: "velho", format: "static", published_at: new Date(published).toISOString() },
      { ...base, post_id: "story", format: "stories", published_at: new Date(now - 2 * hour).toISOString() },
      { ...base, post_id: "lido", format: "static", published_at: new Date(published).toISOString(), done: ["3d"] },
    ],
    now,
    2
  )
  assert.deepEqual(
    picked.map((item) => [item.candidate.post_id, item.checkpoint]),
    [
      ["story", "1h"],
      ["velho", "3d"],
    ]
  )
})

test("métricas pedidas por tipo, sem impressions nem plays", () => {
  for (const metrics of Object.values(INSIGHT_METRICS)) {
    assert.ok(metrics.includes("views"))
    assert.ok(!metrics.includes("impressions"))
    assert.ok(!metrics.includes("plays"))
  }
  assert.ok(INSIGHT_METRICS.story.includes("replies"))
  assert.ok(!INSIGHT_METRICS.story.includes("saved"))
  assert.ok(INSIGHT_METRICS.reels.includes("ig_reels_avg_watch_time"))
})

test("lê as respostas da Meta", () => {
  const fields = parseMediaFields({
    id: "179",
    media_type: "IMAGE",
    like_count: 12,
    comments_count: 3,
    permalink: "https://www.instagram.com/p/abc/",
    timestamp: "2026-10-27T15:00:00+0000",
  })
  assert.equal(fields.likeCount, 12)
  assert.equal(fields.timestamp, "2026-10-27T15:00:00+00:00")
  assert.equal(Date.parse(fields.timestamp), published)
  assert.equal(parseMediaFields({}), null)

  const insights = parseInsights({
    data: [
      { name: "views", period: "lifetime", values: [{ value: 1500 }] },
      { name: "reach", period: "lifetime", values: [{ value: 900 }] },
      { name: "navigation", total_value: { value: 40 } },
      { name: "saved", values: [] },
    ],
  })
  assert.deepEqual(insights, { views: 1500, reach: 900, navigation: 40 })
  assert.equal(parseInsights({ error: { code: 100 } }), null)

  const values = metricValues(fields, insights)
  assert.equal(values.views, 1500)
  // Curtidas e comentários caem nos campos da publicação.
  assert.equal(values.likes, 12)
  assert.equal(values.comments, 3)
  assert.equal(values.saved, null)

  assert.equal(metaErrorCode({ error: { code: 10, message: "(#10) Not enough viewers" } }), 10)
  assert.equal(metaErrorCode(null), null)
})

test("publicações da conta para ligar", () => {
  const media = parseAccountMedia({
    data: [
      { id: "1", caption: "Oi", media_type: "VIDEO", thumbnail_url: "https://cdn/t.jpg", media_url: "https://cdn/v.mp4", permalink: "https://instagram.com/reel/1", timestamp: "2026-10-20T10:00:00+0000" },
      { id: "2", media_type: "IMAGE", media_url: "http://inseguro", permalink: "javascript:alert(1)" },
      { caption: "sem id" },
    ],
  })
  assert.equal(media.length, 2)
  assert.equal(media[0].thumbnailUrl, "https://cdn/t.jpg")
  assert.equal(media[1].thumbnailUrl, null)
  assert.equal(media[1].permalink, null)
  assert.equal(captionStart("Uma   legenda\ncom quebra", 12), "Uma legenda…")
  assert.equal(captionStart(null), "")
})

test("interações, evolução e resumo", () => {
  const empty = { views: null, reach: null, likes: null, comments: null, saved: null, shares: null, total_interactions: null, follows: null, profile_visits: null, replies: null, navigation: null, avg_watch_time_ms: null, total_watch_time_ms: null }
  assert.equal(interactionsOf({ ...empty, total_interactions: 50, likes: 10 }), 50)
  assert.equal(interactionsOf({ ...empty, likes: 10, comments: 2 }), 12)
  assert.equal(interactionsOf(empty), null)

  assert.deepEqual(
    evolution([{ checkpoint: "7d" }, { checkpoint: "1h" }, { checkpoint: "24h" }]).map((item) => item.checkpoint),
    ["1h", "24h", "7d"]
  )

  const reading = (post_id, views, reach, total_interactions) => ({
    ...empty,
    post_id,
    checkpoint: "7d",
    collected_at: "2026-10-28T00:00:00Z",
    media_kind: "feed",
    views,
    reach,
    total_interactions,
  })
  const summary = summarize(["a", "b", "c"], [reading("a", 100, 80, 10), reading("b", 300, 200, 5), reading("z", 999, 999, 99)])
  assert.equal(summary.posts, 3)
  assert.equal(summary.measured, 2)
  assert.equal(summary.views, 400)
  assert.equal(summary.avgReach, 140)
  assert.equal(summary.interactions, 15)
  assert.equal(summary.best.postId, "b")
  assert.deepEqual(summarize([], []), { posts: 0, measured: 0, views: null, avgReach: null, interactions: null, best: null })
})
