import type { Metadata, Viewport } from "next"
import { Inter } from "next/font/google"

import { Toaster } from "@/components/ui/sonner"
import { TooltipProvider } from "@/components/ui/tooltip"

import "./globals.css"

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  axes: ["opsz"],
})

export const metadata: Metadata = {
  title: {
    default: "Boop Admin",
    template: "%s · Boop Admin",
  },
  description: "Cockpit interno da Boop.",
  robots: { index: false, follow: false },
}

export const viewport: Viewport = {
  themeColor: "#f7f7f5",
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={inter.variable}>
      <body className="min-h-svh font-sans">
        <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
        <Toaster position="bottom-right" />
      </body>
    </html>
  )
}
