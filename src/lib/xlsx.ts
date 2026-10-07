/*
 * Planilha Excel (.xlsx) sem dependências: XML do Office Open + ZIP sem
 * compressão. Suficiente para as exportações do Boop Admin: várias abas,
 * cabeçalho congelado com filtro, larguras, formatos de dinheiro, percentual
 * e data, e fórmulas (com o valor já calculado, para quem só lê).
 *
 * Formatos seguem a planilha financeira da Boop: R$ com negativo em vermelho
 * e traço no zero; percentuais guardados como fração (0,15 = 15%).
 */

export type CellFormat = "text" | "money" | "percent" | "date" | "integer" | "decimal"

export interface Cell {
  /** Texto, número ou data (yyyy-MM-dd) — dinheiro em reais, percentual em fração. */
  value: string | number | null
  format?: CellFormat
  /** Fórmula sem o "=" (ex.: "SUM(B2:B9)"); `value` vira o resultado já calculado. */
  formula?: string
  bold?: boolean
  /** Premissa que dá para mudar (fonte azul): as fórmulas usam esta célula. */
  input?: boolean
}

export type CellInput = Cell | string | number | null

export interface Column {
  header: string
  /** Largura em caracteres. */
  width?: number
  format?: CellFormat
}

export interface Sheet {
  /** Até 31 caracteres, sem []:*?/\ */
  name: string
  /** Linhas acima da tabela (título, período, observações). */
  intro?: string[]
  columns: Column[]
  rows: CellInput[][]
  /** Linha de totais (em negrito) logo abaixo dos dados. */
  totals?: CellInput[]
  /** Notas abaixo da tabela. */
  notes?: string[]
}

/* ------------------------------------------------------------------ */
/* Endereços                                                           */
/* ------------------------------------------------------------------ */

export function columnLetter(index: number): string {
  let n = index + 1
  let letters = ""
  while (n > 0) {
    const rest = (n - 1) % 26
    letters = String.fromCharCode(65 + rest) + letters
    n = Math.floor((n - 1) / 26)
  }
  return letters
}

export function cellRef(column: number, row: number): string {
  return `${columnLetter(column)}${row}`
}

/* ------------------------------------------------------------------ */
/* XML                                                                 */
/* ------------------------------------------------------------------ */

function escapeXml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    // Caracteres de controle não são válidos em XML 1.0.
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
}

/** Dias desde 30/12/1899 (data serial do Excel). */
function excelDate(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return null
  const [year, month, date] = day.split("-").map(Number)
  const utc = Date.UTC(year!, month! - 1, date!)
  return Math.round((utc - Date.UTC(1899, 11, 30)) / 86_400_000)
}

/*
 * Estilos (índice em cellXfs):
 * 0 normal · 1 cabeçalho · 2 dinheiro · 3 percentual · 4 data · 5 inteiro ·
 * 6 decimal · 7 título · 8 dinheiro negrito · 9 percentual negrito ·
 * 10 texto negrito · 11 inteiro negrito · 12 decimal negrito · 13 nota ·
 * 14–17 premissas (fonte azul: dinheiro, percentual, inteiro, data)
 */
const STYLE: Record<CellFormat, number> = { text: 0, money: 2, percent: 3, date: 4, integer: 5, decimal: 6 }
const BOLD_STYLE: Record<CellFormat, number> = { text: 10, money: 8, percent: 9, date: 4, integer: 11, decimal: 12 }
const INPUT_STYLE: Partial<Record<CellFormat, number>> = { money: 14, percent: 15, integer: 16, date: 17 }

