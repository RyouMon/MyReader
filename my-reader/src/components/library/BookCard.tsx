import { BookOpen, Ellipsis } from "lucide-react"
import { memo, type KeyboardEvent } from "react"

import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import type { CalibreBook } from "my-reader-tools/types/book"
import { BookCover, type BookProgressSnapshot } from "./BookCover"

interface BookCardProps {
  book: CalibreBook
  libraryId: string | null
  onRead?: (book: CalibreBook) => void
  onMore?: (book: CalibreBook) => void
  progress?: BookProgressSnapshot
}

/**
 * Returns the action label that matches the optional progress snapshot.
 */
function getReadLabel(progress?: BookProgressSnapshot) {
  if (typeof progress?.percent !== "number" || progress.percent <= 0) {
    return "开始阅读"
  }
  if (progress.percent >= 100) {
    return "再次阅读"
  }
  return "继续阅读"
}

/**
 * Renders the desktop cover-first book card.
 */
const BookCard = memo(function BookCard({
  book,
  libraryId,
  onRead,
  onMore,
  progress,
}: BookCardProps) {
  const displayAuthor = book.authors.join(", ")
  const primaryFormat = book.formats[0] ?? ""
  const readLabel = getReadLabel(progress)
  const showProgressBadge = typeof progress?.percent === "number"

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return
    }
    event.preventDefault()
    onRead?.(book)
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: The card contains nested action buttons, so the outer target cannot be a button.
    <div
      className="group/card min-w-0 cursor-pointer outline-none"
      onClick={() => onRead?.(book)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
    >
      <div className="relative aspect-[2/3] w-full overflow-hidden rounded-lg transition duration-200 ease-out group-hover/card:-translate-y-1 group-hover/card:shadow-[var(--shadow-md)] group-active/card:scale-[0.98]">
        <BookCover
          book={book}
          libraryId={libraryId}
          progress={progress}
          className="size-full rounded-lg"
          titleClassName="text-xs"
        />
        <div className="absolute inset-0 flex items-end justify-end p-2.5 opacity-0 transition-opacity duration-200 group-hover/card:opacity-100">
          <div className="absolute inset-0 bg-gradient-to-t from-black/25 via-black/10 to-transparent" />
          <div className="relative z-10 flex items-center gap-2 rounded-full border border-ink-inverse/20 bg-black/10 p-1 shadow-[0_4px_14px_rgba(0,0,0,0.24)] backdrop-blur-[2px]">
            <Button
              type="button"
              size="icon-sm"
              title={readLabel}
              aria-label={readLabel}
              className="size-9 rounded-full border border-primary/80 bg-primary text-primary-foreground shadow-[0_2px_10px_rgba(196,98,45,0.45)] hover:bg-primary/90"
              onClick={(event) => {
                event.stopPropagation()
                onRead?.(book)
              }}
            >
              <BookOpen className="size-4" />
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="icon-sm"
              title="更多操作"
              aria-label="更多操作"
              className="size-9 rounded-full border border-ink-inverse/35 bg-ink-inverse/20 text-ink-inverse backdrop-blur-sm hover:bg-ink-inverse/30"
              onClick={(event) => {
                event.stopPropagation()
                onMore?.(book)
              }}
            >
              <Ellipsis className="size-4" />
            </Button>
          </div>
        </div>
        {primaryFormat ? (
          <Badge
            variant="secondary"
            className="absolute left-2 top-2 rounded-sm border-0 bg-overlay px-1.5 py-0 text-[9px] uppercase tracking-wide text-ink-inverse/85 backdrop-blur-sm"
          >
            {primaryFormat}
          </Badge>
        ) : null}
      </div>

      <div className="mt-2 h-[70px] overflow-hidden px-0.5">
        <p
          className={cn(
            "truncate font-serif text-sm font-medium leading-[1.35] text-foreground transition-colors duration-200",
            "group-hover/card:text-primary",
          )}
        >
          {book.title}
        </p>
        <p className="mt-0.5 truncate text-xs text-muted-foreground">
          {displayAuthor}
        </p>
        {showProgressBadge ? (
          <div className="mt-1 flex items-center gap-1.5">
            <Badge
              variant="secondary"
              className="rounded-sm border-0 bg-accent-ui px-1.5 py-0 text-[9px] font-semibold text-primary"
            >
              {Math.round(progress.percent ?? 0)}%
            </Badge>
          </div>
        ) : null}
      </div>
    </div>
  )
})

export default BookCard
