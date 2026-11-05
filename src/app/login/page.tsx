import type { Metadata } from "next"
import Image from "next/image"
import { redirect } from "next/navigation"

import { LoginForm } from "@/features/auth/login-form"
import { getSessionUser } from "@/features/auth/session"
import { safeNextPath } from "@/features/mcp/oauth"
import { getPortalUser } from "@/features/portal/session"

export const metadata: Metadata = { title: "Entrar" }

/*
 * Tela de entrada. À esquerda, o painel da marca: uma ilha sempre escura
 * (classe `dark`, nos dois temas), de vidro, com a luz azul em faixas atrás,
 * a escultura do olhar e o "Olhe além." com o "além." na serifada itálica.
 * À direita, o formulário num cartão de vidro sobre os brilhos do fundo. No
 * celular, a marca vira uma faixa no topo. As entradas animadas usam
 * `motion-safe:` e somem com "reduzir movimento".
 */
const ENTER = "motion-safe:animate-in motion-safe:fade-in motion-safe:fill-mode-backwards"

export default async function LoginPage(props: PageProps<"/login">) {
  // Volta depois do login: só a tela de autorização do Claude.
  const next = safeNextPath((await props.searchParams).next)
  if (await getSessionUser()) redirect(next ?? "/hoje")
  if (await getPortalUser()) redirect(next ?? "/portal")

  return (
    <main className="grid min-h-svh gap-3 p-3 lg:grid-cols-[minmax(0,1.15fr)_minmax(460px,1fr)] lg:gap-0 lg:p-4">
      <section
        aria-label="Boop"
        className="dark relative isolate flex h-72 flex-col overflow-hidden rounded-[1.75rem] border border-white/10 bg-[#0b0d12] px-6 pt-6 pb-7 text-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.08),0_30px_80px_-30px_rgb(20_40_120/0.6)] sm:h-80 sm:px-10 lg:h-auto lg:rounded-[2rem] lg:px-14 lg:pt-12 lg:pb-14"
      >
        {/* Luz azul em faixas atrás da escultura (globals.css). */}
        <div aria-hidden="true" className="hero-aurora" />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -bottom-40 -left-32 -z-10 size-[520px] rounded-full bg-glow opacity-30 blur-[120px] lg:size-[640px]"
        />

        <div className="relative z-10 flex items-start justify-between">
          <Image
            src="/brand/boop-logo-claro.webp"
            alt="Boop"
            width={330}
            height={164}
            priority
            className="h-auto w-20 lg:w-24"
          />
          <span aria-hidden="true" className="hidden h-7 items-center rounded-full border border-white/25 px-3 eyebrow text-white/80 sm:inline-flex">
            Boop Admin
          </span>
        </div>

        <div
          aria-hidden="true"
          className={`${ENTER} pointer-events-none absolute top-6 right-[-18%] z-0 w-[62%] max-w-[300px] duration-1000 motion-safe:zoom-in-90 sm:right-[-6%] sm:max-w-[340px] lg:top-[16%] lg:right-[-8%] lg:w-[76%] lg:max-w-[640px]`}
        >
          <Image
            src="/brand/boop-escultura.webp"
            alt=""
            width={960}
            height={960}
            priority
            sizes="(min-width: 1024px) 45vw, 60vw"
            className="h-auto w-full -rotate-[7deg] drop-shadow-[0_40px_60px_rgb(0_0_0/0.55)]"
          />
        </div>

        <div className="relative z-10 mt-auto max-w-[62%] lg:max-w-none">
          <p
            className={`${ENTER} font-display text-[46px] leading-[0.88] font-medium tracking-[-0.06em] text-white duration-700 motion-safe:slide-in-from-bottom-4 sm:text-6xl lg:text-[clamp(76px,8.4vw,136px)]`}
          >
            Olhe
            <br />
            <em className="emphasis pr-[0.06em] text-[1.12em] tracking-[-0.03em] text-gradient-brand">além.</em>
          </p>
          <p
            className={`${ENTER} mt-4 hidden max-w-xs text-lg leading-snug tracking-[-0.02em] text-white/75 delay-200 duration-700 motion-safe:slide-in-from-bottom-2 sm:block lg:mt-8 lg:text-2xl`}
          >
            Antes da entrega,
            <br />a pergunta certa.
          </p>
        </div>
      </section>

      <section className="flex flex-col px-3 pt-6 pb-4 sm:px-10 lg:px-14 lg:py-10">
        <div className="flex flex-1 flex-col lg:justify-center">
          <div
            className={`${ENTER} mx-auto w-full max-w-[420px] rounded-[1.75rem] glass-panel px-6 py-8 delay-100 duration-500 motion-safe:slide-in-from-bottom-3 sm:px-9 sm:py-10`}
          >
            <p className="flex items-center gap-2 eyebrow text-muted-foreground">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-glow shadow-[0_0_10px_var(--glow)]" />
              Boop Admin
            </p>
            <h1 className="mt-4 font-display text-[34px] leading-tight font-medium tracking-[-0.04em] text-foreground">
              {next ? (
                <>
                  Conectar o <em className="emphasis pr-[0.04em] text-[1.14em] text-brand-ink">Claude</em>
                </>
              ) : (
                <>
                  Que bom te <em className="emphasis pr-[0.04em] text-[1.14em] text-brand-ink">ver.</em>
                </>
              )}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {next ? "Entre para conectar o Claude ao Boop Admin." : "Entre com o e-mail e a senha da sua conta."}
            </p>
            <div className="mt-8">
              <LoginForm next={next} />
            </div>
          </div>
        </div>
        <p className="mx-auto mt-8 w-full max-w-[420px] text-center text-xs text-muted-foreground">
          Acesso restrito à equipe e aos clientes da Boop.
        </p>
      </section>
    </main>
  )
}
