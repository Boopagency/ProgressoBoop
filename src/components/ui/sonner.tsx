"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

import { useTheme } from "@/hooks/use-theme"

// Adaptado do shadcn/ui: o tema vem de useTheme (sem next-themes).
const Toaster = ({ ...props }: ToasterProps) => {
  const { resolved } = useTheme()
  return (
    <Sonner
      theme={resolved}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-4" />,
        info: <InfoIcon className="size-4" />,
        warning: <TriangleAlertIcon className="size-4" />,
        error: <OctagonXIcon className="size-4" />,
        loading: <Loader2Icon className="size-4 animate-spin" />,
      }}
      style={
        {
          "--normal-bg": "var(--popover)",
          "--normal-text": "var(--popover-foreground)",
          "--normal-border": "var(--glass-edge)",
          "--border-radius": "calc(var(--radius) + 2px)",
        } as React.CSSProperties
      }
      // Aviso de vidro, como os menus: desfoque e a sombra das superfícies que flutuam.
      toastOptions={{ classNames: { toast: "backdrop-blur-xl !shadow-float" } }}
      {...props}
    />
  )
}

export { Toaster }
