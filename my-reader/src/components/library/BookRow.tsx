import { BookOpen, Ellipsis } from "lucide-react"
import type { CalibreBook } from "@my-reader/tools/types/book"
import { type KeyboardEvent, memo } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { cn } from "@/lib/utils"
import { BookCover, type BookProgressSnapshot } from "./BookCover"

interface BookRowProps {
  book: CalibreBook
  libraryId: string | null
  onRead?: (book: CalibreBook) => void
  onMore?: (book: CalibreBook) => void
  progress?: BookProgressSnapshot
}

function useProgressLabel(progress?: BookProgressSnapshot) {
  const { t } = useTranslation()
  if (progress?.statusLabel) {
    return progress.statusLabel
  }
  if (typeof progress?.percent !== "number" || progress.percent <= 0) {
    return t("bookRow.unread")
  }
  if (progress.percent >= 100) {
    return t("bookRow.finished")
  }
  return t("bookRow.reading")
}

/**
 * Renders the desktop compact list row for a book.
 */
const BookRow = memo(function BookRow({
  book,
  libraryId,
  onRead,
  onMore,
  progress,
}: BookRowProps) {
  const { t } = useTranslation()
  const displayAuthor = book.authors.join(", ")
  const primaryFormat = book.formats[0] ?? ""
  const hasProgress = typeof progress?.percent === "number"
  const isUnread = !hasProgress || (progress.percent ?? 0) <= 0
  const readLabel = isUnread ? t("bookCard.startReading") : t("bookCard.continueReading")

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return
    }
    event.preventDefault()
    onRead?.(book)
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: The row contains nested action buttons, so the outer target cannot be a button.
    <div
      className="group/row flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 outline-none transition-colors hover:bg-hover-bg focus-visible:ring-2 focus-visible:ring-ring"
      onClick={() => onRead?.(book)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-label={t("bookCard.openBook", { title: book.title })}
    >
      <BookCover
        book={book}
        libraryId={libraryId}
        progress={progress}
        className="h-[42px] w-[30px] shrink-0 rounded-[5px]"
        titleClassName="sr-only"
        spineClassName="w-1"
        showFallbackMeta={false}
      />

      <div className="min-w-0 flex-1">
        <p className="truncate text-[13px] font-medium leading-5 text-foreground">
          {book.title}
        </p>
        <p className="truncate text-[11px] leading-4 text-muted-foreground">
          {displayAuthor}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <Badge
            variant="secondary"
            className={cn(
              "rounded-sm border-0 px-1.5 py-0 text-[9px] font-semibold",
              isUnread
                ? "bg-muted text-muted-foreground"
                : "bg-accent-ui text-primary",
            )}
          >
            {useProgressLabel(progress)}
          </Badge>
          {hasProgress ? (
            <span className="text-[10px] text-muted-foreground">
              {Math.round(progress.percent ?? 0)}%
            </span>
          ) : null}
          {primaryFormat ? (
            <span className="text-[10px] uppercase text-muted-foreground">
              {primaryFormat}
            </span>
          ) : null}
          {progress?.syncedLabel ? (
            <span className="text-[10px] text-muted-foreground">
              {progress.syncedLabel}
            </span>
          ) : null}
        </div>
        {hasProgress ? (
          <div className="mt-1 h-0.5 w-12 overflow-hidden rounded-full bg-progress-track">
            <div
              className="h-full rounded-full bg-progress opacity-70"
              style={{
                width: `${Math.max(0, Math.min(100, progress.percent ?? 0))}%`,
              }}
            />
          </div>
        ) : null}
      </div>

      <div className="flex shrink-0 items-center gap-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={readLabel}
          aria-label={readLabel}
          className="size-7 text-primary hover:bg-accent-ui"
          onClick={(event) => {
            event.stopPropagation()
            onRead?.(book)
          }}
        >
          <BookOpen className="size-4" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={t("bookCard.moreActions")}
          aria-label={t("bookCard.moreActions")}
          className="size-7 text-muted-foreground hover:bg-hover-bg hover:text-foreground"
          onClick={(event) => {
            event.stopPropagation()
            onMore?.(book)
          }}
        >
          <Ellipsis className="size-4" />
        </Button>
      </div>
    </div>
  )
})

export default BookRow
