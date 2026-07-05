import type { CalibreBook } from "@my-reader/tools/types/book"
import { BookOpen } from "lucide-react"
import { type KeyboardEvent, memo } from "react"
import { useTranslation } from "react-i18next"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { useBookDownloadState } from "@/hooks/queries/useBookDownloadState"
import { getReadActionLabel } from "@/lib/readingProgress"
import { cn } from "@/lib/utils"
import { BookCover, type BookProgressSnapshot } from "./BookCover"
import { BookDownloadIndicator } from "./BookDownloadIndicator"
import { BookMoreMenu } from "./BookMoreMenu"
import { BookProgressLabel } from "./BookProgressLabel"

interface BookCardProps {
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
 * Renders the desktop cover-first book card.
 */
const BookCard = memo(function BookCard({
  book,
  libraryId,
  onRead,
  onOpenReader,
  progress,
  fileActionsEnabled = true,
  selectedFormat,
  active = false,
}: BookCardProps) {
  const { t } = useTranslation()
  const primaryFormat = book.formats[0] ?? ""
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
    // biome-ignore lint/a11y/useSemanticElements: The card contains nested action buttons, so the outer target cannot be a button.
    <div
      className={cn(
        "group/card relative -m-1.5 min-w-0 cursor-pointer rounded-xl p-1.5 outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-primary-soft",
      )}
      onClick={() => onRead?.(book)}
      onKeyDown={handleKeyDown}
      role="button"
      tabIndex={0}
      aria-current={active ? "page" : undefined}
      aria-label={t("bookCard.openBook", { title: book.title })}
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
              triggerVariant="card"
            />
          </div>
        </div>
        {primaryFormat ? (
          <Badge
            variant="secondary"
            className="absolute start-2 top-2 rounded-sm border-0 bg-overlay px-1.5 py-0 text-[9px] uppercase tracking-wide text-ink-inverse/85 backdrop-blur-sm"
          >
            {primaryFormat}
          </Badge>
        ) : null}
      </div>

      <div className="mt-2 overflow-hidden px-0.5 pb-0.5">
        <p
          className={cn(
            "truncate text-sm font-medium leading-[1.35] text-foreground transition-colors duration-200",
            "group-hover/card:text-primary",
            active && "text-primary",
          )}
        >
          {book.title}
        </p>
        <div className="mt-0.5 flex min-w-0 items-center gap-1.5">
          <div className="min-w-0 flex-1">
            <BookProgressLabel progress={progress} />
          </div>
          <BookDownloadIndicator state={downloadState} variant="icon" />
        </div>
        {progress?.syncedLabel ? (
          <div className="mt-1 flex items-center gap-1.5">
            <span className="text-[10px] text-muted-foreground">
              {progress.syncedLabel}
            </span>
          </div>
        ) : null}
      </div>
    </div>
  )
})

export default BookCard
