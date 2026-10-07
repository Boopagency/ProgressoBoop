import type { TaskArea } from "@/lib/types"

/**
 * Modelos de projeto: as tarefas que todo projeto daquele tipo tem, com o
 * prazo em dias depois do começo. Para um modelo próprio da Boop, crie um
 * checklist em Processos (ou use um projeto anterior): os dois também servem
 * de ponto de partida no "Novo projeto".
 */

export interface ProjectTemplateTask {
  title: string
  /** Dias depois do começo do projeto. */
  offset: number
  area?: TaskArea
}

export interface ProjectTemplate {
  key: string
  name: string
  description: string
  area: TaskArea
  /** Duração sugerida (define o prazo do projeto). */
  durationDays: number
  /** Projeto de cliente (o modelo interno não pede cliente). */
  forClient: boolean
  tasks: ProjectTemplateTask[]
}

export const PROJECT_TEMPLATES: ProjectTemplate[] = [
  {
    key: "site",
    name: "Site institucional",
    description: "Do briefing à publicação, com aprovações do cliente.",
    area: "technology",
    durationDays: 45,
    forClient: true,
    tasks: [
      { title: "Kickoff com o cliente e briefing", offset: 0, area: "clients" },
      { title: "Coletar acessos: domínio, hospedagem e redes", offset: 2 },
      { title: "Mapa do site e lista de páginas aprovados", offset: 5, area: "clients" },
      { title: "Textos das páginas (rascunho)", offset: 10, area: "brand" },
      { title: "Layout da home", offset: 12, area: "brand" },
      { title: "Aprovação do layout da home pelo cliente", offset: 15, area: "clients" },
      { title: "Layout das páginas internas", offset: 20, area: "brand" },
      { title: "Desenvolvimento das páginas", offset: 30 },
      { title: "Formulários, WhatsApp e integrações", offset: 32 },
      { title: "SEO básico: títulos, descrições e Search Console", offset: 34 },
      { title: "QA: celular, velocidade e links", offset: 36 },
      { title: "Revisão final com o cliente", offset: 38, area: "clients" },
      { title: "Publicação e redirecionamentos", offset: 40 },
      { title: "Treinamento e entrega dos acessos", offset: 42, area: "clients" },
      { title: "Case no portfólio da Boop", offset: 45, area: "brand" },
    ],
  },
  {
    key: "identity",
    name: "Identidade visual",
    description: "Conceito, logo, aplicações e manual de marca.",
    area: "brand",
    durationDays: 30,
    forClient: true,
    tasks: [
      { title: "Briefing e referências com o cliente", offset: 0, area: "clients" },
      { title: "Pesquisa de concorrentes e mercado", offset: 3 },
      { title: "Conceito e moodboard", offset: 6 },
      { title: "Aprovação do conceito pelo cliente", offset: 8, area: "clients" },
      { title: "Proposta de logo (dois caminhos)", offset: 13 },
      { title: "Ajustes do logo", offset: 17 },
      { title: "Paleta, tipografia e elementos de apoio", offset: 21 },
      { title: "Aplicações: redes, papelaria e fachada", offset: 25 },
      { title: "Manual de marca", offset: 28 },
      { title: "Entrega dos arquivos finais", offset: 30, area: "clients" },
    ],
  },
  {
    key: "social",
    name: "Social media — implantação",
    description: "Primeiro mês de um cliente novo de redes sociais.",
    area: "clients",
    durationDays: 30,
    forClient: true,
    tasks: [
      { title: "Briefing: tom de voz, público e objetivos", offset: 0 },
      { title: "Acessos às contas e ao Meta Business", offset: 1 },
      { title: "Diagnóstico dos perfis atuais", offset: 3 },
      { title: "Linha editorial e pilares de conteúdo", offset: 6, area: "brand" },
      { title: "Ajustes de bio, destaques e capa", offset: 7 },
      { title: "Calendário do primeiro mês", offset: 9 },
      { title: "Aprovação do calendário pelo cliente", offset: 11 },
      { title: "Produção dos posts da primeira quinzena", offset: 14, area: "brand" },
      { title: "Primeiras publicações", offset: 15 },
      { title: "Relatório do primeiro mês", offset: 30 },
    ],
  },
  {
    key: "traffic",
    name: "Tráfego pago — implantação",
    description: "Contas, rastreamento e primeiras campanhas no ar.",
    area: "clients",
    durationDays: 16,
    forClient: true,
    tasks: [
      { title: "Briefing: oferta, público e verba", offset: 0 },
      { title: "Acessos: Gerenciador de Anúncios, Google Ads e Analytics", offset: 1 },
      { title: "Pixel, conversões e UTMs configurados", offset: 3, area: "technology" },
      { title: "Estrutura de campanhas e públicos", offset: 5 },
      { title: "Criativos e textos dos anúncios", offset: 7, area: "brand" },
      { title: "Aprovação dos anúncios pelo cliente", offset: 8 },
      { title: "Campanhas no ar", offset: 9 },
      { title: "Primeira otimização", offset: 14 },
      { title: "Relatório da primeira quinzena", offset: 16 },
    ],
  },
  {
    key: "plan",
    name: "Plano interno (ciclo)",
    description: "Um ciclo da Boop com metas e revisão no fim, como o de outubro.",
    area: "operations",
    durationDays: 30,
    forClient: false,
    tasks: [
      { title: "Definir as metas e as tarefas do ciclo", offset: 0 },
      { title: "Revisão do ciclo: o que funcionou e o que cortar", offset: 30 },
    ],
  },
]

export function templateByKey(key: unknown): ProjectTemplate | undefined {
  return PROJECT_TEMPLATES.find((template) => template.key === key)
}

/** Nome do modelo para mostrar no projeto ("Site institucional"). */
export function templateLabel(key: string | null): string | null {
  if (!key) return null
  return templateByKey(key)?.name ?? null
}
