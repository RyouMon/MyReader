import type {
  ReaderSearchCapabilities,
  ReaderSearchOptions,
  ReaderSearchResultPage,
  ReaderSearchSession,
} from "@my-reader/tools/reader-search"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { useCallback, useEffect, useMemo, useRef, useState } from "react"

export type ReaderSearchService = {
  getCapabilities: () => ReaderSearchCapabilities
  start: (
    query: string,
    options?: ReaderSearchOptions,
  ) => Promise<ReaderSearchSession>
  next: (sessionId: string) => Promise<ReaderSearchResultPage>
  close: (sessionId: string) => Promise<void>
}

export type ReaderSearchStatus =
  | "idle"
  | "searching"
  | "results"
  | "empty"
  | "error"

export function useReaderSearch(service: ReaderSearchService | null) {
  const [query, setQuery] = useState("")
  const [locators, setLocators] = useState<ReaderLocator[]>([])
  const [resultCount, setResultCount] = useState<number | undefined>()
  const [done, setDone] = useState(true)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [status, setStatus] = useState<ReaderSearchStatus>("idle")
  const [activeLocator, setActiveLocator] = useState<ReaderLocator | null>(null)
  const sessionIdRef = useRef<string | null>(null)
  const requestRef = useRef(0)
  const loadingRef = useRef(false)

  const capabilities = useMemo(
    () => service?.getCapabilities() ?? { searchable: false, options: {} },
    [service],
  )

  const closeSession = useCallback(async () => {
    const sessionId = sessionIdRef.current
    sessionIdRef.current = null
    if (sessionId) await service?.close(sessionId)
  }, [service])

  const commitPage = useCallback((page: ReaderSearchResultPage) => {
    setLocators((current) => [...current, ...page.locators])
    setResultCount(page.resultCount)
    setDone(page.done)
    setStatus((current) => {
      if (current === "results" || page.locators.length > 0) return "results"
      return page.done ? "empty" : "searching"
    })
  }, [])

  const search = useCallback(async () => {
    if (!service || !capabilities.searchable) return
    const normalizedQuery = query.trim()
    const request = requestRef.current + 1
    requestRef.current = request
    await closeSession()

    setLocators([])
    setResultCount(undefined)
    setActiveLocator(null)
    setError(null)
    if (!normalizedQuery) {
      setStatus("idle")
      setDone(true)
      return
    }

    setStatus("searching")
    loadingRef.current = true
    setLoading(true)
    setDone(false)
    try {
      const session = await service.start(normalizedQuery)
      if (request !== requestRef.current) {
        await service.close(session.id)
        return
      }
      sessionIdRef.current = session.id
      setResultCount(session.resultCount)
      const page = await service.next(session.id)
      if (request !== requestRef.current) return
      commitPage(page)
      if (page.done) await closeSession()
    } catch (searchError: unknown) {
      if (request === requestRef.current) {
        setError(searchError)
        setStatus("error")
        setDone(true)
      }
    } finally {
      if (request === requestRef.current) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [capabilities.searchable, closeSession, commitPage, query, service])

  const loadMore = useCallback(async () => {
    const sessionId = sessionIdRef.current
    if (!service || !sessionId || done || loadingRef.current) return
    const request = requestRef.current
    loadingRef.current = true
    setLoading(true)
    setError(null)
    try {
      const page = await service.next(sessionId)
      if (request !== requestRef.current) return
      commitPage(page)
      if (page.done) await closeSession()
    } catch (searchError: unknown) {
      if (request === requestRef.current) setError(searchError)
    } finally {
      if (request === requestRef.current) {
        loadingRef.current = false
        setLoading(false)
      }
    }
  }, [closeSession, commitPage, done, service])

  const clear = useCallback(() => {
    requestRef.current += 1
    loadingRef.current = false
    void closeSession()
    setQuery("")
    setLocators([])
    setResultCount(undefined)
    setDone(true)
    setLoading(false)
    setError(null)
    setStatus("idle")
    setActiveLocator(null)
  }, [closeSession])

  const selectLocator = useCallback((locator: ReaderLocator) => {
    setActiveLocator(locator)
  }, [])

  useEffect(() => {
    requestRef.current += 1
    loadingRef.current = false
    sessionIdRef.current = null
    setLocators([])
    setResultCount(undefined)
    setDone(true)
    setLoading(false)
    setError(null)
    setStatus("idle")
    setActiveLocator(null)
    return () => {
      requestRef.current += 1
      const sessionId = sessionIdRef.current
      sessionIdRef.current = null
      if (sessionId) void service?.close(sessionId)
    }
  }, [service])

  return {
    capabilities,
    query,
    setQuery,
    locators,
    resultCount,
    done,
    loading,
    error,
    status,
    activeLocator,
    selectLocator,
    search,
    loadMore,
    clear,
  }
}
