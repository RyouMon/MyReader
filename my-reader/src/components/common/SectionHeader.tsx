import type { ReactNode } from "react"
import { cn } from "@/lib/utils"

interface SectionHeaderProps {
  title: ReactNode
  description?: ReactNode
  className?: string
  titleClassName?: string
}

export function SectionHeader({
  title,
  description,
  className,
  titleClassName,
}: SectionHeaderProps) {
  return (
    <div className={cn("mb-3", className)}>
      <h2 className={cn("text-sm font-medium", titleClassName)}>{title}</h2>
      {description ? (
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
      ) : null}
    </div>
  )
}
