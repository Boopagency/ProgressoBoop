import Link from "next/link"

const SCREENS: { href: string; label: string }[] = [
  { href: "tarefas", label: "Tarefas — lista" },
  { href: "tarefas?ver=tabela", label: "Tarefas — tabela" },
  { href: "tarefas?ver=quadro", label: "Tarefas — quadro" },
  { href: "tarefas?vazio=1", label: "Tarefas — vazio" },
  { href: "projetos", label: "Projetos" },
  { href: "projetos/site", label: "Projeto" },
  { href: "calendario", label: "Calendário" },
  { href: "reunioes", label: "Reuniões" },
  { href: "reunioes/site", label: "Reunião" },
]

/** Índice das telas do lote 2A (Tarefas, Projetos, Calendário e Reuniões) na vitrine. */
export default function VitrineAdminAPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-12">
      <h1 className="font-display text-3xl font-medium tracking-tight">
        Operação <em className="emphasis text-brand-ink">na vitrine</em>
      </h1>
      <ul className="mt-6 space-y-2">
        {SCREENS.map((screen) => (
          <li key={screen.href}>
            <Link href={`/vitrine/admin-a/${screen.href}`} className="text-brand-ink hover:underline">
              {screen.label}
            </Link>
          </li>
        ))}
      </ul>
    </main>
  )
}
