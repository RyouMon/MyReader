import { formatHumanReadableTime } from "@my-reader/tools/human-readable-time"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { TFunction } from "i18next"
import { Bookmark, Check, CircleCheck, List, Trash2 } from "lucide-react"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"
import {
  ReaderSidePanelFrame,
  ReaderSidePanelHeader,
  ReaderSidePanelScrollArea,
} from "@/components/reader/shared/ReaderSidePanelChrome"
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu"

export type ReadiumTocRow = {
  key?: string
  depth: number
  title: string
  href: string
  type?: string
}

interface ReadiumTocPanelProps {
  visible: boolean
  rows: ReadiumTocRow[]
  activeKey: string | null
  onSelect: (row: ReadiumTocRow) => void
  bookmarks?: ReadiumBookmarkRow[]
  bookmarksLoading?: boolean
  bookmarksMutating?: boolean
  bookmarksError?: string | null
  onBookmarksRetry?: () => void
  onBookmarkSelect?: (row: ReadiumBookmarkRow) => void
  onBookmarkDelete?: (row: ReadiumBookmarkRow) => void | Promise<void>
  onClose?: () => void
}

export type ReadiumBookmarkRow = {
  id: string
  locatorKey: string
  locator: ReaderLocator
  chapterTitle?: string
  createdAt: number
}

const EMPTY_BOOKMARKS: ReadiumBookmarkRow[] = []

