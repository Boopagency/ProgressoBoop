"use client"

import { CheckIcon } from "lucide-react"
import { Checkbox as CheckboxPrimitive } from "radix-ui"
import type { ComponentProps } from "react"

import { cn } from "@/lib/utils"

/** Checkbox redondo de conclusão de tarefa (baseado no Checkbox do shadcn/Radix). */
export function TaskCheckbox({
  className,
  size = "default",
  ...props
}: ComponentProps<typeof CheckboxPrimitive.Root> & { size?: "sm" | "default" | "lg" }) {
  return (
    <CheckboxPrimitive.Root
      data-slot="task-checkbox"
      className={cn(
        "peer grid shrink-0 cursor-pointer place-content-center rounded-full border-[1.5px] border-muted-foreground/35 bg-background text-white transition-[background-color,border-color,box-shadow] duration-150 outline-none",
        "hover:border-muted-foreground/70 focus-visible:ring-[3px] focus-visible:ring-ring/40",
        "data-[state=checked]:border-success data-[state=checked]:bg-success",
        "disabled:cursor-not-allowed disabled:opacity-50",
        size === "lg" ? "size-5" : size === "sm" ? "size-3.5 border-[1.25px]" : "size-[18px]",
        className
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator className="grid place-content-center animate-in duration-150 zoom-in-75">
        <CheckIcon
          className={size === "lg" ? "size-3.5" : size === "sm" ? "size-2.5" : "size-3"}
          strokeWidth={3}
        />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  )
}
