// Teste das regras da publicação automática no Instagram (sem dependências):
//   node --test src/features/instagram/publish-logic.test.mjs
import assert from "node:assert/strict"
import { test } from "node:test"

import {
  canReuseContainer,
  captionCounts,
  captionProblem,
  containerPlan,
  imageProblem,
  parseContainerStatus,
  parseId,
  parsePermalink,
  parsePublishingLimit,
  publishBlockers,
  publishKind,
  publishSourcePaths,
  urlsExpireAt,
  withChildren,
} from "./publish-logic.ts"

const now = Date.UTC(2026, 9, 27, 12)
const hour = 60 * 60 * 1000
const ready = {
  format: "static",
  networks: ["instagram"],
  stage: "approved",
  publish_on: "2026-10-28",
  publish_time: "18:00:00",
  caption: "Legenda #boop",
  cover_path: "c/capa",
  slides: [],
}
const context = { accountConnected: true, dueAt: now + hour, now, requireFuture: true }

test("formatos que publicam sozinhos", () => {
  assert.equal(publishKind("static"), "image")
  assert.equal(publishKind("photo"), "image")
  assert.equal(publishKind("carousel"), "carousel")
  assert.equal(publishKind("stories"), "story")
  assert.equal(publishKind("reels"), null)
  assert.equal(publishKind("video"), null)
  assert.equal(publishKind("text"), null)
})

test("imagens na ordem: capa ou slides (sem a capa do carrossel)", () => {
  assert.deepEqual(publishSourcePaths(ready), ["c/capa"])
  assert.deepEqual(publishSourcePaths({ ...ready, format: "stories" }), ["c/capa"])
  assert.deepEqual(
    publishSourcePaths({ format: "carousel", cover_path: "c/capa", slides: [{ image_path: "c/1" }, { image_path: null }, { image_path: "c/3" }] }),
    ["c/1", null, "c/3"]
  )
  assert.deepEqual(publishSourcePaths({ ...ready, format: "reels" }), [])
})

test("post pronto não tem impedimento", () => {
  assert.deepEqual(publishBlockers(ready, context), [])
  assert.deepEqual(publishBlockers({ ...ready, stage: "scheduled" }, context), [])
})

test("o que impede de agendar", () => {
  assert.match(publishBlockers({ ...ready, format: "reels" }, context)[0], /Reels e vídeo não publicam sozinhos/)
  assert.match(publishBlockers({ ...ready, format: "text" }, context)[0], /texto/)
  assert.match(publishBlockers({ ...ready, networks: ["linkedin"] }, context)[0], /Instagram/)
  assert.match(publishBlockers({ ...ready, stage: "client_review" }, context)[0], /Aprovado ou Agendado/)
  assert.match(publishBlockers({ ...ready, publish_time: null }, { ...context, dueAt: null })[0], /dia e o horário/)
  assert.match(publishBlockers(ready, { ...context, dueAt: now - 1 })[0], /já passou/)
  // Sem exigir o futuro (posts já na fila), o horário passado não impede.
  assert.deepEqual(publishBlockers(ready, { ...context, dueAt: now - 1, requireFuture: false }), [])
  assert.match(publishBlockers(ready, { ...context, accountConnected: false })[0], /Conecte o Instagram/)
  assert.match(publishBlockers({ ...ready, cover_path: null }, context)[0], /imagem do post/)
  assert.match(publishBlockers({ ...ready, format: "stories", cover_path: null }, context)[0], /imagem do story/)
})

test("carrossel: de 2 a 20 slides, todos com imagem", () => {
  const carousel = { ...ready, format: "carousel", slides: [{ image_path: "c/1" }, { image_path: "c/2" }] }
  assert.deepEqual(publishBlockers(carousel, context), [])
  assert.match(publishBlockers({ ...carousel, slides: [{ image_path: "c/1" }] }, context)[0], /pelo menos 2/)
  assert.match(publishBlockers({ ...carousel, slides: Array.from({ length: 21 }, (_, i) => ({ image_path: `c/${i}` })) }, context)[0], /até 20/)
  assert.match(publishBlockers({ ...carousel, slides: [{ image_path: "c/1" }, { image_path: null }] }, context)[0], /O slide 2 está sem imagem/)
  assert.match(
    publishBlockers({ ...carousel, slides: [{ image_path: null }, { image_path: "c/2" }, { image_path: null }] }, context)[0],
    /Os slides 1, 3 estão sem imagem/
  )
})

