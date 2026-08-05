import type { CalibreBook, PaginatedBooks } from "@my-reader/tools/types/book"
import { useQuery, useQueryClient } from "@tanstack/react-query"
import { listen, type UnlistenFn } from "@tauri-apps/api/event"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import type { ReadingProgressChangedEvent } from "@/hooks/queries/useReadingProgressQuery"
import {
  SIDECAR_SYNC_COMPLETED_EVENT,
  type SidecarSyncCompletedEvent,
} from "@/hooks/useSidecarSync"
import { api } from "@/lib/tauri-api"

const PAGE_SIZE = 100
const BOOK_PAGE_STALE_TIME = 5 * 60 * 1000
const BOOK_PAGE_GC_TIME = 30 * 60 * 1000

const bookPageKeys = {
  all: ["booksPage"] as const,
  scope: (libraryId: string, sortBy: string, search: string) =>
    [...bookPageKeys.all, libraryId, sortBy, search] as const,
  page: (
    libraryId: string,
    sortBy: string,
    search: string,
    refreshEpoch: number,
    page: number,
  ) =>
    [
      ...bookPageKeys.scope(libraryId, sortBy, search),
      refreshEpoch,
      page,
    ] as const,
  disabled: () => [...bookPageKeys.all, "disabled"] as const,
}

function normalizeSearch(search: string) {
  return search.trim()
}

function getBooksPageQueryOptions(
  libraryId: string,
  sortBy: string,
  search: string,
  refreshEpoch: number,
  page: number,
) {
  const offset = page * PAGE_SIZE
  return {
    queryKey: bookPageKeys.page(libraryId, sortBy, search, refreshEpoch, page),
    queryFn: async () => {
      console.info(
        `Start to fetch books page. library id: "${libraryId}", page index: ${page}, offset: ${offset}, limit: ${PAGE_SIZE}, sort by: "${sortBy}", search: "${search}"`,
      )
      const result = await api.getBooksPage(
        libraryId,
        offset,
        PAGE_SIZE,
        sortBy,
        search || null,
      )
      console.info(
        `Success to fetch books page. page index: ${page}, total: ${result.total}, returned: ${result.items.length}`,
      )
      return result
    },
    staleTime: BOOK_PAGE_STALE_TIME,
    gcTime: BOOK_PAGE_GC_TIME,
  }
}

export function usePaginatedBooks(
  libraryId: string | null,
  sortBy: string,
  search: string,
  refreshOnSidecarSync = false,
) {
  const queryClient = useQueryClient()
  const normalizedSearch = useMemo(() => normalizeSearch(search), [search])
  const [refreshEpoch, setRefreshEpoch] = useState(0)
  const [books, setBooks] = useState<Map<number, CalibreBook>>(new Map())
  const [total, setTotal] = useState(0)
  const scopeSignature = `${libraryId ?? ""}\u0000${sortBy}\u0000${normalizedSearch}\u0000${refreshEpoch}`

  const appliedPagesRef = useRef(new Set<number>())
  const pendingPagesRef = useRef<Set<number>>(
    libraryId ? new Set([0]) : new Set(),
  )
  const scopeRef = useRef(scopeSignature)
  const progressRefreshTimerRef = useRef<number | null>(null)

  if (scopeRef.current !== scopeSignature) {
    scopeRef.current = scopeSignature
    appliedPagesRef.current = new Set()
    pendingPagesRef.current = libraryId ? new Set([0]) : new Set()
  }

  // biome-ignore lint/correctness/useExhaustiveDependencies: scopeSignature intentionally resets the local page projection when the query scope changes.
  useEffect(() => {
    setBooks(new Map())
    setTotal(0)
  }, [scopeSignature])

  const initialPageQuery = useQuery<PaginatedBooks, Error>({
    ...(libraryId
      ? getBooksPageQueryOptions(
          libraryId,
          sortBy,
          normalizedSearch,
          refreshEpoch,
          0,
        )
      : {
          queryKey: bookPageKeys.disabled(),
          queryFn: async () => ({ items: [], total: 0 }),
          staleTime: BOOK_PAGE_STALE_TIME,
          gcTime: BOOK_PAGE_GC_TIME,
        }),
    enabled: Boolean(libraryId),
  })

  const applyPage = useCallback((page: number, result: PaginatedBooks) => {
    pendingPagesRef.current.delete(page)
    setTotal(result.total)
    if (appliedPagesRef.current.has(page)) return

    appliedPagesRef.current.add(page)
    setBooks((prev) => {
      const next = new Map(prev)
      const base = page * PAGE_SIZE
      for (let i = 0; i < result.items.length; i++) {
        next.set(base + i, result.items[i])
      }
      return next
    })
  }, [])

  useEffect(() => {
    if (!initialPageQuery.data) return
    applyPage(0, initialPageQuery.data)
  }, [applyPage, initialPageQuery.data])

  const refresh = useCallback(() => {
    if (!libraryId) return
    queryClient.removeQueries({
      queryKey: bookPageKeys.scope(libraryId, sortBy, normalizedSearch),
    })
    setRefreshEpoch((k) => k + 1)
  }, [libraryId, normalizedSearch, queryClient, sortBy])

  useEffect(() => {
    if (!libraryId || !refreshOnSidecarSync) return

    const handleSidecarSync = (event: Event) => {
      const detail = (event as CustomEvent<SidecarSyncCompletedEvent>).detail
      if (detail.libraryId === libraryId) refresh()
    }

    window.addEventListener(SIDECAR_SYNC_COMPLETED_EVENT, handleSidecarSync)
    return () => {
      window.removeEventListener(
        SIDECAR_SYNC_COMPLETED_EVENT,
        handleSidecarSync,
      )
    }
  }, [libraryId, refresh, refreshOnSidecarSync])

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

  const knownTotal = initialPageQuery.data?.total ?? total
  const error = initialPageQuery.error ? String(initialPageQuery.error) : null
  const initialLoading = Boolean(libraryId) && initialPageQuery.isLoading

  const ensureRange = useCallback(
    (startIdx: number, endIdx: number) => {
      if (!libraryId || knownTotal === 0) return

      const requestScope = scopeRef.current
      const startPage = Math.floor(startIdx / PAGE_SIZE)
      const endPage = Math.floor(Math.min(endIdx, knownTotal - 1) / PAGE_SIZE)

      for (let p = startPage; p <= endPage; p++) {
        if (appliedPagesRef.current.has(p) || pendingPagesRef.current.has(p)) {
          continue
        }

        pendingPagesRef.current.add(p)
        queryClient
          .ensureQueryData(
            getBooksPageQueryOptions(
              libraryId,
              sortBy,
              normalizedSearch,
              refreshEpoch,
              p,
            ),
          )
          .then((result) => {
            if (scopeRef.current !== requestScope) return
            applyPage(p, result)
          })
          .catch((e) => {
            if (scopeRef.current !== requestScope) return
            pendingPagesRef.current.delete(p)
            console.error(
              `Failed to fetch books page. library id: "${libraryId}", page index: ${p}, error:`,
              e,
            )
          })
      }
    },
    [
      applyPage,
      knownTotal,
      libraryId,
      normalizedSearch,
      queryClient,
      refreshEpoch,
      sortBy,
    ],
  )

  return {
    books,
    total: knownTotal,
    initialLoading,
    error,
    ensureRange,
    refresh,
  }
}
