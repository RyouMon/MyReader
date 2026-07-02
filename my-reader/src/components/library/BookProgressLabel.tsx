import { memo } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import {
  type BookProgressSnapshot,
  getProgressDisplay,
} from "@/lib/readingProgress"
import { cn } from "@/lib/utils"

type BookProgressLabelProps = {
  progress?: BookProgressSnapshot
  className?: string
}

function BookProgressLabelImpl({
  progress,
  className,
}: BookProgressLabelProps) {
  const { t } = useTranslation()
  const { text, isUnread, isFinished, isStatusLabel } = getProgressDisplay(
    progress,
    t,
  )

  if (isStatusLabel) {
    return (
      <Badge
        variant="secondary"
        className={cn(
          "rounded-sm border-0 px-1.5 py-0 text-[9px] font-semibold",
          isUnread && "bg-muted text-muted-foreground",
          isFinished && "bg-success-soft text-success",
          !isUnread && !isFinished && "bg-accent text-accent-foreground",
          className,
        )}
      >
        {text}
      </Badge>
    )
  }

  return (
    <span
      className={cn(
        "text-[11px] tabular-nums text-muted-foreground",
        className,
      )}
    >
      {text}
    </span>
  )
}

export const BookProgressLabel = memo(BookProgressLabelImpl)
