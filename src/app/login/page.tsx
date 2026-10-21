import type { Metadata } from "next"
import Image from "next/image"
import { redirect } from "next/navigation"

import { LoginForm } from "@/features/auth/login-form"
import { getSessionUser } from "@/features/auth/session"
import { safeNextPath } from "@/features/mcp/oauth"
import { getPortalUser } from "@/features/portal/session"

export const metadata: Metadata = { title: "Entrar" }

/*
 * Tela de entrada no estilo do site (deumboop.com.br): o lado da marca em
 * navy, com o "Olhe além." e a escultura do olhar, e o formulário no osso
 * (no escuro, no fundo do tema). No celular, a marca vira uma faixa no topo.
 * As entradas animadas usam `motion-safe:` e somem com "reduzir movimento".
 */
const ENTER = "motion-safe:animate-in motion-safe:fade-in motion-safe:fill-mode-backwards"

export default async function LoginPage(props: PageProps<"/login">) {
  // Volta depois do login: só a tela de autorização do Claude.
  const next = safeNextPath((await props.searchParams).next)
  if (await getSessionUser()) redirect(next ?? "/hoje")
  if (await getPortalUser()) redirect(next ?? "/portal")

  return (
    <main className="grid min-h-svh bg-brand-paper lg:grid-cols-[minmax(0,1.15fr)_minmax(440px,1fr)] dark:bg-background">
      <section
        aria-label="Boop"
        className="relative isolate flex h-64 flex-col overflow-hidden bg-brand-navy px-6 pt-6 pb-7 text-brand-paper sm:h-80 sm:px-10 lg:h-auto lg:px-14 lg:pt-12 lg:pb-14"
      >
        {/* Brilho ciano atrás da escultura. */}
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -right-24 -bottom-32 -z-10 size-[520px] rounded-full bg-brand opacity-25 blur-[120px] lg:right-[-8%] lg:bottom-[-10%] lg:size-[680px]"
        />

        <Image
          src="/brand/boop-logo-claro.webp"
          alt="Boop"
          width={330}
          height={164}
          priority
          className="h-auto w-20 lg:w-24"
        />

        <div
          aria-hidden="true"
          className={`${ENTER} pointer-events-none absolute top-6 right-[-18%] w-[62%] max-w-[300px] duration-1000 motion-safe:zoom-in-90 sm:right-[-6%] sm:max-w-[340px] lg:top-[18%] lg:right-[-10%] lg:w-[78%] lg:max-w-[640px]`}
        >
          <Image
            src="/brand/boop-escultura.webp"
            alt=""
            width={960}
            height={960}
            priority
            sizes="(min-width: 1024px) 45vw, 60vw"
            className="h-auto w-full -rotate-[7deg] drop-shadow-[0_40px_60px_rgb(0_0_0/0.45)]"
          />
        </div>

        <div className="relative mt-auto max-w-[60%] lg:max-w-none">
          <p
            className={`${ENTER} font-display text-[44px] leading-[0.85] font-semibold tracking-[-0.06em] duration-700 motion-safe:slide-in-from-bottom-4 sm:text-6xl lg:text-[clamp(72px,8vw,128px)]`}
          >
            Olhe
            <br />
            além.
          </p>
          <p
            className={`${ENTER} mt-4 hidden max-w-xs text-lg leading-snug tracking-[-0.02em] text-brand-paper/80 delay-200 duration-700 motion-safe:slide-in-from-bottom-2 sm:block lg:mt-8 lg:text-2xl`}
          >
            Antes da entrega,
            <br />a pergunta certa.
          </p>
        </div>
      </section>

      <section className="flex flex-col px-6 py-10 sm:px-10 lg:px-16">
        <div className="flex flex-1 flex-col lg:justify-center">
          <div
            className={`${ENTER} mx-auto w-full max-w-[380px] delay-100 duration-500 motion-safe:slide-in-from-bottom-3`}
          >
            <p className="flex items-center gap-2 text-xs font-medium tracking-[0.08em] text-muted-foreground uppercase">
              <span aria-hidden="true" className="size-1.5 rounded-full bg-brand" />
              Boop Admin
            </p>
            <h1 className="mt-3 font-display text-3xl font-semibold tracking-[-0.03em] text-foreground">
              {next ? "Conectar o Claude" : "Que bom te ver."}
            </h1>
            <p className="mt-2 text-sm text-muted-foreground">
              {next ? "Entre para conectar o Claude ao Boop Admin." : "Entre com o e-mail e a senha da sua conta."}
            </p>
            <div className="mt-8">
              <LoginForm next={next} />
            </div>
          </div>
        </div>
        <p className="mx-auto mt-10 w-full max-w-[380px] text-xs text-muted-foreground">
          Acesso restrito à equipe e aos clientes da Boop.
        </p>
      </section>
    </main>
  )
}
