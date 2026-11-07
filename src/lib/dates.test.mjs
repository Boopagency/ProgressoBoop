// Regras de data (src/lib/dates.ts). Roda com:
//   node --test src/lib/dates.test.mjs
import assert from "node:assert/strict"
import { test } from "node:test"

import { load } from "../features/finance/test-setup.mjs"

const { addBusinessDays } = await load("@/lib/dates")

test("addBusinessDays pula sábado e domingo", () => {
  // 2026-11-09 é segunda; 2026-11-13, sexta.
  assert.equal(addBusinessDays("2026-11-09", 5), "2026-11-16")
  assert.equal(addBusinessDays("2026-11-09", 4), "2026-11-13")
  assert.equal(addBusinessDays("2026-11-13", 1), "2026-11-16")
  assert.equal(addBusinessDays("2026-11-11", 5), "2026-11-18")
})

test("addBusinessDays a partir do fim de semana conta da segunda", () => {
  // Sábado 2026-11-07 e domingo 2026-11-08.
  assert.equal(addBusinessDays("2026-11-07", 1), "2026-11-09")
  assert.equal(addBusinessDays("2026-11-07", 5), "2026-11-13")
  assert.equal(addBusinessDays("2026-11-08", 5), "2026-11-13")
})

test("addBusinessDays com zero, para trás e virando o mês e o ano", () => {
  assert.equal(addBusinessDays("2026-11-07", 0), "2026-11-07")
  assert.equal(addBusinessDays("2026-11-16", -1), "2026-11-13")
  assert.equal(addBusinessDays("2026-11-27", 5), "2026-12-04")
  assert.equal(addBusinessDays("2026-12-28", 5), "2027-01-04")
  // Fevereiro de ano bissexto.
  assert.equal(addBusinessDays("2028-02-25", 3), "2028-03-01")
})
