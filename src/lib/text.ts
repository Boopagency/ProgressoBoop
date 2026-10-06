/**
 * Comparação de texto sem acento e sem diferença entre maiúsculas e
 * minúsculas ("reuniao" encontra "Reunião").
 */

function foldChar(char: string): string {
  const folded = char.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase()
  if (folded.length === 1) return folded
  const lower = char.toLowerCase()
  return lower.length === 1 ? lower : char
}

/**
 * Versão "dobrada" do texto, com o mesmo tamanho do original: a posição de
 * cada caractere se mantém, então dá para destacar o trecho encontrado no
 * texto original.
 */
export function foldText(text: string): string {
  let folded = ""
  for (let index = 0; index < text.length; index += 1) folded += foldChar(text[index]!)
  return folded
}

export function includesText(text: string, query: string): boolean {
  const needle = foldText(query.trim())
  return needle.length > 0 && foldText(text).includes(needle)
}

export interface TextMatch {
  start: number
  end: number
}

/** Ocorrências da busca no texto (sem sobreposição), em ordem. */
export function findMatches(text: string, query: string, limit = 500): TextMatch[] {
  const needle = foldText(query.trim())
  if (!needle) return []
  const haystack = foldText(text)
  const matches: TextMatch[] = []
  let from = 0
  while (matches.length < limit) {
    const start = haystack.indexOf(needle, from)
    if (start === -1) break
    matches.push({ start, end: start + needle.length })
    from = start + needle.length
  }
  return matches
}

export function countWords(text: string): number {
  const words = text.trim().match(/\S+/g)
  return words ? words.length : 0
}
