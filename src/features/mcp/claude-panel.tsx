"use client"

import { Check, Copy, ExternalLink } from "lucide-react"
import { useState } from "react"
import { toast } from "sonner"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from "@/components/ui/sheet"
import { CLAUDE_CONNECTORS_URL, MCP_PATH } from "@/features/mcp/oauth"

/**
 * Painel "Claude" do menu lateral: o endereço do servidor MCP do Boop Admin e
 * o passo a passo para cada pessoa conectar no próprio Claude.
 */
export function ClaudePanel({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="w-full gap-0 overflow-y-auto p-0 sm:max-w-[440px]">
        <SheetHeader className="border-b px-5 pt-5 pb-4">
          <SheetTitle className="font-display text-lg tracking-tight">Usar o Boop Admin no Claude</SheetTitle>
          <SheetDescription>
            Conecte o Boop Admin no seu Claude. Ele usa a sua conta e vê só o que você vê aqui.
          </SheetDescription>
        </SheetHeader>
        <PanelBody />
      </SheetContent>
    </Sheet>
  )
}

/** Só monta com o painel aberto (no navegador), então pode ler o endereço da página. */
function PanelBody() {
  const url = `${window.location.origin}${MCP_PATH}`
  const [copied, setCopied] = useState(false)

  function copy() {
    void navigator.clipboard
      .writeText(url)
      .then(() => {
        setCopied(true)
        toast.success("Endereço copiado")
        window.setTimeout(() => setCopied(false), 2000)
      })
      .catch(() => toast.error("Não foi possível copiar. Selecione o endereço e copie."))
  }

  return (
    <div className="flex flex-col gap-6 px-5 py-5 text-sm">
      <section className="space-y-2">
        <h3 className="text-[13px] font-medium">Endereço do conector</h3>
        <div className="flex gap-2">
          {/* Fora da ordem do Tab: ao abrir, o foco vai para "Copiar". */}
          <Input
            readOnly
            value={url}
            aria-label="Endereço do conector"
            tabIndex={-1}
            onClick={(event) => event.currentTarget.select()}
            className="h-9 font-mono text-[13px]"
          />
          <Button type="button" variant="outline" className="h-9 shrink-0" onClick={copy}>
            {copied ? <Check className="text-brand-ink" /> : <Copy />}
            {copied ? "Copiado" : "Copiar"}
          </Button>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="text-[13px] font-medium">Como conectar</h3>
        <ol className="list-decimal space-y-2 pl-5 text-muted-foreground marker:text-foreground">
          <li>
            No Claude, abra <span className="text-foreground">Configurações → Conectores</span> e clique em{" "}
            <span className="text-foreground">Adicionar conector personalizado</span>.
          </li>
          <li>
            Dê o nome <span className="text-foreground">Boop Admin</span> e cole o endereço acima. As configurações
            avançadas ficam em branco.
          </li>
          <li>
            Clique em <span className="text-foreground">Conectar</span>. Abre o login do Boop Admin: entre com o seu
            e-mail e senha e clique em <span className="text-foreground">Permitir</span>.
          </li>
          <li>
            Numa conversa, ative o Boop Admin no menu de ferramentas e peça, por exemplo: “Quais são as minhas tarefas
            desta semana?”
          </li>
        </ol>
        <p className="text-xs text-muted-foreground">
          No plano Team ou Enterprise, quem é Owner adiciona o conector uma vez nas configurações da organização; depois
          cada pessoa só clica em Conectar.
        </p>
      </section>

      <section className="space-y-2">
        <h3 className="text-[13px] font-medium">O que o Claude consegue fazer</h3>
        <ul className="list-disc space-y-1 pl-5 text-muted-foreground">
          <li>Buscar em tudo e listar as suas tarefas</li>
          <li>Ver clientes, projetos, o conteúdo da semana e os ajustes pendentes</li>
          <li>Criar e concluir tarefas e criar ideias de post</li>
          <li>Escrever nos canais das Comunicações</li>
        </ul>
        <p className="text-muted-foreground">Ele não apaga nada e não acessa o financeiro.</p>
      </section>

      <Button asChild className="w-full">
        <a href={CLAUDE_CONNECTORS_URL} target="_blank" rel="noopener noreferrer">
          Abrir o Claude
          <ExternalLink />
        </a>
      </Button>
    </div>
  )
}
