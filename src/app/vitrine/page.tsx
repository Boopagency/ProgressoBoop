"use client"

import { ptBR } from "date-fns/locale"
import { ArrowUpRight, Asterisk, CalendarDays, ChevronDown, Search, Sparkles } from "lucide-react"
import Link from "next/link"
import { useState } from "react"
import { toast } from "sonner"

import { PageBody, PageContainer, PageHeader } from "@/components/layout/page"
import { PanelCard, PanelCount } from "@/components/panel-card"
import { SegmentedControl } from "@/components/segmented-control"
import { StatGrid } from "@/components/stat-grid"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Calendar } from "@/components/ui/calendar"
import { Checkbox } from "@/components/ui/checkbox"
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { Progress } from "@/components/ui/progress"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet"
import { Skeleton } from "@/components/ui/skeleton"
import { Textarea } from "@/components/ui/textarea"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { PersonAvatar } from "@/features/workspace/person-avatar"
import { useTheme } from "@/hooks/use-theme"

const SWATCHES = [
  { name: "canvas", token: "--canvas" },
  { name: "shell", token: "--shell" },
  { name: "card", token: "--card" },
  { name: "glass", token: "--glass" },
  { name: "brand", token: "--brand" },
  { name: "glow", token: "--glow" },
  { name: "primary", token: "--primary" },
  { name: "brand-ink", token: "--brand-ink" },
  { name: "overdue", token: "--overdue" },
  { name: "success", token: "--success" },
  { name: "priority", token: "--priority" },
  { name: "attention", token: "--attention-line" },
]

/**
 * Vitrine das peças do sistema visual (só em desenvolvimento), nos dois
 * temas. As telas montadas ficam em /vitrine/hoje, /vitrine/portal e
 * /vitrine/tarefas; o login é o de verdade (/login).
 */
