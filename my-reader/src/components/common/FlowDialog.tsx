import {
  ArrowLeft,
  ChevronRight,
  Loader2,
  type LucideIcon,
  X,
} from "lucide-react"
import type { ComponentProps } from "react"

import { Button } from "@/components/ui/button"
import {
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

type FlowDialogContentProps = Omit<
  ComponentProps<typeof DialogContent>,
  "showCloseButton"
>

export function FlowDialogContent({
  className,
  ...props
}: FlowDialogContentProps) {
  return (
    <DialogContent
      className={cn(
        "h-[min(86vh,720px)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[540px]",
        className,
      )}
      showCloseButton={false}
      {...props}
    />
  )
}

interface FlowDialogHeaderProps {
  title: string
  description?: string
  backLabel: string
  closeLabel: string
  showCloseButton: boolean
  onBack?: () => void
}

export function FlowDialogHeader({
  title,
  description,
  backLabel,
  closeLabel,
  showCloseButton,
  onBack,
}: FlowDialogHeaderProps) {
  return (
    <DialogHeader className="border-b border-border px-6 py-5">
      <div
        className={cn(
          "flex gap-3",
          description ? "items-start" : "items-center",
        )}
      >
        {onBack ? (
          <Button
            type="button"
            variant="ghost"
            size="icon-sm"
            className="-ms-2 shrink-0"
            onClick={onBack}
            aria-label={backLabel}
            title={backLabel}
          >
            <ArrowLeft />
          </Button>
        ) : null}
        <div className="flex min-w-0 flex-1 flex-col gap-1.5">
          <DialogTitle>{title}</DialogTitle>
          {description ? (
            <DialogDescription>{description}</DialogDescription>
          ) : null}
        </div>
        {showCloseButton ? (
          <DialogClose asChild>
            <Button
              type="button"
              variant="ghost"
              size="icon-sm"
              className="-me-2 shrink-0"
              aria-label={closeLabel}
              title={closeLabel}
            >
              <X />
            </Button>
          </DialogClose>
        ) : null}
      </div>
    </DialogHeader>
  )
}

interface FlowDialogChoiceProps {
  icon: LucideIcon
  title: string
  description?: string
  onClick: () => void
  compact?: boolean
  disabled?: boolean
  loading?: boolean
}

export function FlowDialogChoice({
  icon: Icon,
  title,
  description,
  onClick,
  compact = false,
  disabled = false,
  loading = false,
}: FlowDialogChoiceProps) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className={cn(
        "group flex w-full items-center rounded-lg border border-border bg-card text-start transition-colors",
        "hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring/50",
        "disabled:pointer-events-none disabled:opacity-50",
        compact ? "gap-2.5 p-3" : "gap-3 p-4",
      )}
    >
      <span
        className={cn(
          "flex shrink-0 items-center justify-center rounded-md bg-accent text-accent-foreground",
          compact ? "size-8" : "size-10",
        )}
      >
        {loading ? (
          <Loader2 className="size-4 animate-spin" />
        ) : (
          <Icon className="size-4" />
        )}
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium text-foreground">
          {title}
        </span>
        {description ? (
          <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
            {description}
          </span>
        ) : null}
      </span>
      <ChevronRight className="size-4 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
    </button>
  )
}
