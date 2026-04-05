import { useCallback, useEffect, useRef, useState } from "react"
import { invoke } from "@tauri-apps/api/core"

import type { CalibreBook, PaginatedBooks } from "@/types/book"

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

  const loadedPagesRef = useRef(new Set<number>())
  const epochRef = useRef(0)

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

    invoke<PaginatedBooks>("get_books_page", {
      libraryId,
      offset: 0,
      limit: PAGE_SIZE,
      sortBy,
      search: search || null,
    })
      .then((result) => {
        if (epochRef.current !== epoch) return
        const m = new Map<number, CalibreBook>()
        for (let i = 0; i < result.items.length; i++) {
          m.set(i, result.items[i])
        }
        setBooks(m)
        setTotal(result.total)
      })
      .catch((e) => {
        if (epochRef.current !== epoch) return
        setError(String(e))
      })
      .finally(() => {
        if (epochRef.current === epoch) setInitialLoading(false)
      })
  }, [libraryId, sortBy, search])

  const ensureRange = useCallback(
    (startIdx: number, endIdx: number) => {
      if (!libraryId || total === 0) return
      const epoch = epochRef.current
      const startPage = Math.floor(startIdx / PAGE_SIZE)
      const endPage = Math.floor(Math.min(endIdx, total - 1) / PAGE_SIZE)

      for (let p = startPage; p <= endPage; p++) {
        if (loadedPagesRef.current.has(p)) continue
        loadedPagesRef.current.add(p)

        invoke<PaginatedBooks>("get_books_page", {
          libraryId,
          offset: p * PAGE_SIZE,
          limit: PAGE_SIZE,
          sortBy,
          search: search || null,
        })
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
          })
          .catch((e) => {
            if (epochRef.current !== epoch) return
            loadedPagesRef.current.delete(p)
            console.error(`Failed to load page ${p}:`, e)
          })
      }
    },
    [libraryId, sortBy, search, total],
  )

  return { books, total, initialLoading, error, ensureRange }
}