test("legenda: 2.200 caracteres, 30 hashtags, 20 menções (story não tem legenda)", () => {
  assert.equal(captionProblem(null), null)
  assert.equal(captionProblem("x".repeat(2200)), null)
  assert.match(captionProblem("x".repeat(2201)), /2201 caracteres/)
  const tags = (n) => Array.from({ length: n }, (_, i) => `#tag${i}`).join(" ")
  assert.equal(captionProblem(tags(30)), null)
  assert.match(captionProblem(tags(31)), /31 hashtags/)
  const mentions = (n) => Array.from({ length: n }, (_, i) => `@perfil${i}`).join(" ")
  assert.equal(captionProblem(mentions(20)), null)
  assert.match(captionProblem(mentions(21)), /21 perfis/)
  assert.deepEqual(captionCounts("e-mail oi@boop.com, #1 e&#39; #verão"), { hashtags: 2, mentions: 0 })
  assert.deepEqual(publishBlockers({ ...ready, format: "stories", caption: tags(40) }, context), [])
})

test("imagem: 8 MB e proporção do feed de 4:5 a 1,91:1; story aceita qualquer uma", () => {
  assert.equal(imageProblem({ width: 1080, height: 1350, bytes: 500_000 }, "image", "A capa"), null)
  assert.equal(imageProblem({ width: 1079, height: 1350, bytes: 500_000 }, "image", "A capa"), null)
  assert.equal(imageProblem({ width: 1080, height: 1080, bytes: 500_000 }, "carousel", "O slide 1"), null)
  assert.equal(imageProblem({ width: 1910, height: 1000, bytes: 500_000 }, "image", "A capa"), null)
  assert.match(imageProblem({ width: 1080, height: 1440, bytes: 500_000 }, "image", "A capa"), /^A capa está em 3:4 \(1080 × 1440\)/)
  assert.match(imageProblem({ width: 1080, height: 1920, bytes: 500_000 }, "carousel", "O slide 2"), /O slide 2 está em 9:16/)
  assert.match(imageProblem({ width: 2000, height: 1000, bytes: 500_000 }, "image", "A capa"), /2,00:1/)
  assert.equal(imageProblem({ width: 1080, height: 1920, bytes: 500_000 }, "story", "A imagem do story"), null)
  assert.match(imageProblem({ width: 1080, height: 1350, bytes: 9 * 1024 * 1024 }, "image", "A capa"), /8 MB/)
  assert.match(imageProblem({ width: 0, height: 0, bytes: 1 }, "story", "A capa"), /ler a imagem/)
})

test("URLs assinadas valem até 3 dias depois do horário", () => {
  assert.equal(urlsExpireAt(now + hour, now), now + hour + 72 * hour)
  assert.equal(urlsExpireAt(now - hour, now), now + 72 * hour)
})

test("contêineres: imagem, story e carrossel", () => {
  assert.deepEqual(containerPlan("image", ["https://a/1"], " Oi "), { children: [], parent: { image_url: "https://a/1", caption: "Oi" } })
  assert.deepEqual(containerPlan("image", ["https://a/1"], null), { children: [], parent: { image_url: "https://a/1" } })
  assert.deepEqual(containerPlan("story", ["https://a/1"], "Oi"), {
    children: [],
    parent: { image_url: "https://a/1", media_type: "STORIES" },
  })
  const carousel = containerPlan("carousel", ["https://a/1", "https://a/2"], "Oi")
  assert.deepEqual(carousel.children, [
    { image_url: "https://a/1", is_carousel_item: "true" },
    { image_url: "https://a/2", is_carousel_item: "true" },
  ])
  assert.deepEqual(withChildren(carousel.parent, ["11", "22"]), { media_type: "CAROUSEL", caption: "Oi", children: "11,22" })
})

test("respostas da Meta", () => {
  assert.equal(parseContainerStatus({ status_code: "FINISHED", id: "1" }), "FINISHED")
  assert.equal(parseContainerStatus({ status_code: "IN_PROGRESS" }), "IN_PROGRESS")
  assert.equal(parseContainerStatus({ status_code: "outro" }), null)
  assert.equal(parseContainerStatus(null), null)
  assert.equal(parseId({ id: "17889455560051444" }), "17889455560051444")
  assert.equal(parseId({ id: 123 }), "123")
  assert.equal(parseId({ id: "abc" }), null)
  assert.deepEqual(parsePublishingLimit({ data: [{ quota_usage: 2, config: { quota_total: 50, quota_duration: 86400 } }] }), {
    usage: 2,
    total: 50,
  })
  assert.equal(parsePublishingLimit({ data: [] }), null)
  assert.equal(parsePermalink({ permalink: "https://www.instagram.com/p/ABC123/" }), "https://www.instagram.com/p/ABC123/")
  assert.equal(parsePermalink({ permalink: "https://exemplo.com/p/1" }), null)
  assert.equal(parsePermalink({}), null)
})

test("contêiner guardado serve por até 23 h", () => {
  assert.equal(canReuseContainer(null, now), false)
  assert.equal(canReuseContainer(new Date(now - 22 * hour).toISOString(), now), true)
  assert.equal(canReuseContainer(new Date(now - 23 * hour).toISOString(), now), false)
})