const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4">
<numFmt numFmtId="164" formatCode="&quot;R$ &quot;#,##0.00;[Red]&quot;-R$ &quot;#,##0.00;&quot;–&quot;"/>
<numFmt numFmtId="165" formatCode="0.0%;[Red]-0.0%;&quot;–&quot;"/>
<numFmt numFmtId="166" formatCode="dd/mm/yyyy"/>
<numFmt numFmtId="167" formatCode="#,##0.0"/>
</numFmts>
<fonts count="5">
<font><sz val="10"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="10"/><name val="Arial"/><family val="2"/></font>
<font><b/><sz val="13"/><name val="Arial"/><family val="2"/></font>
<font><i/><sz val="9"/><color rgb="FF6B6B6B"/><name val="Arial"/><family val="2"/></font>
<font><sz val="10"/><color rgb="FF0000FF"/><name val="Arial"/><family val="2"/></font>
</fonts>
<fills count="3">
<fill><patternFill patternType="none"/></fill>
<fill><patternFill patternType="gray125"/></fill>
<fill><patternFill patternType="solid"><fgColor rgb="FFEFEFEC"/><bgColor indexed="64"/></patternFill></fill>
</fills>
<borders count="2">
<border><left/><right/><top/><bottom/><diagonal/></border>
<border><left/><right/><top/><bottom style="thin"><color rgb="FFBFBFBF"/></bottom><diagonal/></border>
</borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="18">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="3" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="2" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="3" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="167" fontId="1" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="0" fontId="3" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="165" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="3" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
<xf numFmtId="166" fontId="4" fillId="0" borderId="0" xfId="0" applyNumberFormat="1" applyFont="1"/>
</cellXfs>
<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
</styleSheet>`

function normalize(input: CellInput, column: Column | undefined): Cell {
  if (input === null || typeof input !== "object") return { value: input, format: column?.format }
  return { ...input, format: input.format ?? column?.format }
}

function cellXml(cell: Cell, ref: string, style?: number): string {
  const format = cell.format ?? "text"
  const s = style ?? (cell.input ? (INPUT_STYLE[format] ?? STYLE[format]) : cell.bold ? BOLD_STYLE[format] : STYLE[format])
  const styleAttr = s ? ` s="${s}"` : ""
  if (cell.formula) {
    const cached = typeof cell.value === "number" && Number.isFinite(cell.value) ? `<v>${cell.value}</v>` : ""
    return `<c r="${ref}"${styleAttr}><f>${escapeXml(cell.formula)}</f>${cached}</c>`
  }
  if (cell.value === null || cell.value === undefined || cell.value === "") return s ? `<c r="${ref}"${styleAttr}/>` : ""
  if (format === "date" && typeof cell.value === "string") {
    const serial = excelDate(cell.value)
    if (serial !== null) return `<c r="${ref}"${styleAttr}><v>${serial}</v></c>`
  }
  if (typeof cell.value === "number") {
    return Number.isFinite(cell.value) ? `<c r="${ref}"${styleAttr}><v>${cell.value}</v></c>` : ""
  }
  // Como o Excel: xml:space só quando há espaço nas pontas.
  const space = /^\s|\s$/.test(cell.value) ? ' xml:space="preserve"' : ""
  return `<c r="${ref}" t="inlineStr"${styleAttr}><is><t${space}>${escapeXml(cell.value)}</t></is></c>`
}

function sheetXml(sheet: Sheet): string {
  const rows: string[] = []
  let rowNumber = 1
  for (const [position, line] of (sheet.intro ?? []).entries()) {
    rows.push(`<row r="${rowNumber}">${cellXml({ value: line }, cellRef(0, rowNumber), position === 0 ? 7 : 13)}</row>`)
    rowNumber += 1
  }
  if (sheet.intro && sheet.intro.length > 0) rowNumber += 1
  const headerRow = rowNumber
  rows.push(
    `<row r="${headerRow}">${sheet.columns.map((column, index) => cellXml({ value: column.header }, cellRef(index, headerRow), 1)).join("")}</row>`
  )
  rowNumber += 1
  for (const line of sheet.rows) {
    const cells = line.map((input, index) => cellXml(normalize(input, sheet.columns[index]), cellRef(index, rowNumber))).join("")
    rows.push(`<row r="${rowNumber}">${cells}</row>`)
    rowNumber += 1
  }
  const lastDataRow = rowNumber - 1
  if (sheet.totals) {
    const cells = sheet.totals
      .map((input, index) => {
        const cell = normalize(input, sheet.columns[index])
        return cellXml({ ...cell, bold: true }, cellRef(index, rowNumber))
      })
      .join("")
    rows.push(`<row r="${rowNumber}">${cells}</row>`)
    rowNumber += 1
  }
  if (sheet.notes && sheet.notes.length > 0) {
    rowNumber += 1
    for (const note of sheet.notes) {
      rows.push(`<row r="${rowNumber}">${cellXml({ value: note }, cellRef(0, rowNumber), 13)}</row>`)
      rowNumber += 1
    }
  }
  const lastColumn = columnLetter(Math.max(0, sheet.columns.length - 1))
  const cols = sheet.columns
    .map((column, index) => `<col min="${index + 1}" max="${index + 1}" width="${column.width ?? 14}" customWidth="1"/>`)
    .join("")
  const filter = sheet.rows.length > 0 ? `<autoFilter ref="A${headerRow}:${lastColumn}${lastDataRow}"/>` : ""
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<sheetViews><sheetView workbookViewId="0"><pane ySplit="${headerRow}" topLeftCell="A${headerRow + 1}" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>
<sheetFormatPr defaultRowHeight="13"/>
<cols>${cols}</cols>
<sheetData>${rows.join("")}</sheetData>
${filter}
<pageMargins left="0.5" right="0.5" top="0.6" bottom="0.6" header="0.3" footer="0.3"/>
<pageSetup orientation="landscape" fitToWidth="1" fitToHeight="0"/>
</worksheet>`
}

/** Primeira linha de dados de uma aba (para montar fórmulas que apontam para ela). */
export function firstDataRow(sheet: Pick<Sheet, "intro">): number {
  const intro = sheet.intro?.length ?? 0
  return intro > 0 ? intro + 3 : 2
}

function sheetName(name: string, used: Set<string>): string {
  let clean = name.replace(/[[\]:*?/\\]/g, " ").trim().slice(0, 31) || "Aba"
  let suffix = 2
  while (used.has(clean.toLowerCase())) {
    const tail = ` ${suffix}`
    clean = `${clean.slice(0, 31 - tail.length)}${tail}`
    suffix += 1
  }
  used.add(clean.toLowerCase())
  return clean
}

