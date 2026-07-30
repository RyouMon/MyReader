import type { CalibreBook } from "@my-reader/tools/types/book"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { Skeleton } from "@/components/ui/skeleton"
import { useOverlayScrollbar } from "@/hooks/use-overlay-scrollbar"
import {
  getBookProgressSnapshot,
  type ReadingProgressByBook,
} from "@/lib/readingProgress"
import BookCard from "./BookCard"
import BookRow from "./BookRow"

const GRID_CARD_WIDTH = 164
const MIN_GRID_CARD_WIDTH = 136
const MAX_GRID_CARD_WIDTH = 172
const GRID_GAP = 20
const MIN_GRID_GAP = 16
const MAX_GRID_GAP = 28
const NEXT_COLUMN_CARD_WIDTH = 152
const MIN_GRID_COLUMNS = 2
const SKELETON_COUNT = 20
const LIST_ROW_HEIGHT = 62
const TEXT_BLOCK_HEIGHT = 55
const ROW_GAP = 12
const ANCHOR_VISIBILITY_THRESHOLD = 48
const DEFAULT_GRID_LAYOUT = getGridLayoutMetrics(
  GRID_CARD_WIDTH * 4 + GRID_GAP * 3,
)

export type LibraryViewMode = "grid" | "list"

interface BookGridProps {
  books: Map<number, CalibreBook>
  total: number
  libraryId: string | null
  onRead?: (book: CalibreBook) => void
  onOpenReader?: (book: CalibreBook) => void
  onMore?: (book: CalibreBook) => void
  ensureRange: (start: number, end: number) => void
  header?: ReactNode
  viewMode?: LibraryViewMode
  fileActionsEnabled?: boolean
  selectedFormatById?: Record<string, string>
  progressByBookId?: ReadingProgressByBook
  activeBookId?: string | null
}

interface ScrollAnchor {
  bookIndex: number
  offsetWithinRow?: number
  visualPercent?: number
}

/**
 * Renders the virtualized library contents in grid or list mode.
 */
