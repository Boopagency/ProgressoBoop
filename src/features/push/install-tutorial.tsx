"use client"

import { Plus, Share } from "lucide-react"
import Image from "next/image"
import { useEffect, useState, type ReactNode } from "react"

import { cn } from "@/lib/utils"

/*
 * O passo a passo de instalar a Boop, animado: um celular desenhado que mostra
 * cada toque (com os nomes que o Chrome e o Safari usam) e, ao lado, a lista
 * com o passo da vez destacado. Troca de passo sozinho; tocar num passo
 * mostra aquele. Com "reduzir movimento" ligado, só troca no toque.
 */

const STEP_MS = 2600

interface Step {
  text: ReactNode
  screen: ReactNode
}

export function InstallTutorial({ apple }: { apple: boolean }) {
  const steps = apple ? IPHONE : ANDROID
  const [current, setCurrent] = useState(0)

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return
    // Um passo por vez: tocar num passo também recomeça a contagem.
    const timer = window.setTimeout(() => setCurrent((n) => (n + 1) % steps.length), STEP_MS)
    return () => window.clearTimeout(timer)
  }, [current, steps.length])

  return (
    <div className="flex items-center gap-4">
      <Phone screen={current}>{steps[current]?.screen}</Phone>
      <ol className="min-w-0 flex-1 space-y-2 text-sm">
        {steps.map((step, index) => (
          <li key={index}>
            <button
              type="button"
              onClick={() => setCurrent(index)}
              className={cn(
                "flex w-full gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
                index === current ? "bg-brand-soft text-tint-foreground" : "text-muted-foreground"
              )}
            >
              <span
                className={cn(
                  "mt-px flex size-5 shrink-0 items-center justify-center rounded-full text-xs font-medium",
                  index === current ? "bg-brand text-brand-navy" : "bg-muted"
                )}
              >
                {index + 1}
              </span>
              <span>{step.text}</span>
            </button>
          </li>
        ))}
      </ol>
    </div>
  )
}

/** A moldura do celular; cada tela entra com um fade. */
function Phone({ screen, children }: { screen: number; children: ReactNode }) {
  return (
    <div
      aria-hidden
      className="relative h-56 w-32 shrink-0 overflow-hidden rounded-[1.25rem] border-4 border-brand-navy bg-brand-navy text-[7px] leading-tight text-white shadow-md"
    >
      <div key={screen} className="absolute inset-0 animate-in duration-300 fade-in">
        {children}
      </div>
    </div>
  )
}

/** O ponto de toque (onde o dedo vai). */
function Tap({ className }: { className: string }) {
  return (
    <span className={cn("absolute size-4 -translate-x-1/2 -translate-y-1/2", className)}>
      <span className="absolute inset-0 animate-ping rounded-full bg-white/70" />
      <span className="absolute inset-1 rounded-full bg-white ring-2 ring-brand" />
    </span>
  )
}

/** A página da Boop aberta no navegador, ao fundo. */
function Page({ dim = false }: { dim?: boolean }) {
  return (
    <div className={cn("absolute inset-0 space-y-1.5 bg-[#101820] px-2 pt-8", dim && "opacity-40")}>
      <div className="h-10 rounded bg-[#163a52]" />
      <div className="h-1.5 w-10 rounded bg-white/50" />
      <div className="h-2.5 w-16 rounded bg-white/80" />
      <div className="h-3 rounded border border-white/20" />
      <div className="h-3 rounded border border-white/20" />
      <div className="h-3 rounded bg-white/80" />
    </div>
  )
}

function ChromeBar() {
  return (
    <div className="absolute inset-x-0 top-0 flex h-6 items-center gap-1 bg-[#1f2428] px-1.5">
      <div className="h-3 flex-1 rounded-full bg-white/15 px-1 leading-3 text-white/70">deumboop.com.br</div>
      <span className="text-[9px] font-bold">⋮</span>
    </div>
  )
}

function SafariBar() {
  return (
    <div className="absolute inset-x-0 bottom-0 flex h-7 items-center gap-1 bg-[#1f2428] px-1.5">
      <div className="h-3.5 flex-1 rounded-full bg-white/15 text-center leading-[14px] text-white/70">deumboop.com.br</div>
      <span className="text-[9px] font-bold">⋯</span>
    </div>
  )
}

