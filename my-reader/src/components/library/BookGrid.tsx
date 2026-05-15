import { useEffect, useRef, useState, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

import type { CalibreBook } from "my-reader-tools/types/book"
import BookCard from "./BookCard"
import BookRow from "./BookRow"

const MIN_COL_WIDTH = 152
const GAP = 24
const SKELETON_COUNT = 20
const LIST_ROW_HEIGHT = 62
const TEXT_BLOCK_HEIGHT = 78 // mt-2 (8px) + h-[70px] text area
const ROW_GAP = 24
const DEFAULT_GRID_ROW_HEIGHT = MIN_COL_WIDTH * 1.5 + TEXT_BLOCK_HEIGHT + ROW_GAP

export type LibraryViewMode = "grid" | "list"

interface BookGridProps {
  books: Map<number, CalibreBook>
  total: number
  libraryId: string | null
  onRead?: (book: CalibreBook) => void
  onMore?: (book: CalibreBook) => void
  ensureRange: (start: number, end: number) => void
  header?: ReactNode
  viewMode?: LibraryViewMode
}

/**
 * Renders the virtualized library contents in grid or list mode.
 */
export default function BookGrid({
  books,
  total,
  libraryId,
  onRead,
  onMore,
  ensureRange,
  header,
  viewMode = "grid",
}: BookGridProps) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const [cols, setCols] = useState(4)
  const [gridRowHeight, setGridRowHeight] = useState(DEFAULT_GRID_ROW_HEIGHT)

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const measure = () => {
      const style = window.getComputedStyle(el)
      const paddingX =
        parseFloat(style.paddingLeft) + parseFloat(style.paddingRight)
      const contentWidth = el.clientWidth - paddingX
      const newCols = Math.max(
        1,
        Math.floor((contentWidth + GAP) / (MIN_COL_WIDTH + GAP)),
      )
      const colWidth = (contentWidth - (newCols - 1) * GAP) / newCols
      const coverHeight = colWidth * 1.5
      const cardHeight = coverHeight + TEXT_BLOCK_HEIGHT
      const rowHeight = cardHeight + ROW_GAP
      setCols(newCols)
      setGridRowHeight(rowHeight)
    }

    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const isList = viewMode === "list"
  const rowCount = isList ? total : Math.ceil(total / cols)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => (isList ? LIST_ROW_HEIGHT : gridRowHeight),
    overscan: 3,
  })

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
    <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto px-6">
      {header}

      <div
        style={{
          height: virtualizer.getTotalSize(),
          position: "relative",
          width: "100%",
        }}
      >
        {virtualItems.map((vRow) => (
          <div
            key={`${vRow.key}-${cols}`}
            data-index={vRow.index}
            ref={virtualizer.measureElement}
            style={{
              position: "absolute",
              top: vRow.start,
              insetInlineStart: 0,
              width: "100%",
              height: isList ? LIST_ROW_HEIGHT : gridRowHeight,
            }}
          >
            {isList ? (
              renderListRow(vRow.index, books, libraryId, onRead, onMore)
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, 1fr)`,
                  columnGap: `${GAP}px`,
                }}
              >
                {Array.from({ length: cols }, (_, c) => {
                  const idx = vRow.index * cols + c
                  if (idx >= total) return <div key={c} />
                  const book = books.get(idx)
                  if (!book) return <BookCardSkeleton key={`s-${idx}`} />
                  return (
                    <BookCard
                      key={book.id}
                      book={book}
                      libraryId={libraryId}
                      onRead={onRead}
                      onMore={onMore}
                    />
                  )
                })}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/**
 * Renders one virtualized list item or its placeholder.
 */
function renderListRow(
  index: number,
  books: Map<number, CalibreBook>,
  libraryId: string | null,
  onRead?: (book: CalibreBook) => void,
  onMore?: (book: CalibreBook) => void,
) {
  const book = books.get(index)
  if (!book) return <BookRowSkeleton />
  return (
    <BookRow
      key={book.id}
      book={book}
      libraryId={libraryId}
      onRead={onRead}
      onMore={onMore}
    />
  )
}

export function BookRowSkeleton() {
  return (
    <div className="flex min-h-14 animate-pulse items-center gap-3 rounded-md px-2.5 py-1.5">
      <div className="h-[42px] w-[30px] shrink-0 rounded-[5px] bg-muted" />
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
      <div
        className="w-full overflow-hidden rounded-lg bg-muted"
        style={{ aspectRatio: "2/3" }}
      />
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
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(152px, 1fr))",
            gap: "24px",
          }}
        >
          {Array.from({ length: SKELETON_COUNT }, (_, i) => (
            <BookCardSkeleton key={i} />
          ))}
        </div>
      )}
    </div>
  )
}