export default function BookGrid({
  books,
  total,
  libraryId,
  onRead,
  onOpenReader,
  onMore,
  ensureRange,
  header,
  viewMode = "grid",
  fileActionsEnabled = true,
  selectedFormatById = {},
  progressByBookId,
  activeBookId,
}: BookGridProps) {
  const scrollHostRef = useRef<HTMLDivElement>(null)
  const scrollRef = useRef<HTMLDivElement>(null)
  const scrollContentRef = useRef<HTMLDivElement>(null)
  const virtualListRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<number | null>(null)
  const restoreFrameRef = useRef<number | null>(null)
  const scrollAnchorRef = useRef<ScrollAnchor | null>(null)
  const layoutSignatureRef = useRef<string | null>(null)
  const layoutChangePendingRef = useRef(false)
  const [layout, setLayout] = useState(DEFAULT_GRID_LAYOUT)

  useOverlayScrollbar(scrollHostRef, scrollRef)

  const updateMeasuredLayout = useCallback(() => {
    const layoutEl = scrollContentRef.current
    if (!layoutEl) return

    frameRef.current = null
    const contentWidth = getContentBoxWidth(layoutEl)
    const nextLayout = getGridLayoutMetrics(contentWidth)
    setLayout((current) => {
      if (
        current.cols === nextLayout.cols &&
        current.gap === nextLayout.gap &&
        Math.abs(current.cardWidth - nextLayout.cardWidth) < 0.5 &&
        Math.abs(current.gridRowHeight - nextLayout.gridRowHeight) < 0.5
      ) {
        layoutChangePendingRef.current = false
        return current
      }
      return nextLayout
    })
  }, [])

  // Keep parent-driven pane width changes from painting with stale grid metrics.
  useLayoutEffect(() => {
    if (frameRef.current !== null) {
      window.cancelAnimationFrame(frameRef.current)
      frameRef.current = null
    }
    updateMeasuredLayout()
  }, [activeBookId, updateMeasuredLayout, viewMode])

  useLayoutEffect(() => {
    const layoutEl = scrollContentRef.current
    if (!layoutEl) return

    const scheduleLayoutUpdate = () => {
      layoutChangePendingRef.current = true
      if (frameRef.current !== null) return
      frameRef.current = window.requestAnimationFrame(updateMeasuredLayout)
    }

    updateMeasuredLayout()
    const ro = new ResizeObserver(scheduleLayoutUpdate)
    ro.observe(layoutEl)
    return () => {
      ro.disconnect()
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [updateMeasuredLayout])

  const isList = viewMode === "list"
  const { cols, gap, cardWidth, gridRowHeight } = layout
  const rowCount = isList ? total : Math.ceil(total / cols)
  const rowHeight = isList ? LIST_ROW_HEIGHT : gridRowHeight
  const layoutSignature = `${viewMode}:${cols}:${rowHeight}:${
    activeBookId == null ? "browse" : "detail"
  }`

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => rowHeight,
    overscan: 3,
  })

  function getVirtualListTop() {
    const listEl = virtualListRef.current
    const contentEl = scrollContentRef.current
    if (!listEl || !contentEl) return 0
    return Math.max(0, listEl.offsetTop - contentEl.offsetTop)
  }

  function readCurrentScrollAnchor(): ScrollAnchor | null {
    const el = scrollRef.current
    if (!el || total === 0 || rowCount === 0) return null

    const listScrollTop = Math.max(0, el.scrollTop - getVirtualListTop())
    const anchorThreshold = Math.min(ANCHOR_VISIBILITY_THRESHOLD, rowHeight / 3)
    const virtualItems = virtualizer.getVirtualItems()
    const fallbackRow = Math.min(
      rowCount - 1,
      Math.max(
        0,
        Math.floor((listScrollTop + anchorThreshold) / Math.max(rowHeight, 1)),
      ),
    )
    const firstVisibleRow =
      virtualItems.find((item) => item.end > listScrollTop + anchorThreshold) ??
      virtualItems.find((item) => item.index === fallbackRow)
    const rowIndex = Math.min(
      rowCount - 1,
      Math.max(0, firstVisibleRow?.index ?? fallbackRow),
    )
    const rowStart = firstVisibleRow?.start ?? rowIndex * rowHeight
    const bookIndex = isList ? rowIndex : rowIndex * cols

    return {
      bookIndex: Math.min(total - 1, Math.max(0, bookIndex)),
      offsetWithinRow: Math.max(0, listScrollTop - rowStart),
    }
  }

  function getBookIndex(bookId: string | number | null | undefined) {
    if (bookId == null) return null

    for (const [index, book] of books) {
      if (String(book.id) === String(bookId)) {
        return index
      }
    }

    return null
  }

  function readBookVisualAnchor(
    bookId: string | number | null | undefined,
  ): ScrollAnchor | null {
    const el = scrollRef.current
    const bookIndex = getBookIndex(bookId)
    if (!el || bookIndex == null || total === 0 || rowCount === 0) return null

    const rowIndex = Math.min(
      rowCount - 1,
      Math.max(0, isList ? bookIndex : Math.floor(bookIndex / cols)),
    )
    const listScrollTop = Math.max(0, el.scrollTop - getVirtualListTop())
    const rowCenter = rowIndex * rowHeight + rowHeight / 2
    const visualPercent =
      ((rowCenter - listScrollTop) / Math.max(el.clientHeight, 1)) * 100

    if (visualPercent < 0 || visualPercent > 100) return null

    return {
      bookIndex: Math.min(total - 1, Math.max(0, bookIndex)),
      visualPercent,
    }
  }

  function rememberScrollAnchor() {
    if (layoutChangePendingRef.current) return

    const anchor =
      readBookVisualAnchor(activeBookId) ?? readCurrentScrollAnchor()
    if (anchor) {
      scrollAnchorRef.current = anchor
    }
  }

  function restoreScrollAnchor(anchor: ScrollAnchor) {
    const el = scrollRef.current
    if (!el || rowCount === 0) return

    const rowIndex = Math.min(
      rowCount - 1,
      Math.max(
        0,
        isList ? anchor.bookIndex : Math.floor(anchor.bookIndex / cols),
      ),
    )
    const offsetWithinRow = Math.min(
      anchor.offsetWithinRow ?? 0,
      Math.max(rowHeight - 1, 0),
    )
    const rowOffset = rowIndex * rowHeight
    const listScrollTop =
      typeof anchor.visualPercent === "number"
        ? rowOffset +
          rowHeight / 2 -
          el.clientHeight * (anchor.visualPercent / 100)
        : rowOffset + offsetWithinRow
    const scrollTop = Math.max(0, getVirtualListTop() + listScrollTop)

    virtualizer.scrollToOffset(scrollTop, { align: "start" })
    el.scrollTop = scrollTop
    scrollAnchorRef.current = {
      bookIndex: anchor.bookIndex,
      offsetWithinRow,
      visualPercent: anchor.visualPercent,
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: Row height changes must remeasure virtualized rows.
  useLayoutEffect(() => {
    virtualizer.measure()
  }, [rowHeight, virtualizer])

  // biome-ignore lint/correctness/useExhaustiveDependencies: Column changes must restore the transient scroll anchor before paint.
  useLayoutEffect(() => {
    const previousSignature = layoutSignatureRef.current
    layoutSignatureRef.current = layoutSignature

    if (restoreFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFrameRef.current)
      restoreFrameRef.current = null
    }

    if (previousSignature === null) {
      layoutChangePendingRef.current = false
      rememberScrollAnchor()
      return
    }

    if (previousSignature === layoutSignature) {
      layoutChangePendingRef.current = false
      return
    }

    const anchor = scrollAnchorRef.current ?? readCurrentScrollAnchor()
    if (!anchor) {
      layoutChangePendingRef.current = false
      return
    }

    restoreScrollAnchor(anchor)
    restoreFrameRef.current = window.requestAnimationFrame(() => {
      restoreScrollAnchor(anchor)
      layoutChangePendingRef.current = false
      restoreFrameRef.current = null
    })
  }, [layoutSignature, rowCount, virtualizer])

  useEffect(() => {
    return () => {
      if (restoreFrameRef.current !== null) {
        window.cancelAnimationFrame(restoreFrameRef.current)
      }
    }
  }, [])

  function handleRead(book: CalibreBook) {
    const anchor = readBookVisualAnchor(book.id)
    if (anchor) {
      scrollAnchorRef.current = anchor
    }
    onRead?.(book)
  }

  const virtualItems = virtualizer.getVirtualItems()
  const rangeStart = virtualItems[0]?.index ?? 0
  const rangeEnd = virtualItems[virtualItems.length - 1]?.index ?? 0

  useEffect(() => {
    if (total === 0) return
    const firstBook = isList ? rangeStart : rangeStart * cols
    const lastBook = isList
      ? Math.min(rangeEnd, total - 1)
      : Math.min((rangeEnd + 1) * cols - 1, total - 1)
    ensureRange(firstBook, lastBook)
  }, [rangeStart, rangeEnd, cols, total, ensureRange, isList])

  return (
    <div
      ref={scrollHostRef}
      className="min-h-0 min-w-0 flex-1"
      data-overlayscrollbars-initialize
    >
      <div
        ref={scrollRef}
        data-testid="library-scroll"
        onScroll={rememberScrollAnchor}
        className="myreader-overlay-viewport h-full min-h-0 overflow-x-hidden overflow-y-auto"
      >
        <div ref={scrollContentRef} className="min-h-full px-6">
          {header}

          <div
            ref={virtualListRef}
            className="relative w-full"
            style={{ height: virtualizer.getTotalSize() }}
          >
            {virtualItems.map((vRow) => (
              <div
                key={`${vRow.key}-${cols}`}
                data-index={vRow.index}
                className="absolute top-0 start-0 w-full"
                style={{
                  height: isList ? LIST_ROW_HEIGHT : gridRowHeight,
                  transform: `translateY(${vRow.start}px)`,
                }}
              >
                {isList ? (
                  renderListRow(
                    vRow.index,
                    books,
                    libraryId,
                    fileActionsEnabled,
                    selectedFormatById,
                    progressByBookId,
                    activeBookId,
                    handleRead,
                    onOpenReader,
                    onMore,
                  )
                ) : (
                  <div
                    className="grid"
                    style={{
                      columnGap: gap,
                      gridTemplateColumns: `repeat(${cols}, ${cardWidth}px)`,
                      justifyContent: cols > 1 ? "center" : "start",
                    }}
                  >
                    {Array.from({ length: cols }, (_, c) => {
                      const idx = vRow.index * cols + c
                      if (idx >= total) return <div key={c} />
                      const book = books.get(idx)
                      if (!book) return <BookCardSkeleton key={`s-${idx}`} />
                      const selectedFormat = selectedFormatById[String(book.id)]
                      const progress = getBookProgressSnapshot(
                        progressByBookId,
                        book.id,
                        selectedFormat ?? book.preferredFormat,
                      )
                      return (
                        <BookCard
                          key={book.id}
                          book={book}
                          libraryId={libraryId}
                          onRead={handleRead}
                          onOpenReader={onOpenReader}
                          onMore={onMore}
                          fileActionsEnabled={fileActionsEnabled}
                          selectedFormat={selectedFormat}
                          progress={progress}
                          active={isActiveBook(book.id, activeBookId)}
                          fileStateSource="prefetched"
                        />
                      )
                    })}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}

export function getGridLayoutMetrics(contentWidth: number) {
  let cols = MIN_GRID_COLUMNS
  while (
    getAvailableCardWidth(contentWidth, cols + 1, GRID_GAP) >=
    NEXT_COLUMN_CARD_WIDTH
  ) {
    cols += 1
  }

  const minimumCardWidth = Math.min(
    MIN_GRID_CARD_WIDTH,
    getAvailableCardWidth(contentWidth, cols, MIN_GRID_GAP),
  )
  const cardWidth = snapLayoutValue(
    clamp(
      getAvailableCardWidth(contentWidth, cols, GRID_GAP),
      minimumCardWidth,
      MAX_GRID_CARD_WIDTH,
    ),
  )
  const gap = snapLayoutValue(
    cols > 1
      ? clamp(
          (contentWidth - cardWidth * cols) / (cols - 1),
          MIN_GRID_GAP,
          MAX_GRID_GAP,
        )
      : 0,
  )

  return {
    cols,
    gap,
    cardWidth,
    gridRowHeight: cardWidth * 1.5 + TEXT_BLOCK_HEIGHT + ROW_GAP,
  }
}

function getAvailableCardWidth(
  contentWidth: number,
  cols: number,
  gap: number,
) {
  return Math.max(0, (contentWidth - (cols - 1) * gap) / cols)
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value))
}

function snapLayoutValue(value: number) {
  return Math.round(value * 2) / 2
}

function getContentBoxWidth(element: HTMLElement) {
  const style = window.getComputedStyle(element)
  const paddingX =
    parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
  return Math.max(0, element.clientWidth - paddingX)
}

/**
 * Renders one virtualized list item or its placeholder.
 */
function renderListRow(
  index: number,
  books: Map<number, CalibreBook>,
  libraryId: string | null,
  fileActionsEnabled: boolean,
  selectedFormatById: Record<string, string>,
  progressByBookId: ReadingProgressByBook | undefined,
  activeBookId: string | null | undefined,
  onRead?: (book: CalibreBook) => void,
  onOpenReader?: (book: CalibreBook) => void,
  onMore?: (book: CalibreBook) => void,
) {
  const book = books.get(index)
  if (!book) return <BookRowSkeleton />
  const selectedFormat = selectedFormatById[String(book.id)]
  const progress = getBookProgressSnapshot(
    progressByBookId,
    book.id,
    selectedFormat ?? book.preferredFormat,
  )
  return (
    <BookRow
      key={book.id}
      book={book}
      libraryId={libraryId}
      onRead={onRead}
      onOpenReader={onOpenReader}
      onMore={onMore}
      fileActionsEnabled={fileActionsEnabled}
      selectedFormat={selectedFormat}
      progress={progress}
      active={isActiveBook(book.id, activeBookId)}
      fileStateSource="prefetched"
    />
  )
}

function isActiveBook(
  bookId: number,
  activeBookId: string | number | null | undefined,
) {
  return activeBookId != null && String(bookId) === String(activeBookId)
}

export function BookRowSkeleton() {
  return (
    <div className="flex min-h-14 items-center gap-3 rounded-md px-2.5 py-1.5">
      <Skeleton className="h-[42px] w-[30px] shrink-0 rounded-sm" />
      <div className="min-w-0 flex-1">
        <Skeleton className="h-3.5 w-1/2 rounded" />
        <Skeleton className="mt-0.5 h-3 w-1/3 rounded" />
        <Skeleton className="mt-0.5 h-3.5 w-8 rounded" />
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <Skeleton className="size-7 rounded" />
        <Skeleton className="size-7 rounded" />
      </div>
    </div>
  )
}

export function BookCardSkeleton() {
  return (
    <div className="min-w-0">
      <Skeleton className="aspect-[2/3] w-full rounded-lg" />
      <div className="mt-2 px-0.5">
        <Skeleton className="h-3.5 w-3/4 rounded" />
        <Skeleton className="mt-0.5 h-3 w-1/2 rounded" />
        <Skeleton className="mt-1 h-3.5 w-10 rounded" />
      </div>
    </div>
  )
}

export function LibrarySkeletonGrid({
  viewMode,
}: {
  viewMode: LibraryViewMode
}) {
  return (
    <div className="min-h-0 flex-1 overflow-y-auto px-6">
      <div className="mb-4 flex items-baseline gap-2.5 pt-5">
        <Skeleton className="h-5 w-14 rounded" />
        <Skeleton className="h-3.5 w-6 rounded" />
      </div>
      {viewMode === "list" ? (
        <div>
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <BookRowSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(136px,148px))] justify-between gap-5">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      )}
    </div>
  )
}
