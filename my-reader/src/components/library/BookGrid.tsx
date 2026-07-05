import type { CalibreBook } from "@my-reader/tools/types/book"
import { useVirtualizer } from "@tanstack/react-virtual"
import {
  type ReactNode,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react"
import { useOverlayScrollbar } from "@/hooks/use-overlay-scrollbar"
import { pickReadableFormat } from "@/lib/readFormats"
import {
  getBookProgressSnapshot,
  type ReadingProgressByBook,
} from "@/lib/readingProgress"
import BookCard from "./BookCard"
import BookRow from "./BookRow"

const COMFORTABLE_MIN_COL_WIDTH = 152
const COMPACT_MIN_COL_WIDTH = 112
const COMFORTABLE_GRID_GAP = 24
const COMPACT_GRID_GAP = 12
const MIN_GRID_COLUMNS = 2
const SKELETON_COUNT = 20
const LIST_ROW_HEIGHT = 62
const TEXT_BLOCK_HEIGHT = 78 // mt-2 (8px) + h-[70px] text area
const ROW_GAP = 24
const ANCHOR_VISIBILITY_THRESHOLD = 48
const DEFAULT_GRID_ROW_HEIGHT =
  COMFORTABLE_MIN_COL_WIDTH * 1.5 + TEXT_BLOCK_HEIGHT + ROW_GAP

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
  offsetWithinRow: number
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
  const [layout, setLayout] = useState({
    cols: 4,
    gap: COMFORTABLE_GRID_GAP,
    gridRowHeight: DEFAULT_GRID_ROW_HEIGHT,
  })

  useOverlayScrollbar(scrollHostRef, scrollRef)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const updateLayout = () => {
      frameRef.current = null
      const layoutEl = scrollContentRef.current ?? el
      const style = window.getComputedStyle(layoutEl)
      const paddingX =
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      const contentWidth = Math.max(0, layoutEl.clientWidth - paddingX)
      const metrics = getGridLayoutMetrics(contentWidth)
      const { cols: newCols, gap } = metrics
      const colWidth = (contentWidth - (newCols - 1) * gap) / newCols
      const coverHeight = colWidth * 1.5
      const cardHeight = coverHeight + TEXT_BLOCK_HEIGHT
      const rowHeight = cardHeight + ROW_GAP
      setLayout((current) => {
        if (
          current.cols === newCols &&
          current.gap === gap &&
          Math.abs(current.gridRowHeight - rowHeight) < 0.5
        ) {
          return current
        }
        return { cols: newCols, gap, gridRowHeight: rowHeight }
      })
    }

    const scheduleLayoutUpdate = () => {
      if (frameRef.current !== null) return
      frameRef.current = window.requestAnimationFrame(updateLayout)
    }

    updateLayout()
    const ro = new ResizeObserver(scheduleLayoutUpdate)
    ro.observe(el)
    if (scrollContentRef.current) {
      ro.observe(scrollContentRef.current)
    }
    return () => {
      ro.disconnect()
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
      }
    }
  }, [])

  const isList = viewMode === "list"
  const { cols, gap, gridRowHeight } = layout
  const rowCount = isList ? total : Math.ceil(total / cols)
  const rowHeight = isList ? LIST_ROW_HEIGHT : gridRowHeight
  const layoutSignature = `${viewMode}:${cols}:${Math.round(rowHeight)}`

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
    const firstVisibleRow =
      virtualItems.find((item) => item.end > listScrollTop + anchorThreshold) ??
      virtualItems[0]
    const fallbackRow = Math.min(
      rowCount - 1,
      Math.max(
        0,
        Math.floor((listScrollTop + anchorThreshold) / Math.max(rowHeight, 1)),
      ),
    )
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

  function rememberScrollAnchor() {
    const anchor = readCurrentScrollAnchor()
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
      anchor.offsetWithinRow,
      Math.max(rowHeight - 1, 0),
    )
    const rowOffset = rowIndex * rowHeight
    const scrollTop = Math.max(
      0,
      getVirtualListTop() + rowOffset + offsetWithinRow,
    )

    virtualizer.scrollToOffset(scrollTop, { align: "start" })
    el.scrollTop = scrollTop
    scrollAnchorRef.current = {
      bookIndex: anchor.bookIndex,
      offsetWithinRow,
    }
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: Layout changes must restore the transient scroll anchor before paint.
  useLayoutEffect(() => {
    virtualizer.measure()

    const previousSignature = layoutSignatureRef.current
    layoutSignatureRef.current = layoutSignature

    if (restoreFrameRef.current !== null) {
      window.cancelAnimationFrame(restoreFrameRef.current)
      restoreFrameRef.current = null
    }

    if (previousSignature === null) {
      rememberScrollAnchor()
      return
    }

    if (previousSignature === layoutSignature) return

    const anchor = scrollAnchorRef.current ?? readCurrentScrollAnchor()
    if (!anchor) return

    restoreScrollAnchor(anchor)
    restoreFrameRef.current = window.requestAnimationFrame(() => {
      restoreScrollAnchor(anchor)
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
                      gridTemplateColumns: `repeat(${cols}, 1fr)`,
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
                        selectedFormat ?? pickReadableFormat(book.formats),
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

function getGridLayoutMetrics(contentWidth: number) {
  const compact = contentWidth < 480
  const gap = compact ? COMPACT_GRID_GAP : COMFORTABLE_GRID_GAP
  const minColWidth = compact
    ? COMPACT_MIN_COL_WIDTH
    : COMFORTABLE_MIN_COL_WIDTH
  const measuredCols = Math.max(
    1,
    Math.floor((contentWidth + gap) / (minColWidth + gap)),
  )
  const minCols = contentWidth > gap ? MIN_GRID_COLUMNS : 1

  return {
    cols: Math.max(minCols, measuredCols),
    gap,
  }
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
    selectedFormat ?? pickReadableFormat(book.formats),
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
    <div className="flex min-h-14 animate-pulse items-center gap-3 rounded-md px-2.5 py-1.5">
      <div className="h-[42px] w-[30px] shrink-0 rounded-sm bg-muted" />
      <div className="min-w-0 flex-1">
        <div className="h-3.5 w-1/2 rounded bg-muted" />
        <div className="mt-0.5 h-3 w-1/3 rounded bg-muted" />
        <div className="mt-0.5 h-3.5 w-8 rounded bg-muted" />
      </div>
      <div className="flex shrink-0 items-center gap-0.5">
        <div className="size-7 rounded bg-muted" />
        <div className="size-7 rounded bg-muted" />
      </div>
    </div>
  )
}

export function BookCardSkeleton() {
  return (
    <div className="animate-pulse min-w-0">
      <div className="aspect-[2/3] w-full overflow-hidden rounded-lg bg-muted" />
      <div className="mt-2 px-0.5">
        <div className="h-3.5 w-3/4 rounded bg-muted" />
        <div className="mt-0.5 h-3 w-1/2 rounded bg-muted" />
        <div className="mt-1 h-3.5 w-10 rounded bg-muted" />
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
        <div className="h-5 w-14 animate-pulse rounded bg-muted" />
        <div className="h-3.5 w-6 animate-pulse rounded bg-muted" />
      </div>
      {viewMode === "list" ? (
        <div>
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <BookRowSkeleton key={i} />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(152px,1fr))] gap-6">
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      )}
    </div>
  )
}
