import type { BriefingFile, PaletteValue } from "@/features/briefing/flow-logic"

/*
 * Identidade visual de verdade de dois clientes que a Boop já atende, para a
 * vitrine de "a Boop preenche o que já sabe" (só a vitrine; nada vem do
 * banco). Tirada dos repositórios públicos dos sites:
 *
 *   Velmont   — Boopagency/Velmont: docs/design-system.md (tokens de cor),
 *               public/images/velmont-logo*.webp, public/fonts (Manrope e
 *               Instrument Serif).
 *   Bárbara   — Boopagency/Barbara: Barbara/Brand/*.png e *.svg (logo e
 *               símbolo), site/styles.css (a paleta), site/assets/fonts
 *               (Parkinsans e Onest).
 *
 * Os logos ficam como imagem estática da vitrine em
 * public/vitrine/briefing-preencher/.
 */

export type VitrineBrand = "velmont" | "barbara"

export interface VitrineBrandData {
  name: string
  palette: PaletteValue
  /** Arquivos como a resposta guarda (o caminho é montado na pasta do briefing). */
  files: (Omit<BriefingFile, "path"> & { file: string })[]
}

const ASSETS = "/vitrine/briefing-preencher"

export const VITRINE_BRANDS: Record<VitrineBrand, VitrineBrandData> = {
  velmont: {
    name: "Velmont",
    // docs/design-system.md, "Tokens": fundo, vinho, superfície, ink, marfim, champagne e texto secundário.
    palette: { use: ["#210b12", "#3d101e", "#32151e", "#160b0f", "#f4efe6", "#ddc5a1", "#c1b1b1"], avoid: [] },
    files: [
      { file: "velmont-logo.webp", name: "velmont-logo.webp", mime_type: "image/webp", size_bytes: 66_140 },
      { file: "manrope-latin.woff2", name: "manrope-latin.woff2", mime_type: "font/woff2", size_bytes: 29_332 },
      { file: "instrument-serif-latin.woff2", name: "instrument-serif-latin.woff2", mime_type: "font/woff2", size_bytes: 23_884 },
    ],
  },
  barbara: {
    name: "Bárbara Fonseca",
    // site/styles.css: ameixa, ameixa-ink, creme, areia, sálvia, sálvia-700 e ink.
    palette: { use: ["#653a47", "#3b1e28", "#f7f0e4", "#efe4d3", "#a0ad90", "#56634a", "#2c1820"], avoid: [] },
    files: [
      { file: "barbara-fonseca-logo.webp", name: "Ameixa sobre Creme.png", mime_type: "image/png", size_bytes: 42_353 },
      { file: "barbara-fonseca-simbolo.svg", name: "Logo #612A3A.svg", mime_type: "image/svg+xml", size_bytes: 5_787 },
      { file: "Parkinsans-latin.woff2", name: "Parkinsans-latin.woff2", mime_type: "font/woff2", size_bytes: 28_276 },
      { file: "Onest-latin.woff2", name: "Onest-latin.woff2", mime_type: "font/woff2", size_bytes: 33_760 },
    ],
  },
}

export function isVitrineBrand(value: unknown): value is VitrineBrand {
  return value === "velmont" || value === "barbara"
}

/** Os arquivos da marca dentro de uma pasta de briefing ("<cliente>/<briefing>/files/…"). */
export function brandFiles(brand: VitrineBrand, folder: string): BriefingFile[] {
  return VITRINE_BRANDS[brand].files.map(({ file, ...rest }) => ({ ...rest, path: `${folder}/files/${file}` }))
}

/** Imagem estática da vitrine no lugar do bucket (logo e símbolo); fonte não abre. */
export function brandFileUrl(path: string): string {
  const name = path.split("/").pop() ?? ""
  return /\.(webp|svg)$/.test(name) ? `${ASSETS}/${name}` : "#"
}
