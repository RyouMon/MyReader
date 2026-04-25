import { useEffect, useRef, useState, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

import type { CalibreBook } from "my-reader-tools/types/book"
import BookCard from "./BookCard"
import BookRow from "./BookRow"

const MIN_COL_WIDTH = 152
const GAP = 24
/**
 * Fixed row height avoids dynamic `measureElement` calls which cause
 * layout thrashing. Cover 2:3 at ~170px ≈ 255px + info ~55px + gap.
 */
const ROW_HEIGHT = 330
const LIST_ROW_HEIGHT = 62

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

  useEffect(() => {
    const el = scrollRef.current
    if (!el) return

    const measure = () => {
      const available = el.clientWidth
      setCols(
        Math.max(1, Math.floor((available + GAP) / (MIN_COL_WIDTH + GAP))),
      )
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
    estimateSize: () => (isList ? LIST_ROW_HEIGHT : ROW_HEIGHT),
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
            key={vRow.key}
            style={{
              position: "absolute",
              top: vRow.start,
              left: 0,
              width: "100%",
              height: isList ? LIST_ROW_HEIGHT : ROW_HEIGHT,
            }}
          >
            {isList ? (
              renderListRow(vRow.index, books, libraryId, onRead, onMore)
            ) : (
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: `repeat(${cols}, 1fr)`,
                  gap: `${GAP}px`,
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

/**
 * Renders a placeholder for unloaded list rows.
 */
function BookRowSkeleton() {
  return (
    <div className="flex min-h-14 animate-pulse items-center gap-3 rounded-md px-2.5 py-1.5">
      <div className="h-[42px] w-[30px] shrink-0 rounded-[5px] bg-muted" />
      <div className="min-w-0 flex-1 space-y-1.5">
        <div className="h-3.5 w-1/2 rounded bg-muted" />
        <div className="h-3 w-1/3 rounded bg-muted" />
      </div>
    </div>
  )
}

/**
 * Renders a placeholder for unloaded cover cards.
 */
function BookCardSkeleton() {
  return (
    <div className="animate-pulse min-w-0">
      <div
        className="w-full rounded-lg bg-muted"
        style={{ aspectRatio: "2/3" }}
      />
      <div className="px-0.5 pt-2.5 space-y-1.5">
        <div className="h-4 bg-muted rounded w-3/4" />
        <div className="h-3 bg-muted rounded w-1/2" />
      </div>
    </div>
  )
}
