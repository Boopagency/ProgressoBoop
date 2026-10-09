import { ShieldAlert } from "lucide-react"
import type { Metadata } from "next"
import { redirect } from "next/navigation"
import type { ReactNode } from "react"

import { BoopMark } from "@/components/layout/boop-mark"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { getSessionUser } from "@/features/auth/session"
import { approveConnection, denyConnection } from "@/features/mcp/consent-actions"
import { consentPath, isAuthorizationId, redirectHost, redirectKind } from "@/features/mcp/oauth"
import { getPortalUser } from "@/features/portal/session"
import { createClient } from "@/lib/supabase/server"

export const metadata: Metadata = { title: "Conectar o Claude" }

/**
 * Tela de autorização do servidor OAuth do Supabase Auth (Authorization Path).
 * O Supabase manda a pessoa para cá com `authorization_id` quando ela conecta
 * o Boop Admin no Claude. Sem sessão, o proxy leva ao login e volta para cá.
 */
export default async function ConsentPage({ searchParams }: PageProps<"/oauth/consent">) {
  const { authorization_id: authorizationId } = await searchParams
  if (!isAuthorizationId(authorizationId)) {
    return (
      <ConsentShell title="Pedido de conexão inválido">
        <p className="text-sm text-muted-foreground">Volte ao Claude e clique em Conectar de novo.</p>
      </ConsentShell>
    )
  }

  const user = await getSessionUser()
  if (!user) {
    if (!(await getPortalUser())) redirect(`/login?next=${encodeURIComponent(consentPath(authorizationId))}`)
    // Conta de cliente: o conector é só da equipe.
    return (
      <ConsentShell title="Esta conta não pode conectar o Claude">
        <p className="text-sm text-muted-foreground">
          O conector do Claude é só para a equipe da Boop. Se você é da equipe, saia e entre com a sua conta.
        </p>
        <DecisionForm authorizationId={authorizationId} allowApprove={false} />
      </ConsentShell>
    )
  }

  const supabase = await createClient()
  const { data: details, error } = await supabase.auth.oauth.getAuthorizationDetails(authorizationId)
  if (error || !details) {
    if (error) console.error(`[oauth] detalhes: ${error.message}`)
    return (
      <ConsentShell title="Este pedido de conexão expirou">
        <p className="text-sm text-muted-foreground">Volte ao Claude e clique em Conectar de novo.</p>
      </ConsentShell>
    )
  }
  // Já permitido antes para este aplicativo: o Supabase devolve direto o endereço de volta.
  if (!("authorization_id" in details)) redirect(details.redirect_url)

  const kind = redirectKind(details.redirect_uri)
  const clientName = details.client.name || "Aplicativo sem nome"

  if (kind === "unknown") {
    return (
      <ConsentShell title="Aplicativo não reconhecido">
        <div className="flex gap-3 rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
          <ShieldAlert className="mt-0.5 size-4 shrink-0 text-destructive" aria-hidden />
          <p>
            <span className="font-medium">{clientName}</span> pediu acesso ao Boop Admin e voltaria para{" "}
            <span className="font-medium break-all">{redirectHost(details.redirect_uri)}</span>, que não é o Claude. Por
            segurança, só o Claude pode ser conectado.
          </p>
        </div>
        <DecisionForm authorizationId={authorizationId} allowApprove={false} />
      </ConsentShell>
    )
  }

  return (
    <ConsentShell title="Conectar o Claude ao Boop Admin">
      <p className="text-sm text-muted-foreground">
        O {kind === "claude_code" ? "Claude Code (no seu computador)" : "Claude"} vai usar o Boop Admin como{" "}
        <span className="font-medium text-foreground">{user.full_name}</span> ({user.email}) e vê só o que você vê.
      </p>
      <div className="space-y-2 text-sm">
        <p className="font-medium">O que ele pode fazer</p>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Buscar e ler tarefas, clientes, projetos, conteúdo e pedidos de ajuste</li>
          <li>Criar e concluir tarefas</li>
          <li>Criar ideias de post</li>
          <li>Escrever nos canais das Comunicações</li>
        </ul>
        <p className="text-muted-foreground">Ele não apaga nada e não acessa o financeiro.</p>
      </div>
      <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 rounded-lg bg-muted/60 px-3 py-2.5 text-[13px]">
        <dt className="text-muted-foreground">Aplicativo</dt>
        <dd className="min-w-0 truncate font-medium">{clientName}</dd>
        <dt className="text-muted-foreground">Volta para</dt>
        <dd className="min-w-0 truncate font-medium">{redirectHost(details.redirect_uri)}</dd>
      </dl>
      <DecisionForm authorizationId={authorizationId} allowApprove />
      <p className="text-xs text-muted-foreground">
        Para desconectar depois, remova o conector nas configurações do Claude.
      </p>
    </ConsentShell>
  )
}

function ConsentShell({ title, children }: { title: string; children: ReactNode }) {
  return (
    <main className="flex min-h-svh flex-col items-center justify-center px-4 py-12">
      <div className="w-full max-w-[420px]">
        <div className="mb-8 flex flex-col items-center gap-5 text-center">
          <BoopMark className="w-14" />
          <h1 className="font-display text-xl font-semibold tracking-tight">{title}</h1>
        </div>
        <Card className="gap-5 p-6 shadow-[0_1px_3px_0_rgb(0_0_0/0.04)]">{children}</Card>
      </div>
    </main>
  )
}

function DecisionForm({ authorizationId, allowApprove }: { authorizationId: string; allowApprove: boolean }) {
  return (
    <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
      <form action={denyConnection}>
        <input type="hidden" name="authorization_id" value={authorizationId} />
        <Button type="submit" variant="outline" className="w-full sm:w-auto">
          {allowApprove ? "Cancelar" : "Recusar"}
        </Button>
      </form>
      {allowApprove ? (
        <form action={approveConnection}>
          <input type="hidden" name="authorization_id" value={authorizationId} />
          <Button type="submit" className="w-full sm:w-auto">
            Permitir
          </Button>
        </form>
      ) : null}
    </div>
  )
}
