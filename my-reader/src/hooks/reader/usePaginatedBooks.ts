import type { CalibreBook } from "@my-reader/tools/types/book"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { useCallback, useEffect, useRef, useState } from "react"
import type { ReadingProgressChangedEvent } from "@/hooks/queries/useReadingProgressQuery"
import { api } from "@/lib/tauri-api"

const PAGE_SIZE = 100

export function usePaginatedBooks(
  libraryId: string | null,
  sortBy: string,
  search: string,
) {
  const [books, setBooks] = useState<Map<number, CalibreBook>>(new Map())
  const [total, setTotal] = useState(0)
  const [initialLoading, setInitialLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [refreshKey, setRefreshKey] = useState(0)

  const loadedPagesRef = useRef(new Set<number>())
  const epochRef = useRef(0)
  const progressRefreshTimerRef = useRef<number | null>(null)

  const refresh = useCallback(() => {
    setRefreshKey((k) => k + 1)
  }, [])

  // biome-ignore lint/correctness/useExhaustiveDependencies: refreshKey is an intentional trigger state for manual refetch
  useEffect(() => {
    const epoch = ++epochRef.current
    loadedPagesRef.current = new Set([0])
    setBooks(new Map())
    setTotal(0)
    setError(null)
    setInitialLoading(true)

    if (!libraryId) {
      setInitialLoading(false)
      return
    }

    console.info(
      `Start to fetch books page (initial). library id: "${libraryId}", offset: 0, limit: ${PAGE_SIZE}, sort by: "${sortBy}", search: "${search}"`,
    )
    api
      .getBooksPage(libraryId, 0, PAGE_SIZE, sortBy, search || null)
      .then((result) => {
        if (epochRef.current !== epoch) return
        const m = new Map<number, CalibreBook>()
        for (let i = 0; i < result.items.length; i++) {
          m.set(i, result.items[i])
        }
        setBooks(m)
        setTotal(result.total)
        console.info(
          `Success to fetch books page (initial). total: ${result.total}, returned: ${result.items.length}`,
        )
      })
      .catch((e) => {
        if (epochRef.current !== epoch) return
        console.error(
          `Failed to fetch books page (initial). library id: "${libraryId}", error:`,
          e,
        )
        setError(String(e))
      })
      .finally(() => {
        if (epochRef.current === epoch) setInitialLoading(false)
      })
  }, [libraryId, sortBy, search, refreshKey])

  useEffect(() => {
    if (!libraryId || sortBy !== "lastRead") return

    let active = true
    let unlisten: UnlistenFn | undefined

    listen<ReadingProgressChangedEvent>("reading_progress", (event) => {
      if (event.payload.libraryId !== libraryId) return
      if (progressRefreshTimerRef.current !== null) return
      progressRefreshTimerRef.current = window.setTimeout(() => {
        progressRefreshTimerRef.current = null
        refresh()
      }, 1000)
    }).then((nextUnlisten) => {
      if (active) {
        unlisten = nextUnlisten
      } else {
        nextUnlisten()
      }
    })

    return () => {
      active = false
      unlisten?.()
      if (progressRefreshTimerRef.current !== null) {
        window.clearTimeout(progressRefreshTimerRef.current)
        progressRefreshTimerRef.current = null
      }
    }
  }, [libraryId, sortBy, refresh])

  const ensureRange = useCallback(
    (startIdx: number, endIdx: number) => {
      if (!libraryId || total === 0) return
      const epoch = epochRef.current
      const startPage = Math.floor(startIdx / PAGE_SIZE)
      const endPage = Math.floor(Math.min(endIdx, total - 1) / PAGE_SIZE)

      for (let p = startPage; p <= endPage; p++) {
        if (loadedPagesRef.current.has(p)) continue
        loadedPagesRef.current.add(p)

        console.info(
          `Start to fetch books page (range). library id: "${libraryId}", page index: ${p}, offset: ${p * PAGE_SIZE}`,
        )
        api
          .getBooksPage(
            libraryId,
            p * PAGE_SIZE,
            PAGE_SIZE,
            sortBy,
            search || null,
          )
          .then((result) => {
            if (epochRef.current !== epoch) return
            setBooks((prev) => {
              const next = new Map(prev)
              const base = p * PAGE_SIZE
              for (let i = 0; i < result.items.length; i++) {
                next.set(base + i, result.items[i])
              }
              return next
            })
            console.info(
              `Success to fetch books page (range). page index: ${p}, returned: ${result.items.length}`,
            )
          })
          .catch((e) => {
            if (epochRef.current !== epoch) return
            loadedPagesRef.current.delete(p)
            console.error(
              `Failed to fetch books page (range). library id: "${libraryId}", page index: ${p}, error:`,
              e,
            )
          })
      }
    },
    [libraryId, sortBy, search, total],
  )

  return { books, total, initialLoading, error, ensureRange, refresh }
}
