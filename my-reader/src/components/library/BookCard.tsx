import type { CalibreBook } from "@my-reader/tools/types/book"
import { type KeyboardEvent, memo } from "react"
import { useTranslation } from "react-i18next"
import {
  type BookDownloadStateOptions,
  useBookDownloadState,
} from "@/hooks/queries/useBookDownloadState"
import { cn } from "@/lib/utils"
import { BookCover, type BookProgressSnapshot } from "./BookCover"
import { BookDownloadIndicator } from "./BookDownloadIndicator"
import { BookContextMenu } from "./BookMoreMenu"
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
  fileStateSource?: BookDownloadStateOptions["fileStateSource"]
}

/**
 * Renders the desktop cover-first book card.
 */
const BookCard = memo(function BookCard({
  book,
  libraryId,
  onRead,
  progress,
  fileActionsEnabled = true,
  selectedFormat,
  active = false,
  fileStateSource,
}: BookCardProps) {
  const { t } = useTranslation()
  const downloadState = useBookDownloadState(
    libraryId,
    book.id,
    book.readableFormats,
    selectedFormat,
    { fileStateSource, preferredFormat: book.preferredFormat },
  )

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "Enter" && event.key !== " ") {
      return
    }
    event.preventDefault()
    onRead?.(book)
  }

  return (
    <BookContextMenu
      book={book}
      libraryId={libraryId}
      fileActionsEnabled={fileActionsEnabled}
      selectedFormat={selectedFormat}
    >
      {/* biome-ignore lint/a11y/useSemanticElements: The card is a composite clickable target used as a Radix context menu trigger. */}
      <div
        className={cn(
          "group/card relative min-w-0 cursor-pointer rounded-lg outline-none transition-colors focus-visible:ring-2 focus-visible:ring-ring",
        )}
        onClick={() => onRead?.(book)}
        onKeyDown={handleKeyDown}
        role="button"
        tabIndex={0}
        aria-current={active ? "page" : undefined}
        aria-label={t("bookCard.openBook", { title: book.title })}
      >
        {active ? (
          <span
            aria-hidden
            className="pointer-events-none absolute -inset-1.5 rounded-xl bg-primary-soft"
          />
        ) : null}
        <div className="relative z-10 aspect-[2/3] w-full overflow-hidden rounded-lg transition duration-200 ease-out group-hover/card:-translate-y-1 group-hover/card:shadow-[var(--shadow-md)] group-active/card:scale-[0.98]">
          <BookCover
            book={book}
            libraryId={libraryId}
            progress={progress}
            className="size-full rounded-lg"
            titleClassName="text-xs"
            showSpine={false}
            deferFallbackMetaUntilError
            probeCoverWhenUnknown
          />
        </div>

        <div className="relative z-10 mt-2 overflow-hidden px-0.5 pb-0.5">
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
    </BookContextMenu>
  )
})

export default BookCard
