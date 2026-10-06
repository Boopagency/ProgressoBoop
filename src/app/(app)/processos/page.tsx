import type { Metadata } from "next"

import { DocsView } from "@/features/docs/docs-view"
import { getDocs, searchDocs, type DocSearchHit } from "@/features/docs/queries"
import { todayKey } from "@/lib/dates"

export const metadata: Metadata = { title: "Processos" }

export default async function DocsPage(props: PageProps<"/processos">) {
  const searchParams = await props.searchParams
  const query = typeof searchParams.q === "string" ? searchParams.q.trim().slice(0, 200) : ""

  const [docs, hits] = await Promise.all([
    getDocs(),
    query ? searchDocs(query) : Promise.resolve<DocSearchHit[]>([]),
  ])

  return <DocsView docs={docs} query={query} hits={hits} today={todayKey()} />
}
