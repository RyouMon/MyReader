import { useEffect, useRef, useState, type ReactNode } from "react"
import { useVirtualizer } from "@tanstack/react-virtual"

import type { CalibreBook } from "my-reader-tools/types/book"
import BookCard from "./BookCard"

const MIN_COL_WIDTH = 152
const GAP = 24
/**
 * Fixed row height avoids dynamic `measureElement` calls which cause
 * layout thrashing. Cover 2:3 at ~170px ≈ 255px + info ~55px + gap.
 */
const ROW_HEIGHT = 330

interface BookGridProps {
  books: Map<number, CalibreBook>
  total: number
  libraryId: string | null
  onRead?: (book: CalibreBook) => void
  ensureRange: (start: number, end: number) => void
  header?: ReactNode
}

export default function BookGrid({
  books,
  total,
  libraryId,
  onRead,
  ensureRange,
  header,
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

  const rowCount = Math.ceil(total / cols)

  const virtualizer = useVirtualizer({
    count: rowCount,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => ROW_HEIGHT,
    overscan: 3,
  })

  const virtualItems = virtualizer.getVirtualItems()
  const rangeStart = virtualItems[0]?.index ?? 0
  const rangeEnd = virtualItems[virtualItems.length - 1]?.index ?? 0

  useEffect(() => {
    if (total === 0) return
    const firstBook = rangeStart * cols
    const lastBook = Math.min((rangeEnd + 1) * cols - 1, total - 1)
    ensureRange(firstBook, lastBook)
  }, [rangeStart, rangeEnd, cols, total, ensureRange])

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
              height: ROW_HEIGHT,
            }}
          >
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
                  />
                )
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

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
