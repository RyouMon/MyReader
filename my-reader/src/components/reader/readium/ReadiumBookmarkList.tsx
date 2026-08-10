import { formatHumanReadableTime } from "@my-reader/tools/human-readable-time"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { TFunction } from "i18next"
import { Bookmark, Check, CircleCheck, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import { ReaderSidePanelScrollArea } from "@/components/reader/shared/ReaderSidePanelChrome"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"
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
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set())
  const language = i18n.resolvedLanguage ?? i18n.language
  const selectedBookmarks = bookmarks.filter((bookmark) =>
    selectedIds.has(bookmark.id),
  )
  const selectionMode = selectedBookmarks.length > 0

  useEffect(() => {
    if (!selectionMode) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setSelectedIds(new Set())
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectionMode])

  function startSelection(bookmarkId: string) {
    setSelectedIds((current) => new Set(current).add(bookmarkId))
  }

  function toggleSelection(bookmarkId: string) {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(bookmarkId)) next.delete(bookmarkId)
      else next.add(bookmarkId)
      return next
    })
  }

  async function deleteSelected() {
    if (mutating || !onDelete) return
    for (const bookmark of selectedBookmarks) await onDelete(bookmark)
    setSelectedIds(new Set())
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <ReaderSidePanelScrollArea className="flex min-h-full flex-col">
        <div className="flex flex-1 flex-col px-4 py-3">
          {error ? (
            <div className="flex flex-col items-center gap-3 py-8 text-center">
              <p className="text-xs text-destructive" role="alert">
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
          ) : (
            <ul className="space-y-0.5">
              {bookmarks.map((bookmark, index) => {
                const display = bookmarkDisplay(bookmark, index, language, t)
                const selected = selectedIds.has(bookmark.id)
                const active =
                  !selectionMode &&
                  activeBookmarkLocatorKey === bookmark.locatorKey
                return (
                  <ContextMenu key={bookmark.id} modal={false}>
                    <ContextMenuTrigger asChild>
                      <li>
                        <button
                          type="button"
                          aria-current={active ? "location" : undefined}
                          aria-pressed={selectionMode ? selected : undefined}
                          className={`reader-chrome-toc-item flex w-full items-start gap-2.5 rounded-md px-2 py-2.5 text-start transition-colors ${selected ? "bg-[var(--reader-chrome-toc-row-active)]" : ""}`}
                          onClick={() => {
                            if (selectionMode) {
                              toggleSelection(bookmark.id)
                              return
                            }
                            onSelect?.(bookmark)
                          }}
                        >
                          {selectionMode ? (
                            <span
                              aria-hidden="true"
                              className={`mt-0.5 flex size-4 shrink-0 items-center justify-center rounded-full border transition-colors ${selected ? "border-reader-chrome-active bg-reader-chrome-active text-[var(--reader-panel-bg)]" : "border-reader-chrome-muted text-transparent"}`}
                            >
                              <Check className="size-3" strokeWidth={2.5} />
                            </span>
                          ) : null}
                          <span className="min-w-0 flex-1">
                            <span className="flex min-w-0 items-start gap-3">
                              <span className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-5">
                                {display.primary}
                              </span>
                              {display.trailing ? (
                                <span className="shrink-0 text-xs leading-5 tabular-nums text-reader-chrome-muted">
                                  {display.trailing}
                                </span>
                              ) : null}
                            </span>
                            {display.date ? (
                              <span className="mt-0.5 block truncate text-xs leading-4 text-reader-chrome-muted">
                                {display.date}
                              </span>
                            ) : null}
                          </span>
                        </button>
                      </li>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-40">
                      <ContextMenuItem
                        onSelect={() => {
                          if (selected) toggleSelection(bookmark.id)
                          else startSelection(bookmark.id)
                        }}
                      >
                        <CircleCheck />
                        {selected
                          ? t("reader.deselectBookmark")
                          : t("reader.selectBookmark")}
                      </ContextMenuItem>
                      <ContextMenuSeparator />
                      <ContextMenuItem
                        variant="destructive"
                        disabled={mutating || !onDelete}
                        onSelect={() => void onDelete?.(bookmark)}
                      >
                        <Trash2 />
                        {t("common.delete")}
                      </ContextMenuItem>
                    </ContextMenuContent>
                  </ContextMenu>
                )
              })}
            </ul>
          )}
        </div>
      </ReaderSidePanelScrollArea>
      {selectionMode ? (
        <div className="relative flex min-h-14 shrink-0 items-center border-t border-reader-chrome-border px-4">
          <p
            className="w-full text-center text-xs font-medium text-reader-chrome-muted"
            aria-live="polite"
          >
            {t("reader.selectedBookmarks", {
              count: selectedBookmarks.length,
            })}
          </p>
          <button
            type="button"
            className="absolute end-3 flex size-9 items-center justify-center rounded-full text-destructive transition-colors hover:bg-destructive/10 disabled:opacity-50"
            aria-label={t("reader.deleteSelectedBookmarks")}
            title={t("reader.deleteSelectedBookmarks")}
            disabled={mutating || !onDelete}
            onClick={() => void deleteSelected()}
          >
            <Trash2 className="size-[18px]" />
          </button>
        </div>
      ) : null}
    </div>
  )
}
