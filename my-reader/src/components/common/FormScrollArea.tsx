import type { ComponentProps } from "react"
import { cn } from "@/lib/utils"

export function FormScrollArea({ className, ...props }: ComponentProps<"div">) {
  // Floating labels extend above the first input.
  return (
    <div
      data-slot="form-scroll-area"
      className={cn("min-h-0 overflow-y-auto pt-3", className)}
      {...props}
    />
  )
}
