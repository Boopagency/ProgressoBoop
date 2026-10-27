// Teste das regras da conexão com o Instagram (sem dependências):
//   node --test src/features/instagram/logic.test.mjs
import assert from "node:assert/strict"
import { createHmac } from "node:crypto"
import { test } from "node:test"

import {
  authorizeUrl,
  cleanCode,
  connectNotice,
  deletionCode,
  missingScopes,
  parseLongToken,
  parsePermissions,
  parseProfile,
  parseShortToken,
  parseSignedRequest,
  professionalAccountType,
  readDeletionCode,
  returnPath,
  signState,
  stateKey,
  verifyState,
} from "./logic.ts"

const key = stateKey("segredo-de-teste")
const now = Date.UTC(2026, 9, 27, 12)
const payload = {
  userId: "11111111-1111-4111-8111-111111111111",
  clientId: "22222222-2222-4222-8222-222222222222",
  origin: "portal",
  nonce: "abc",
  expiresAt: now + 60_000,
}

test("state assinado volta igual dentro da validade", () => {
  const state = signState(payload, key)
  assert.deepEqual(verifyState(state, key, now), { ok: true, payload })
})

test("state vencido é recusado", () => {
  const state = signState(payload, key)
  assert.deepEqual(verifyState(state, key, now + 60_000), { ok: false, reason: "expired", payload })
})

test("state com outra chave ou mexido é recusado", () => {
  const state = signState(payload, key)
  assert.equal(verifyState(state, stateKey("outra"), now).ok, false)
  const [body, mac] = state.split(".")
  const forged = Buffer.from(JSON.stringify({ u: payload.userId, c: "33333333-3333-4333-8333-333333333333", o: "admin", n: "abc", x: payload.expiresAt })).toString("base64url")
  assert.deepEqual(verifyState(`${forged}.${mac}`, key, now), { ok: false, reason: "signature" })
  assert.deepEqual(verifyState(`${body}`, key, now), { ok: false, reason: "malformed" })
  assert.deepEqual(verifyState("", key, now), { ok: false, reason: "malformed" })
})

test("autorização pede leitura, publicação e métricas de uma vez", () => {
  const url = new URL(authorizeUrl({ appId: "123", redirectUri: "https://admin.deumboop.com.br/api/instagram/callback", state: "s" }))
  assert.equal(url.origin + url.pathname, "https://www.instagram.com/oauth/authorize")
  assert.equal(url.searchParams.get("scope"), "instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights")
  assert.equal(url.searchParams.get("response_type"), "code")
  assert.equal(url.searchParams.get("redirect_uri"), "https://admin.deumboop.com.br/api/instagram/callback")
})

test("código sem o #_ do fim", () => {
  assert.equal(cleanCode("AQBx#_"), "AQBx")
  assert.equal(cleanCode("AQBx"), "AQBx")
})

test("só conta profissional passa", () => {
  assert.equal(professionalAccountType("BUSINESS"), "business")
  assert.equal(professionalAccountType("Media_Creator"), "media_creator")
  assert.equal(professionalAccountType("PERSONAL"), null)
  assert.equal(professionalAccountType(undefined), null)
})

test("respostas da Meta nos dois formatos", () => {
  assert.deepEqual(parseShortToken({ access_token: "t", user_id: 1789, permissions: ["instagram_business_basic"] }), {
    accessToken: "t",
    userId: "1789",
    permissions: ["instagram_business_basic"],
  })
  assert.deepEqual(parseShortToken({ data: [{ access_token: "t", user_id: "9", permissions: "a,b" }] }), {
    accessToken: "t",
    userId: "9",
    permissions: ["a", "b"],
  })
  assert.equal(parseShortToken({ error_message: "x" }), null)
  assert.deepEqual(parseLongToken({ access_token: "L", token_type: "bearer", expires_in: 5183944 }), { accessToken: "L", expiresIn: 5183944 })
  assert.equal(parseLongToken({ access_token: "L" }), null)
  assert.deepEqual(parsePermissions("a, b,a"), ["a", "b"])
  assert.deepEqual(missingScopes(["instagram_business_basic"]), ["instagram_business_content_publish", "instagram_business_manage_insights"])
})

test("perfil do /me", () => {
  assert.deepEqual(
    parseProfile({ user_id: "1784", username: "boop.agencia", name: " Boop ", account_type: "Business", profile_picture_url: "https://cdn/x.jpg" }),
    { userId: "1784", appUserId: null, username: "boop.agencia", name: "Boop", accountType: "business", pictureUrl: "https://cdn/x.jpg" }
  )
  assert.equal(parseProfile({ user_id: "1", username: "nome com espaço" }), null)
})

test("avisos e volta para a tela de origem", () => {
  assert.equal(connectNotice("conectado")?.tone, "success")
  assert.equal(connectNotice("qualquer"), null)
  assert.equal(returnPath("admin", "c1", "pessoal"), "/clientes/c1?instagram=pessoal#instagram")
  assert.equal(returnPath("portal", "c1", "conectado"), "/portal/feed?instagram=conectado&cliente=c1")
})

test("signed_request da Meta: assinatura com a chave do app", () => {
  const payload = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", issued_at: 1, user_id: "218471" })).toString("base64url")
  const sig = createHmac("sha256", "chave-do-app").update(payload).digest("base64url")
  assert.deepEqual(parseSignedRequest(`${sig}.${payload}`, "chave-do-app"), { userId: "218471" })
  assert.equal(parseSignedRequest(`${sig}.${payload}`, "outra-chave"), null)
  const other = Buffer.from(JSON.stringify({ algorithm: "HMAC-SHA256", user_id: "999" })).toString("base64url")
  assert.equal(parseSignedRequest(`${sig}.${other}`, "chave-do-app"), null)
  assert.equal(parseSignedRequest(undefined, "chave-do-app"), null)
})

test("código da exclusão de dados é reconhecido só com a mesma chave", () => {
  const at = Date.UTC(2026, 9, 27, 15, 0, 0)
  const code = deletionCode(at, key)
  assert.match(code, /^[0-9a-z]+$/)
  assert.equal(readDeletionCode(code, key), at)
  assert.equal(readDeletionCode(code, stateKey("outra")), null)
  assert.equal(readDeletionCode(`${code.slice(0, -1)}0`=== code ? `${code.slice(0, -1)}1` : `${code.slice(0, -1)}0`, key), null)
})
