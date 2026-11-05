import Link from "next/link"

const SCREENS: { href: string; label: string }[] = [
  { href: "conteudo", label: "Conteúdo — calendário" },
  { href: "conteudo?ver=quadro", label: "Conteúdo — quadro" },
  { href: "conteudo?ver=lista", label: "Conteúdo — 7 dias" },
  { href: "conteudo?ver=feed&cliente=00000000-0000-4000-8000-0000000000a1", label: "Conteúdo — feed" },
  { href: "conteudo?ver=ideias", label: "Conteúdo — ideias" },
  { href: "post?id=p1", label: "Post — aguardando cliente" },
  { href: "post?id=p6", label: "Post — publicado, com desempenho" },
  { href: "clientes", label: "Clientes" },
  { href: "cliente", label: "Página do cliente" },
  { href: "comunicacoes", label: "Comunicações" },
  { href: "comunicacoes?canal=ch-aurora", label: "Comunicações — conversa" },
  { href: "comercial", label: "Comercial" },
]

/** Índice das telas do lote 2B (relacionamento) na vitrine. */
export default function VitrineAdminBPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="font-display text-3xl font-medium tracking-tight">
        Relacionamento <em className="emphasis text-brand-ink">na vitrine</em>
      </h1>
      <ul className="mt-6 space-y-2">
        {SCREENS.map((screen) => (
          <li key={screen.href}>
            <Link href={`/vitrine/admin-b/${screen.href}`} className="text-brand-ink hover:underline">
              {screen.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
