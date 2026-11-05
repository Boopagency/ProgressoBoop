import Link from "next/link"

import { PageBody, PageContainer, PageHeader } from "@/components/layout/page"

const SCREENS = [
  { href: "/vitrine/admin-c/indicadores", label: "Indicadores", hint: "visão geral; ?area=financeiro, comercial ou operacional" },
  { href: "/vitrine/admin-c/metas", label: "Metas", hint: "objetivos e resultados-chave" },
  { href: "/vitrine/admin-c/financeiro", label: "Financeiro", hint: "Mês, DRE, Projeção, Contratos, Lançamentos, Fechamento e Parâmetros" },
  { href: "/vitrine/admin-c/relatorios", label: "Relatórios", hint: "a montagem" },
  { href: "/vitrine/admin-c/relatorio", label: "Relatório", hint: "a página de apresentar e imprimir" },
  { href: "/vitrine/admin-c/decisoes", label: "Decisões", hint: "registro com busca e filtros" },
  { href: "/vitrine/admin-c/processos", label: "Processos", hint: "a biblioteca" },
  { href: "/vitrine/admin-c/processos/documento", label: "Processo", hint: "a página do documento, com o editor" },
]

/** Índice das telas de gestão (lote 2C) montadas com dados de exemplo. */
export default function VitrineGestaoPage() {
  return (
    <PageContainer>
      <PageHeader title={<>Telas de <em>gestão</em></>} description="Lote 2C da repaginada, com dados de exemplo" />
      <PageBody width="reading">
        <ul className="grid gap-3 sm:grid-cols-2">
          {SCREENS.map((screen) => (
            <li key={screen.href}>
              <Link href={screen.href} className="block rounded-2xl border bg-card px-5 py-4 transition-shadow hover:shadow-float">
                <span className="block font-display text-[15px] font-medium text-foreground">{screen.label}</span>
                <span className="mt-0.5 block text-xs text-muted-foreground">{screen.hint}</span>
              </Link>
            </li>
          ))}
        </ul>
      </PageBody>
    </PageContainer>
  )
}