/* ------------------------------------------------------------------ */
/* ZIP (sem compressão)                                                */
/* ------------------------------------------------------------------ */

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let n = 0; n < 256; n += 1) {
    let c = n
    for (let k = 0; k < 8; k += 1) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c >>> 0
  }
  return table
})()

function crc32(data: Uint8Array): number {
  let crc = 0xffffffff
  for (const byte of data) crc = CRC_TABLE[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}

function zip(files: { name: string; content: string }[]): Uint8Array {
  const encoder = new TextEncoder()
  const parts: Uint8Array[] = []
  const central: Uint8Array[] = []
  let offset = 0
  // 01/01/2026 00:00 no formato do DOS (data e hora fixas: o arquivo é reproduzível).
  const dosTime = 0
  const dosDate = ((2026 - 1980) << 9) | (1 << 5) | 1
  for (const file of files) {
    const name = encoder.encode(file.name)
    const data = encoder.encode(file.content)
    const crc = crc32(data)
    const local = new Uint8Array(30 + name.length)
    const view = new DataView(local.buffer)
    view.setUint32(0, 0x04034b50, true)
    view.setUint16(4, 20, true)
    view.setUint16(6, 0x0800, true)
    view.setUint16(8, 0, true)
    view.setUint16(10, dosTime, true)
    view.setUint16(12, dosDate, true)
    view.setUint32(14, crc, true)
    view.setUint32(18, data.length, true)
    view.setUint32(22, data.length, true)
    view.setUint16(26, name.length, true)
    view.setUint16(28, 0, true)
    local.set(name, 30)
    parts.push(local, data)

    const entry = new Uint8Array(46 + name.length)
    const centralView = new DataView(entry.buffer)
    centralView.setUint32(0, 0x02014b50, true)
    centralView.setUint16(4, 20, true)
    centralView.setUint16(6, 20, true)
    centralView.setUint16(8, 0x0800, true)
    centralView.setUint16(10, 0, true)
    centralView.setUint16(12, dosTime, true)
    centralView.setUint16(14, dosDate, true)
    centralView.setUint32(16, crc, true)
    centralView.setUint32(20, data.length, true)
    centralView.setUint32(24, data.length, true)
    centralView.setUint16(28, name.length, true)
    centralView.setUint32(42, offset, true)
    entry.set(name, 46)
    central.push(entry)
    offset += local.length + data.length
  }
  const centralSize = central.reduce((sum, entry) => sum + entry.length, 0)
  const end = new Uint8Array(22)
  const endView = new DataView(end.buffer)
  endView.setUint32(0, 0x06054b50, true)
  endView.setUint16(8, files.length, true)
  endView.setUint16(10, files.length, true)
  endView.setUint32(12, centralSize, true)
  endView.setUint32(16, offset, true)
  const total = offset + centralSize + end.length
  const out = new Uint8Array(total)
  let position = 0
  for (const part of [...parts, ...central, end]) {
    out.set(part, position)
    position += part.length
  }
  return out
}

/* ------------------------------------------------------------------ */
/* Pasta de trabalho                                                   */
/* ------------------------------------------------------------------ */

export function buildWorkbook(sheets: Sheet[], meta: { title: string; author?: string }): Uint8Array {
  const used = new Set<string>()
  const named = sheets.map((sheet) => ({ ...sheet, name: sheetName(sheet.name, used) }))
  const now = new Date().toISOString().replace(/\.\d{3}Z$/, "Z")
  const files = [
    {
      name: "[Content_Types].xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
<Default Extension="xml" ContentType="application/xml"/>
<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
<Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
${named.map((_, index) => `<Override PartName="/xl/worksheets/sheet${index + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join("\n")}
</Types>`,
    },
    {
      name: "_rels/.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
<Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
</Relationships>`,
    },
    {
      name: "docProps/core.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
<dc:title>${escapeXml(meta.title)}</dc:title>
<dc:creator>${escapeXml(meta.author ?? "Boop Admin")}</dc:creator>
<dcterms:created xsi:type="dcterms:W3CDTF">${now}</dcterms:created>
</cp:coreProperties>`,
    },
    {
      name: "xl/workbook.xml",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
<bookViews><workbookView/></bookViews>
<sheets>${named.map((sheet, index) => `<sheet name="${escapeXml(sheet.name)}" sheetId="${index + 1}" r:id="rId${index + 1}"/>`).join("")}</sheets>
<calcPr calcId="191029" fullCalcOnLoad="1"/>
</workbook>`,
    },
    {
      name: "xl/_rels/workbook.xml.rels",
      content: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
${named.map((_, index) => `<Relationship Id="rId${index + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${index + 1}.xml"/>`).join("\n")}
<Relationship Id="rId${named.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>`,
    },
    { name: "xl/styles.xml", content: STYLES_XML },
    ...named.map((sheet, index) => ({ name: `xl/worksheets/sheet${index + 1}.xml`, content: sheetXml(sheet) })),
  ]
  return zip(files)
}