export default function VitrinePage() {
  const { resolved, setChoice } = useTheme()
  const [scope, setScope] = useState<"mine" | "all">("mine")
  const [day, setDay] = useState<Date | undefined>(new Date())

  return (
    <PageContainer className="max-w-[1200px]">
      <PageHeader
        title={
          <>
            Sistema <em>visual</em>
          </>
        }
        description="Peças do Boop Admin com dados de exemplo."
        actions={
          <>
            <Button variant="outline" onClick={() => setChoice(resolved === "dark" ? "light" : "dark")}>
              Tema {resolved === "dark" ? "claro" : "escuro"}
            </Button>
            {["hoje", "portal", "tarefas", "admin-a", "admin-b", "admin-c", "portal-telas"].map((screen) => (
              <Button key={screen} variant="glass" asChild>
                <Link href={`/vitrine/${screen}`}>/{screen}</Link>
              </Button>
            ))}
          </>
        }
      />

      <PageBody>
        <section className="space-y-4">
          <p className="eyebrow text-muted-foreground">Paleta</p>
          <div className="grid grid-cols-3 gap-3 sm:grid-cols-6">
            {SWATCHES.map((swatch) => (
              <div key={swatch.name} className="overflow-hidden rounded-2xl border bg-card">
                <div className="h-14 border-b" style={{ background: `var(${swatch.token})` }} />
                <p className="px-3 py-2 text-xs font-medium">{swatch.name}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="relative isolate overflow-hidden rounded-[2rem] glass-panel p-6 sm:p-10">
          <div aria-hidden="true" className="hero-aurora" />
          <div className="relative z-10 space-y-6">
            <div className="flex flex-wrap items-center gap-2">
              <Badge variant="pill">Vidro fosco</Badge>
              <Badge variant="pill">Brilho azul</Badge>
              <Badge variant="glass">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-glow" />
                Etiqueta de seção
              </Badge>
              <Asterisk aria-hidden="true" className="ml-auto size-8" strokeWidth={1.5} />
            </div>
            <p className="max-w-3xl font-display text-[44px] leading-[1.02] font-medium tracking-[-0.045em] sm:text-[72px]">
              Tipografia de <em className="emphasis text-[1.14em] text-gradient-brand">alto contraste</em>
            </p>
            <div className="flex items-center justify-between gap-6">
              <p className="max-w-md text-muted-foreground">
                Poppins nos títulos, Inter no texto e Instrument Serif itálica nas palavras de ênfase e nos números grandes.
              </p>
              <Button variant="outline" size="circle" aria-label="Seguir">
                <ArrowUpRight />
              </Button>
            </div>
            <StatGrid
              variant="line"
              items={[
                { label: "Atrasadas", value: 2, alert: true },
                { label: "Para hoje", value: 3 },
                { label: "Esta semana", value: 8 },
                { label: "Concluídas", value: 14 },
              ]}
            />
          </div>
        </section>

        <StatGrid
          items={[
            { label: "Atrasadas", value: 2, alert: true, href: "#" },
            { label: "Para hoje", value: 3, href: "#" },
            { label: "Esta semana", value: 8, unit: "de 12" },
            { label: "Concluídas", value: 14, progress: 64 },
          ]}
        />

        <div className="grid gap-6 lg:grid-cols-2">
          <PanelCard id="botoes" title="Botões e pílulas">
            <div className="space-y-5 p-5">
              <div className="flex flex-wrap items-center gap-2">
                <Button>Principal</Button>
                <Button variant="outline">Contorno</Button>
                <Button variant="glass">Vidro</Button>
                <Button variant="secondary">Secundário</Button>
                <Button variant="ghost">Fantasma</Button>
                <Button variant="destructive">Excluir</Button>
                <Button disabled>Desabilitado</Button>
                <Button variant="outline" size="circle" aria-label="Abrir">
                  <ArrowUpRight />
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Badge>Padrão</Badge>
                <Badge variant="secondary">Secundário</Badge>
                <Badge variant="outline">Contorno</Badge>
                <Badge variant="pill">Pílula</Badge>
                <Badge variant="destructive">Atrasado</Badge>
                <span className="inline-flex h-9 items-center gap-2 rounded-full border border-glass-edge bg-card pr-1.5 pl-3 text-sm shadow-[inset_0_1px_0_var(--glass-highlight)]">
                  <Search className="size-3.5 text-muted-foreground" aria-hidden="true" />
                  Pesquisa e referências
                  <Badge variant="seal">1 dia</Badge>
                </span>
              </div>
              <SegmentedControl
                aria-label="Quais tarefas mostrar"
                value={scope}
                onValueChange={setScope}
                options={[
                  { value: "mine", label: "Minhas" },
                  { value: "all", label: "Todas" },
                ]}
              />
            </div>
          </PanelCard>

          <PanelCard id="campos" title="Campos">
            <div className="grid gap-4 p-5 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="v-nome">Nome</Label>
                <Input id="v-nome" placeholder="Café Aurora" />
              </div>
              <div className="space-y-1.5">
                <Label>Responsável</Label>
                <Select defaultValue="leo">
                  <SelectTrigger className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="leo">Leo Martins</SelectItem>
                    <SelectItem value="bia">Bia Santos</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="v-nota">Nota</Label>
                <Textarea id="v-nota" placeholder="Escreva uma nota…" />
              </div>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox defaultChecked /> Concluída
              </label>
              <label className="flex items-center gap-2 text-sm">
                <Checkbox /> Pendente
              </label>
            </div>
          </PanelCard>

          <PanelCard id="flutuantes" title="Menus, folhas e avisos">
            <div className="flex flex-wrap gap-2 p-5">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline">
                    Menu <ChevronDown />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent>
                  <DropdownMenuLabel>Projeto</DropdownMenuLabel>
                  <DropdownMenuItem>Editar</DropdownMenuItem>
                  <DropdownMenuItem>Fixar em foco</DropdownMenuItem>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem variant="destructive">Excluir…</DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
              <Popover>
                <PopoverTrigger asChild>
                  <Button variant="outline">
                    <CalendarDays /> Data
                  </Button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-2">
                  <Calendar mode="single" locale={ptBR} selected={day} onSelect={setDay} />
                </PopoverContent>
              </Popover>
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="icon" aria-label="Dica">
                    <Sparkles />
                  </Button>
                </TooltipTrigger>
                <TooltipContent>Dica de vidro</TooltipContent>
              </Tooltip>
              <Dialog>
                <DialogTrigger asChild>
                  <Button variant="outline">Diálogo</Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>Nova tarefa</DialogTitle>
                    <DialogDescription>Diálogo de vidro sobre o fundo escurecido.</DialogDescription>
                  </DialogHeader>
                  <Input placeholder="Título" />
                  <DialogFooter>
                    <Button>Criar</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="outline">Folha</Button>
                </SheetTrigger>
                <SheetContent>
                  <SheetHeader>
                    <SheetTitle>Detalhes</SheetTitle>
                    <SheetDescription>Folha lateral de vidro.</SheetDescription>
                  </SheetHeader>
                </SheetContent>
              </Sheet>
              <Button variant="outline" onClick={() => toast.success("Tarefa concluída.")}>
                Aviso
              </Button>
            </div>
          </PanelCard>

          <PanelCard id="estado" title={<>Progresso e carregamento <PanelCount value={3} /></>}>
            <div className="space-y-5 p-5">
              <Progress value={68} aria-label="Exemplo" />
              <div className="flex items-center gap-3">
                <PersonAvatar name="Jabez Oriel" avatarUrl={null} colorIndex={0} />
                <PersonAvatar name="Leo Martins" avatarUrl={null} colorIndex={1} />
                <PersonAvatar name="Bia Santos" avatarUrl={null} colorIndex={2} />
                <div className="flex-1 space-y-2">
                  <Skeleton className="h-3.5 w-3/4" />
                  <Skeleton className="h-3.5 w-1/2" />
                </div>
              </div>
              <Calendar mode="single" locale={ptBR} selected={day} onSelect={setDay} className="rounded-2xl border bg-card" />
            </div>
          </PanelCard>
        </div>
      </PageBody>
    </PageContainer>
  )
}
