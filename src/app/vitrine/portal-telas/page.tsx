import { ArrowUpRight } from "lucide-react"
import Link from "next/link"

import { PageBody, PageContainer } from "@/components/layout/page"
import { PortalHeader } from "@/features/portal/portal-ui"

import { BRIEFING_SCREENS } from "./briefing/exemplos"

const SCREENS = [
  { href: "/vitrine/portal", title: "Início", text: "O painel, com a data dos posts numa linha só no celular." },
  { href: "/vitrine/portal-telas/calendario", title: "Calendário", text: "O mês com os posts; no celular, os dias em lista." },
  { href: "/vitrine/portal-telas/feed", title: "Feed", text: "A prévia do Instagram, o cartão Instagram e as visualizações." },
  { href: "/vitrine/portal-telas/post", title: "Post para aprovar", text: "Slides, Aprovar e Pedir ajuste e a conversa ao lado." },
  { href: "/vitrine/portal-telas/post-publicado", title: "Post publicado", text: "Com o bloco de números do Instagram." },
  { href: "/vitrine/portal-telas/projetos", title: "Projetos", text: "A lista, com o andamento em número grande." },
  { href: "/vitrine/portal-telas/projeto", title: "Projeto aberto", text: "Etapas, entregas, aprovação de etapa e a conversa." },
  { href: "/vitrine/portal-telas/documentos", title: "Documentos", text: "Separados por tipo, com o novo destacado." },
  { href: "/vitrine/portal-telas/financeiro", title: "Financeiro (em aberto)", text: "O selo, os totais, o banner e as três listas." },
  { href: "/vitrine/portal-telas/financeiro-em-dia", title: "Financeiro (em dia)", text: "O selo Em dia." },
  { href: "/vitrine/portal-telas/comunicacao", title: "Comunicação", text: "No celular, a lista das conversas; no computador, a conversa." },
  { href: "/vitrine/portal-telas/comunicacao-conversa", title: "Conversa aberta", text: "No celular, em tela cheia, com mensagens de voz." },
  { href: "/vitrine/portal-telas/notificacoes", title: "Notificações", text: "Hoje, Ontem e Antes, com os não lidos marcados." },
  { href: "/vitrine/portal-telas/indicar", title: "Indicar", text: "Como funciona, o formulário e as indicações feitas." },
  { href: "/vitrine/portal-telas/conta", title: "Minha conta", text: "A janela da conta, aberta por cima de uma tela." },
  ...BRIEFING_SCREENS.map((screen) => ({ href: `/vitrine/portal-telas/briefing?tela=${screen.value}`, title: screen.title, text: screen.text })),
]

/** As telas do portal do cliente na vitrine (fase 3 da repaginada), com dados de exemplo. */
export default function VitrinePortalScreensPage() {
  return (
    <PageContainer className="max-w-[1200px]">
      <PortalHeader
        client="Vitrine"
        title={
          <>
            Portal do <em>cliente</em>
          </>
        }
        description="As telas do portal com dados de exemplo (nada vem do banco)."
      />
      <PageBody>
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {SCREENS.map((screen) => (
            <li key={screen.href}>
              <Link
                href={screen.href}
                className="group flex h-full items-start gap-3 rounded-2xl border bg-card p-4 outline-none transition-[border-color,box-shadow] hover:border-glow/40 hover:shadow-float focus-visible:ring-[3px] focus-visible:ring-ring/40"
              >
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-foreground">{screen.title}</p>
                  <p className="mt-0.5 text-[13px] leading-5 text-muted-foreground">{screen.text}</p>
                </div>
                <ArrowUpRight className="size-4 text-muted-foreground group-hover:text-brand-ink" aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      </PageBody>
    </PageContainer>
  )
}