function readiumTocRowKey(row: ReadiumTocRow, index: number): string {
  return row.key ?? `${index}-${row.depth}-${row.href}-${row.title}`
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

export function ReadiumTocPanel({
  visible,
  rows,
  activeKey,
  onSelect,
  bookmarks = EMPTY_BOOKMARKS,
  bookmarksLoading = false,
  bookmarksMutating = false,
  bookmarksError,
  onBookmarksRetry,
  onBookmarkSelect,
  onBookmarkDelete,
  onClose,
}: ReadiumTocPanelProps) {
  const { i18n, t } = useTranslation()
  const [activeTab, setActiveTab] = useState<"toc" | "bookmarks">("toc")
  const [selectedBookmarkIds, setSelectedBookmarkIds] = useState<Set<string>>(
    () => new Set(),
  )
  const language = i18n.resolvedLanguage ?? i18n.language
  const selectedBookmarks = bookmarks.filter((bookmark) =>
    selectedBookmarkIds.has(bookmark.id),
  )
  const selectionMode = selectedBookmarks.length > 0

  useEffect(() => {
    if (visible) return
    setSelectedBookmarkIds((current) =>
      current.size === 0 ? current : new Set(),
    )
  }, [visible])

  useEffect(() => {
    if (!selectionMode) return
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return
      setSelectedBookmarkIds(new Set())
    }
    window.addEventListener("keydown", handleKeyDown)
    return () => window.removeEventListener("keydown", handleKeyDown)
  }, [selectionMode])

  function startBookmarkSelection(bookmarkId: string) {
    setSelectedBookmarkIds((current) => new Set(current).add(bookmarkId))
  }

  function toggleBookmarkSelection(bookmarkId: string) {
    setSelectedBookmarkIds((current) => {
      const next = new Set(current)
      if (next.has(bookmarkId)) next.delete(bookmarkId)
      else next.add(bookmarkId)
      return next
    })
  }

  async function deleteSelectedBookmarks() {
    if (bookmarksMutating || !onBookmarkDelete) return
    for (const bookmark of selectedBookmarks) {
      await onBookmarkDelete(bookmark)
    }
    setSelectedBookmarkIds(new Set())
  }

  return (
    <ReaderSidePanelFrame visible={visible} side="left">
      <ReaderSidePanelHeader
        title={t("reader.navigation")}
        icon={List}
        onClose={onClose}
      />
      <div
        className="mx-4 mt-3 grid grid-cols-2 rounded-md bg-[var(--reader-chrome-segment-idle)] p-0.5"
        role="tablist"
        aria-label={t("reader.navigation")}
      >
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "toc"}
          className="rounded-md px-2 py-1.5 text-xs font-medium text-reader-chrome-muted transition-colors aria-selected:bg-[var(--reader-chrome-segment-active)] aria-selected:text-reader-chrome-active"
          onClick={() => {
            setActiveTab("toc")
            setSelectedBookmarkIds(new Set())
          }}
        >
          {t("reader.toc")}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={activeTab === "bookmarks"}
          className="rounded-md px-2 py-1.5 text-xs font-medium text-reader-chrome-muted transition-colors aria-selected:bg-[var(--reader-chrome-segment-active)] aria-selected:text-reader-chrome-active"
          onClick={() => setActiveTab("bookmarks")}
        >
          {t("reader.bookmarks")}
        </button>
      </div>
      <ReaderSidePanelScrollArea>
        {activeTab === "toc" ? (
          <nav className="px-4 py-3">
            <ul className="space-y-0.5">
              {rows.map((row, index) => {
                const rowKey = readiumTocRowKey(row, index)
                const isActive = activeKey === rowKey
                return (
                  <li key={rowKey}>
                    <button
                      type="button"
                      className="reader-chrome-toc-item w-full rounded-md px-2 py-1.5 text-start text-sm transition-colors"
                      aria-current={isActive ? "location" : undefined}
                      style={{ paddingInlineStart: `${8 + row.depth * 12}px` }}
                      onClick={() => onSelect(row)}
                    >
                      {row.title}
                    </button>
                  </li>
                )
              })}
            </ul>
          </nav>
        ) : (
          <div className="px-4 py-3">
            {bookmarksError ? (
              <div className="flex flex-col items-center gap-3 py-8 text-center">
                <p className="text-xs text-destructive" role="alert">
                  {t("reader.bookmarkLoadFailed")}: {bookmarksError}
                </p>
                <button
                  type="button"
                  className="rounded-md px-3 py-1.5 text-sm text-reader-chrome-active hover:bg-[var(--reader-chrome-segment-idle)]"
                  onClick={onBookmarksRetry}
                >
                  {t("common.retry")}
                </button>
              </div>
            ) : bookmarksLoading ? (
              <p className="py-8 text-center text-sm text-reader-chrome-muted">
                {t("common.loading")}
              </p>
            ) : bookmarks.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-10 text-center text-reader-chrome-muted">
                <Bookmark className="size-5 opacity-60" />
                <p className="text-sm">{t("reader.noBookmarks")}</p>
              </div>
            ) : (
              <ul className="space-y-0.5">
                {bookmarks.map((bookmark, index) => {
                  const display = bookmarkDisplay(bookmark, index, language, t)
                  const selected = selectedBookmarkIds.has(bookmark.id)
                  return (
                    <ContextMenu key={bookmark.id} modal={false}>
                      <ContextMenuTrigger asChild>
                        <li
                          className={`reader-chrome-toc-item rounded-md transition-colors ${selected ? "bg-[var(--reader-chrome-toc-row-active)]" : ""}`}
                        >
                          <button
                            type="button"
                            aria-pressed={selectionMode ? selected : undefined}
                            className="flex w-full items-start gap-2.5 rounded-md px-2 py-2.5 text-start"
                            onClick={() => {
                              if (selectionMode) {
                                toggleBookmarkSelection(bookmark.id)
                                return
                              }
                              onBookmarkSelect?.(bookmark)
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
                                <span className="line-clamp-2 min-w-0 flex-1 text-sm font-medium leading-5 text-reader-chrome-fg">
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
                            if (selected) {
                              toggleBookmarkSelection(bookmark.id)
                              return
                            }
                            startBookmarkSelection(bookmark.id)
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
                          disabled={bookmarksMutating || !onBookmarkDelete}
                          onSelect={() => void onBookmarkDelete?.(bookmark)}
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
        )}
      </ReaderSidePanelScrollArea>
      {activeTab === "bookmarks" && selectionMode ? (
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
            disabled={
              bookmarksMutating ||
              selectedBookmarks.length === 0 ||
              !onBookmarkDelete
            }
            onClick={() => void deleteSelectedBookmarks()}
          >
            <Trash2 className="size-[18px]" />
          </button>
        </div>
      ) : null}
    </ReaderSidePanelFrame>
  )
}
