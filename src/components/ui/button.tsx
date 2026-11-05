import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { cn } from "@/lib/utils"
import { Slot } from "radix-ui"

// Botões em pílula, como no resto do visual. `touch-target`: no toque, a área de toque chega a 44 px sem mudar o tamanho do botão.
// O principal é azul elétrico com brilho; o contorno é vidro com borda fina; o `circle` é o botão redondo da seta.
const buttonVariants = cva(
  "relative touch-target inline-flex shrink-0 items-center justify-center gap-2 rounded-full text-sm font-medium whitespace-nowrap transition-[background-color,border-color,color,box-shadow,transform] duration-150 ease-glide outline-none focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-50 disabled:saturate-50 aria-invalid:border-destructive aria-invalid:ring-destructive/20 dark:aria-invalid:ring-destructive/40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4",
  {
    variants: {
      variant: {
        default:
          "bg-primary bg-[linear-gradient(180deg,rgb(255_255_255/0.14),transparent_60%)] text-primary-foreground shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_8px_22px_-10px_rgb(47_107_240/0.9)] hover:bg-[#3a76f5] hover:shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_10px_28px_-8px_rgb(61_126_255/0.9)]",
        destructive:
          "bg-destructive text-white hover:bg-destructive/90 focus-visible:ring-destructive/20 dark:bg-destructive/60 dark:focus-visible:ring-destructive/40",
        outline:
          "border border-input bg-card shadow-[inset_0_1px_0_var(--glass-highlight)] hover:border-foreground/20 hover:bg-accent hover:text-accent-foreground",
        glass:
          "border border-glass-edge bg-glass text-foreground shadow-[inset_0_1px_0_var(--glass-highlight)] backdrop-blur-md hover:bg-accent",
        secondary:
          "bg-secondary text-secondary-foreground hover:bg-secondary/80",
        ghost:
          "hover:bg-accent hover:text-accent-foreground dark:hover:bg-accent/50",
        link: "text-primary underline-offset-4 hover:underline",
      },
      size: {
        default: "h-9 px-4 py-2 has-[>svg]:px-3",
        xs: "h-6 gap-1 rounded-full px-2 text-xs has-[>svg]:px-1.5 [&_svg:not([class*='size-'])]:size-3",
        sm: "h-8 gap-1.5 rounded-full px-3 has-[>svg]:px-2.5",
        lg: "h-10 rounded-full px-6 has-[>svg]:px-4",
        icon: "size-9",
        "icon-xs": "size-6 rounded-full [&_svg:not([class*='size-'])]:size-3",
        "icon-sm": "size-8",
        "icon-lg": "size-10",
        /* Botão redondo da seta (CTA das telas vitrine): contorno fino que brilha ao passar. */
        circle:
          "size-12 border border-foreground/25 bg-transparent text-foreground shadow-none hover:border-glow hover:bg-glow hover:text-white hover:shadow-glow [&_svg:not([class*='size-'])]:size-5",
      },
    },
    defaultVariants: {
      variant: "default",
      size: "default",
    },
  }
)

function Button({
  className,
  variant = "default",
  size = "default",
  asChild = false,
  ...props
}: React.ComponentProps<"button"> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean
  }) {
  const Comp = asChild ? Slot.Root : "button"

  return (
    <Comp
      data-slot="button"
      data-variant={variant}
      data-size={size}
      className={cn(buttonVariants({ variant, size, className }))}
      {...props}
    />
  )
}

export { Button, buttonVariants }
