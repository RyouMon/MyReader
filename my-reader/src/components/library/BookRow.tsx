import type { CalibreBook } from "@my-reader/tools/types/book"
import { BookOpen } from "lucide-react"
import { type KeyboardEvent, memo } from "react"
import { useTranslation } from "react-i18next"
import { Button } from "@/components/ui/button"
import { Progress } from "@/components/ui/progress"
import { useBookDownloadState } from "@/hooks/queries/useBookDownloadState"
import { getReadActionLabel } from "@/lib/readingProgress"
import { cn } from "@/lib/utils"
import { BookCover, type BookProgressSnapshot } from "./BookCover"
import { BookDownloadIndicator } from "./BookDownloadIndicator"
import { BookMoreMenu } from "./BookMoreMenu"
import { BookProgressLabel } from "./BookProgressLabel"

interface BookRowProps {
  book: CalibreBook
  libraryId: string | null
  onRead?: (book: CalibreBook) => void
  onOpenReader?: (book: CalibreBook) => void
  onMore?: (book: CalibreBook) => void
  progress?: BookProgressSnapshot
  fileActionsEnabled?: boolean
  selectedFormat?: string
  active?: boolean
}

/**
 * Renders the desktop compact list row for a book.
 */
const BookRow = memo(function BookRow({
  book,
  libraryId,
  onRead,
  onOpenReader,
  progress,
  fileActionsEnabled = true,
  selectedFormat,
  active = false,
}: BookRowProps) {
  const { t } = useTranslation()
  const displayAuthor = book.authors.join(", ")
  const primaryFormat = book.formats[0] ?? ""
  const hasProgress = typeof progress?.percent === "number"
  const readLabel = getReadActionLabel(progress, t)
  const downloadState = useBookDownloadState(
    libraryId,
    book.id,
    book.formats,
    selectedFormat,
  )

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
      className={cn(
        "group/row relative flex min-h-14 w-full cursor-pointer items-center gap-3 rounded-md px-2.5 py-1.5 outline-none transition-colors hover:bg-accent hover:text-accent-foreground focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-primary-soft text-primary",
      )}
      onClick={() => onRead?.(book)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-current={active ? "page" : undefined}
      aria-label={t("bookCard.openBook", { title: book.title })}
    >
      {active ? (
        <span className="absolute start-0 top-2 bottom-2 w-0.5 rounded-full bg-primary" />
      ) : null}
      <BookCover
        book={book}
        libraryId={libraryId}
        progress={progress}
        className="h-[42px] w-[30px] shrink-0 rounded-sm"
        titleClassName="sr-only"
        spineClassName="w-1"
        showFallbackMeta={false}
        probeCoverWhenUnknown
      />

      <div className="min-w-0 flex-1">
        <p
          className={cn(
            "truncate text-[13px] font-medium leading-5 text-foreground",
            active && "text-primary",
          )}
        >
          {book.title}
        </p>
        <p className="truncate text-[11px] leading-4 text-muted-foreground">
          {displayAuthor}
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
          <BookProgressLabel progress={progress} />
          {primaryFormat ? (
            <span className="text-[10px] uppercase text-muted-foreground">
              {primaryFormat}
            </span>
          ) : null}
          <BookDownloadIndicator
            state={downloadState}
            variant="icon"
            remoteOnly
          />
          {progress?.syncedLabel ? (
            <span className="text-[10px] text-muted-foreground">
              {progress.syncedLabel}
            </span>
          ) : null}
        </div>
        {hasProgress ? (
          <Progress
            value={Math.max(0, Math.min(100, progress.percent ?? 0))}
            className="mt-1 h-0.5 w-12 bg-progress-track [&_[data-slot=progress-indicator]]:bg-progress [&_[data-slot=progress-indicator]]:opacity-70"
          />
        ) : null}
      </div>

      <div
        className={cn(
          "flex shrink-0 items-center gap-0.5 transition-opacity",
          "opacity-0 group-hover/row:opacity-100 group-focus-within/row:opacity-100",
        )}
      >
        <Button
          type="button"
          variant="ghost"
          size="icon-sm"
          title={readLabel}
          aria-label={readLabel}
          className="size-7 text-primary hover:bg-accent hover:text-accent-foreground"
          onClick={(event) => {
            event.stopPropagation()
            ;(onOpenReader ?? onRead)?.(book)
          }}
        >
          <BookOpen className="size-4" />
        </Button>
        <BookMoreMenu
          book={book}
          libraryId={libraryId}
          fileActionsEnabled={fileActionsEnabled}
          selectedFormat={selectedFormat}
          triggerVariant="row"
        />
      </div>
    </div>
  )
})

export default BookRow
