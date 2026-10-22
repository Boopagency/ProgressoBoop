import type { Metadata, Viewport } from "next"
import { Inter, Poppins } from "next/font/google"

import { VisualViewportVars } from "@/components/layout/visual-viewport"
import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"
import { THEME_COLOR, THEME_SCRIPT } from "@/lib/theme"

import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
})

// Fonte da marca (a mesma do site). Só em títulos e números de destaque.
const poppins = Poppins({
  variable: "--font-poppins",
  subsets: ["latin"],
  weight: ["500", "600"],
})

export const metadata: Metadata = {
  title: {
    default: "Boop Admin",
    template: "%s · Boop Admin",
  },
  description: "Cockpit interno da Boop.",
  robots: { index: false, follow: false },
  // App instalável (src/app/manifest.ts): no iPhone, abre sem a barra do Safari.
  appleWebApp: { capable: true, title: "Boop", statusBarStyle: "default" },
}

export const viewport: Viewport = {
  // A página vai até as bordas da tela (no app instalado, até a barrinha de
  // baixo do iPhone); o menu de baixo e as barras fixas usam env(safe-area-inset-*).
  viewportFit: "cover",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: THEME_COLOR.light },
    { media: "(prefers-color-scheme: dark)", color: THEME_COLOR.dark },
  ],
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    // O script põe a classe `dark` no <html> antes da pintura (veja src/lib/theme.ts).
    <html lang="pt-BR" className={`${inter.variable} ${poppins.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body className="min-h-svh font-sans">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        {/* No celular, os avisos ficam acima do menu de baixo. */}
        <Toaster position="bottom-right" mobileOffset={{ bottom: "calc(4.5rem + env(safe-area-inset-bottom))" }} />
        <VisualViewportVars />
      </body>
    </html>
  )
}