function MenuItem({ children, active = false }: { children: ReactNode; active?: boolean }) {
  return (
    <div className={cn("relative rounded px-1.5 py-1", active ? "bg-brand pr-5 font-semibold text-brand-navy" : "text-white/60")}>
      {children}
      {active ? <Tap className="top-1/2 right-1.5" /> : null}
    </div>
  )
}

/** A tela de início com o ícone novo da Boop. */
function HomeScreen() {
  return (
    <div className="absolute inset-0 bg-gradient-to-b from-[#163a52] to-brand-navy p-2">
      <div className="grid grid-cols-3 gap-2 pt-6">
        {Array.from({ length: 5 }, (_, i) => (
          <div key={i} className="aspect-square rounded-md bg-white/15" />
        ))}
        <div className="relative flex flex-col items-center gap-0.5">
          <Image src="/icons/icon-192.png" alt="" width={28} height={28} className="aspect-square w-full rounded-md" />
          <span>Boop</span>
          <Tap className="top-1/3 left-1/2" />
        </div>
      </div>
    </div>
  )
}

const ANDROID: Step[] = [
  {
    text: "No Chrome, toque no menu ⋮ (em cima, à direita).",
    screen: (
      <div key="a1">
        <Page />
        <ChromeBar />
        <Tap className="top-3 right-0.5" />
      </div>
    ),
  },
  {
    text: "Toque em “Instalar e criar atalho”.",
    screen: (
      <div key="a2">
        <Page dim />
        <ChromeBar />
        <div className="absolute top-5 right-1 left-5 space-y-0.5 rounded-md bg-[#2b3136] p-1 shadow-lg">
          <MenuItem>Histórico</MenuItem>
          <MenuItem>Compartilhar…</MenuItem>
          <MenuItem>Traduzir…</MenuItem>
          <MenuItem active>Instalar e criar atalho</MenuItem>
          <MenuItem>Configurações</MenuItem>
        </div>
      </div>
    ),
  },
  {
    text: "Escolha Instalar (não “Criar atalho”).",
    screen: (
      <div key="a3">
        <Page dim />
        <ChromeBar />
        <div className="absolute inset-x-0 bottom-0 space-y-1 rounded-t-lg bg-[#2b3136] p-1.5 pb-3">
          <p className="pb-0.5 text-center text-white/80">Instalar e criar atalho</p>
          <MenuItem active>Instalar</MenuItem>
          <MenuItem>Criar atalho</MenuItem>
        </div>
      </div>
    ),
  },
  {
    text: "Abra a Boop pelo ícone novo e ative as notificações.",
    screen: <HomeScreen key="a4" />,
  },
]

const IPHONE: Step[] = [
  {
    text: "No Safari, toque em ⋯ (embaixo, à direita).",
    screen: (
      <div key="i1">
        <Page />
        <SafariBar />
        <Tap className="right-0.5 bottom-3.5" />
      </div>
    ),
  },
  {
    text: (
      <>
        Toque em Compartilhar <Share className="inline size-3.5 align-[-2px]" aria-label="(ícone de compartilhar)" />.
        Nos iPhones mais antigos, ele já fica na barra de baixo.
      </>
    ),
    screen: (
      <div key="i2">
        <Page dim />
        <SafariBar />
        <div className="absolute right-1 bottom-8 left-4 space-y-0.5 rounded-lg bg-[#2b3136] p-1 shadow-lg">
          <MenuItem active>
            <Share className="mr-0.5 inline size-2 align-[-1px]" />
            Compartilhar
          </MenuItem>
          <MenuItem>Adicionar a Favoritos</MenuItem>
          <MenuItem>Nova Aba</MenuItem>
        </div>
      </div>
    ),
  },
  {
    text: "Desça e toque em “Adicionar à Tela de Início”, depois em Adicionar.",
    screen: (
      <div key="i3">
        <Page dim />
        <div className="absolute inset-x-0 top-4 bottom-0 space-y-0.5 rounded-t-lg bg-[#2b3136] p-1.5">
          <p className="pb-1 text-white/80">Boop Admin</p>
          <MenuItem>Adicionar Favorito a…</MenuItem>
          <MenuItem>Buscar na Página</MenuItem>
          <MenuItem active>
            <Plus className="mr-0.5 inline size-2 align-[-1px]" />
            Adicionar à Tela de Início
          </MenuItem>
          <MenuItem>Marcação</MenuItem>
          <MenuItem>Imprimir</MenuItem>
        </div>
      </div>
    ),
  },
  {
    text: "Abra a Boop pelo ícone novo e ative as notificações.",
    screen: <HomeScreen key="i4" />,
  },
]
