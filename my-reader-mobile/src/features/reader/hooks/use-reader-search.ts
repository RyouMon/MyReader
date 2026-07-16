import { search as readiumSearch } from "@my-reader/readium"
import type {
  ReaderSearchCapabilities,
  ReaderSearchResultPage,
} from "@my-reader/tools/reader-search"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export type ReaderSearchStatus =
  | "idle"
  | "searching"
  | "results"
  | "empty"
  | "error"

type ReaderSearchState = {
  publicationContext: { publicationId: string | null }
  publicationId: string | null
  status: ReaderSearchStatus
  query: string
  locators: ReaderLocator[]
  resultCount?: number
  done: boolean
  loadingMore: boolean
  loadMoreError: boolean
  hasMore: boolean
}

function initialSearchState(publicationContext: {
  publicationId: string | null
}): ReaderSearchState {
  return {
    publicationContext,
    publicationId: publicationContext.publicationId,
    status: "idle",
    query: "",
    locators: [],
    done: true,
    loadingMore: false,
    loadMoreError: false,
    hasMore: false,
  }
}

function resultState(
  publicationContext: { publicationId: string | null },
  publicationId: string,
  query: string,
  page: ReaderSearchResultPage,
  fallbackResultCount?: number,
): ReaderSearchState {
  return {
    publicationContext,
    publicationId,
    status: page.locators.length === 0 && page.done ? "empty" : "results",
    query,
    locators: page.locators,
    resultCount: page.resultCount ?? fallbackResultCount,
    done: page.done,
    loadingMore: false,
    loadMoreError: false,
    hasMore: !page.done,
  }
}

export function useReaderSearch(publicationId: string | null) {
  const publicationContext = useMemo(() => ({ publicationId }), [publicationId])
  const [capabilityState, setCapabilityState] = useState<{
    publicationContext: { publicationId: string | null }
    capabilities: ReaderSearchCapabilities
  } | null>(null)
  const [state, setState] = useState<ReaderSearchState>(() =>
    initialSearchState(publicationContext),
  )
  const capabilityRequestRef = useRef(0)
  const searchRequestRef = useRef(0)
  const sessionIdRef = useRef<string | null>(null)
  const loadingMoreRef = useRef(false)

  const cancelSession = useCallback((sessionId: string | null) => {
    if (!sessionId) return
    void readiumSearch.cancel(sessionId).catch(() => undefined)
  }, [])

  const cancelActiveSession = useCallback(() => {
    const sessionId = sessionIdRef.current
    sessionIdRef.current = null
    loadingMoreRef.current = false
    cancelSession(sessionId)
  }, [cancelSession])

  const reset = useCallback(() => {
    searchRequestRef.current += 1
    cancelActiveSession()
    setState(initialSearchState(publicationContext))
  }, [cancelActiveSession, publicationContext])

  useEffect(() => {
    const requestId = capabilityRequestRef.current + 1
    capabilityRequestRef.current = requestId
    searchRequestRef.current += 1
    cancelActiveSession()

    if (!publicationId) return

    let active = true
    void readiumSearch
      .getCapabilities(publicationId)
      .then((nextCapabilities) => {
        if (active && capabilityRequestRef.current === requestId) {
          setCapabilityState({
            publicationContext,
            capabilities: nextCapabilities,
          })
        }
      })
      .catch(() => undefined)

    return () => {
      active = false
    }
  }, [cancelActiveSession, publicationContext, publicationId])

  useEffect(
    () => () => {
      searchRequestRef.current += 1
      cancelActiveSession()
    },
    [cancelActiveSession],
  )

  const capabilities =
    capabilityState?.publicationContext === publicationContext
      ? capabilityState.capabilities
      : null
  const activeState =
    state.publicationContext === publicationContext
      ? state
      : initialSearchState(publicationContext)

  const runSearch = useCallback(
    async (query: string) => {
      const normalizedQuery = query.trim()
      const requestId = searchRequestRef.current + 1
      searchRequestRef.current = requestId
      cancelActiveSession()
      loadingMoreRef.current = false

      if (!publicationId || !capabilities?.searchable || !normalizedQuery) {
        setState(initialSearchState(publicationContext))
        return
      }

      setState({
        publicationContext,
        publicationId,
        status: "searching",
        query: normalizedQuery,
        locators: [],
        done: false,
        loadingMore: false,
        loadMoreError: false,
        hasMore: false,
      })

      try {
        const session = await readiumSearch.search(
          publicationId,
          normalizedQuery,
        )
        if (searchRequestRef.current !== requestId) {
          cancelSession(session.id)
          return
        }

        sessionIdRef.current = session.id
        const page = await readiumSearch.next(session.id)
        if (searchRequestRef.current !== requestId) {
          cancelSession(session.id)
          return
        }

        if (page.done) {
          sessionIdRef.current = null
          cancelSession(session.id)
        }
        setState(
          resultState(
            publicationContext,
            publicationId,
            normalizedQuery,
            page,
            session.resultCount,
          ),
        )
      } catch {
        if (searchRequestRef.current !== requestId) return
        cancelActiveSession()
        setState({
          publicationContext,
          publicationId,
          status: "error",
          query: normalizedQuery,
          locators: [],
          done: true,
          loadingMore: false,
          loadMoreError: false,
          hasMore: false,
        })
      }
    },
    [
      capabilities?.searchable,
      cancelActiveSession,
      cancelSession,
      publicationContext,
      publicationId,
    ],
  )

  const loadMore = useCallback(async () => {
    const sessionId = sessionIdRef.current
    if (
      !sessionId ||
      activeState.done ||
      activeState.loadingMore ||
      loadingMoreRef.current
    ) {
      return
    }

    const requestId = searchRequestRef.current
    loadingMoreRef.current = true
    setState((current) => ({
      ...current,
      loadingMore: true,
      loadMoreError: false,
    }))

    try {
      const page = await readiumSearch.next(sessionId)
      if (
        searchRequestRef.current !== requestId ||
        sessionIdRef.current !== sessionId
      ) {
        return
      }

      if (page.done) {
        sessionIdRef.current = null
        cancelSession(sessionId)
      }
      setState((current) => ({
        ...current,
        status:
          current.locators.length + page.locators.length === 0 && page.done
            ? "empty"
            : "results",
        locators: [...current.locators, ...page.locators],
        resultCount: page.resultCount ?? current.resultCount,
        done: page.done,
        loadingMore: false,
        loadMoreError: false,
        hasMore: !page.done,
      }))
    } catch {
      if (
        searchRequestRef.current !== requestId ||
        sessionIdRef.current !== sessionId
      ) {
        return
      }
      setState((current) => ({
        ...current,
        loadingMore: false,
        loadMoreError: true,
      }))
    } finally {
      if (searchRequestRef.current === requestId) {
        loadingMoreRef.current = false
      }
    }
  }, [activeState.done, activeState.loadingMore, cancelSession])

  return {
    capabilities,
    publicationId: activeState.publicationId,
    status: activeState.status,
    query: activeState.query,
    locators: activeState.locators,
    resultCount: activeState.resultCount,
    done: activeState.done,
    loadingMore: activeState.loadingMore,
    loadMoreError: activeState.loadMoreError,
    hasMore: activeState.hasMore,
    runSearch,
    loadMore,
    reset,
  }
}
