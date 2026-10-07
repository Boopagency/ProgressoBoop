/*
 * Seções dos relatórios (Excel e página para apresentar).
 */

export const REPORT_SECTIONS = [
  "indicadores",
  "dre",
  "projecao",
  "contratos",
  "lancamentos",
  "comercial",
  "operacional",
  "metas",
] as const

export type ReportSection = (typeof REPORT_SECTIONS)[number]

export const REPORT_SECTION_LABEL: Record<ReportSection, string> = {
  indicadores: "Indicadores",
  dre: "DRE",
  projecao: "Projeção e divisão do resultado",
  contratos: "Contratos e margem por cliente",
  lancamentos: "Lançamentos",
  comercial: "Comercial (negócios)",
  operacional: "Operação (tarefas e projetos)",
  metas: "Metas",
}

export const REPORT_SECTION_HINT: Record<ReportSection, string> = {
  indicadores: "Os números do período, a comparação e como cada um é calculado.",
  dre: "Mês a mês, no regime de caixa, com as fórmulas da planilha.",
  projecao: "Próximos 12 meses: MRR, resultado, caixa e pró-labore.",
  contratos: "MRR, custos diretos e margem de cada cliente; todas as recorrências.",
  lancamentos: "Extrato do período (pago, a vencer e vencido).",
  comercial: "Negócios abertos e fechados no período, com valor ponderado.",
  operacional: "Tarefas concluídas, entregas no prazo e projetos.",
  metas: "Objetivos e resultados-chave com o progresso.",
}

export function parseSections(value: unknown): ReportSection[] {
  const raw = Array.isArray(value) ? value[0] : value
  if (typeof raw !== "string") return [...REPORT_SECTIONS]
  const chosen = raw.split(",").filter((item): item is ReportSection => (REPORT_SECTIONS as readonly string[]).includes(item))
  return chosen.length > 0 ? REPORT_SECTIONS.filter((section) => chosen.includes(section)) : [...REPORT_SECTIONS]
}
