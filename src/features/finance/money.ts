/*
 * Dinheiro em centavos (inteiros), mostrado em reais no formato brasileiro.
 */

const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" })
const compact = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })

/** 350000 → "R$ 3.500,00". */
export function formatMoney(cents: number): string {
  return currency.format(cents / 100).replace(/ /g, " ")
}

/** 350000 → "R$ 3.500" (sem centavos, para resumos). */
export function formatMoneyShort(cents: number): string {
  return compact.format(Math.round(cents / 100)).replace(/ /g, " ")
}

/**
 * Valor digitado → centavos. Aceita "3500", "3.500", "3.500,50", "3500,5",
 * "R$ 3.500,00" e também "3500.50" (ponto como decimal quando só há um e ele
 * separa até dois dígitos). Devolve null se não for um valor positivo.
 */
export function parseMoney(text: string): number | null {
  const clean = text.replace(/[R$\s]/g, "")
  if (!/^[\d.,]+$/.test(clean)) return null
  let normalized: string
  if (clean.includes(",")) {
    normalized = clean.replace(/\./g, "").replace(",", ".")
  } else {
    const parts = clean.split(".")
    normalized = parts.length === 2 && parts[1]!.length <= 2 ? clean : clean.replace(/\./g, "")
  }
  if (!/^\d+(\.\d{0,2})?$/.test(normalized)) return null
  const cents = Math.round(Number(normalized) * 100)
  return Number.isFinite(cents) && cents > 0 ? cents : null
}

/** Centavos → texto para editar ("3.500,00"). */
export function moneyInputValue(cents: number): string {
  return (cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}
