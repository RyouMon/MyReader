import { formatHumanReadableTime } from "@my-reader/tools/human-readable-time"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { TFunction } from "i18next"
import { Bookmark } from "lucide-react"
import { useTranslation } from "react-i18next"
import { ReaderItemList } from "@/components/reader/shared/ReaderItemList"
import {
  Empty,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from "@/components/ui/empty"

export type ReadiumBookmarkRow = {
  id: string
  locatorKey: string
  locator: ReaderLocator
  chapterTitle?: string
  createdAt: number
}

type ReadiumBookmarkListProps = {
  bookmarks: ReadiumBookmarkRow[]
  activeBookmarkLocatorKey?: string | null
  loading?: boolean
  mutating?: boolean
  error?: string | null
  onRetry?: () => void
  onSelect?: (row: ReadiumBookmarkRow) => void
  onDelete?: (row: ReadiumBookmarkRow) => void | Promise<void>
}

function bookmarkDisplay(
  bookmark: ReadiumBookmarkRow,
  index: number,
  language: string,
  t: TFunction,
) {
  const title = bookmark.chapterTitle?.trim() || bookmark.locator.title?.trim()
  const position = bookmark.locator.locations?.position
  const hasPosition = typeof position === "number" && position > 0
  const isPage =
    bookmark.locator.type.toLowerCase() === "application/pdf" ||
    bookmark.locator.type.toLowerCase().startsWith("image/")
  const formattedPosition = hasPosition
    ? new Intl.NumberFormat(language).format(position)
    : null
  const primary =
    isPage && formattedPosition
      ? t("reader.bookmarkPage", { page: formattedPosition })
      : title ||
        (formattedPosition
          ? t("reader.bookmarkPositionTitle", {
              position: formattedPosition,
            })
          : t("reader.bookmarkNumber", { number: index + 1 }))

  return {
    primary,
    trailing: !isPage && title ? formattedPosition : null,
    date: formatHumanReadableTime(bookmark.createdAt, language),
  }
}

export function ReadiumBookmarkList({
  bookmarks,
  activeBookmarkLocatorKey = null,
  loading = false,
  mutating = false,
  error,
  onRetry,
  onSelect,
  onDelete,
}: ReadiumBookmarkListProps) {
  const { i18n, t } = useTranslation()
  const language = i18n.resolvedLanguage ?? i18n.language
  const rows =
    error || loading
      ? []
      : bookmarks.map((bookmark, index) => {
          const display = bookmarkDisplay(bookmark, index, language, t)
          return {
            id: bookmark.id,
            title: display.primary,
            trailing: display.trailing,
            description: display.date,
            active: activeBookmarkLocatorKey === bookmark.locatorKey,
          }
        })

  return (
    <ReaderItemList
      rows={rows}
      mutating={mutating}
      labels={{
        select: t("reader.selectBookmark"),
        deselect: t("reader.deselectBookmark"),
        selected: (count) => t("reader.selectedBookmarks", { count }),
        deleteSelected: t("reader.deleteSelectedBookmarks"),
      }}
      onOpen={(id) => {
        const bookmark = bookmarks.find((row) => row.id === id)
        if (bookmark) onSelect?.(bookmark)
      }}
      onDelete={
        onDelete
          ? async (ids) => {
              for (const bookmark of bookmarks.filter((row) =>
                ids.includes(row.id),
              )) {
                await onDelete(bookmark)
              }
            }
          : undefined
      }
    >
      {error ? (
        <div className="flex flex-col items-center gap-3 py-8 text-center">
          <p
            className="whitespace-pre-wrap text-xs text-destructive"
            role="alert"
          >
            {t("reader.bookmarkLoadFailed")}: {error}
          </p>
          <button
            type="button"
            className="rounded-md px-3 py-1.5 text-sm text-reader-chrome-active hover:bg-[var(--reader-chrome-segment-idle)]"
            onClick={onRetry}
          >
            {t("common.retry")}
          </button>
        </div>
      ) : loading ? (
        <p className="py-8 text-center text-sm text-reader-chrome-muted">
          {t("common.loading")}
        </p>
      ) : bookmarks.length === 0 ? (
        <Empty className="text-reader-chrome-fg">
          <EmptyHeader>
            <EmptyMedia
              variant="icon"
              className="bg-[var(--reader-chrome-segment-idle)] text-reader-chrome-muted"
            >
              <Bookmark />
            </EmptyMedia>
            <EmptyTitle className="text-sm font-semibold text-reader-chrome-fg">
              {t("reader.empty.bookmarks.title")}
            </EmptyTitle>
            <EmptyDescription className="text-xs text-reader-chrome-muted">
              {t("reader.empty.bookmarks.detail")}
            </EmptyDescription>
          </EmptyHeader>
        </Empty>
      ) : null}
    </ReaderItemList>
  )
}
