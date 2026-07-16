import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { act, renderHook, waitFor } from "@testing-library/react"
import { describe, expect, it, vi } from "vitest"
import { type ReaderSearchService, useReaderSearch } from "../useReaderSearch"

describe("useReaderSearch", () => {
  it("should preserve the search session when a result is selected", async () => {
    const firstLocator: ReaderLocator = {
      href: "chapter-1.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0 },
      text: { highlight: "first" },
    }
    const secondLocator: ReaderLocator = {
      href: "chapter-2.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0 },
      text: { highlight: "second" },
    }
    const service: ReaderSearchService = {
      getCapabilities: () => ({ searchable: true, options: {} }),
      start: vi.fn(async () => ({ id: "session-1", resultCount: 0 })),
      next: vi
        .fn()
        .mockResolvedValueOnce({
          locators: [firstLocator],
          resultCount: 1,
          done: false,
        })
        .mockResolvedValueOnce({
          locators: [secondLocator],
          resultCount: 2,
          done: false,
        }),
      close: vi.fn(async () => {}),
    }
    const { result } = renderHook(() => useReaderSearch(service))

    act(() => {
      result.current.setQuery("reader")
    })
    await act(async () => result.current.search())
    expect(result.current.status).toBe("results")
    act(() => {
      result.current.selectLocator(firstLocator)
    })

    expect(result.current.query).toBe("reader")
    expect(result.current.locators).toEqual([firstLocator])
    expect(result.current.resultCount).toBe(1)
    expect(result.current.activeLocator).toBe(firstLocator)
    expect(service.close).not.toHaveBeenCalled()

    await act(async () => result.current.loadMore())
    expect(service.next).toHaveBeenLastCalledWith("session-1")
    expect(result.current.locators).toEqual([firstLocator, secondLocator])
    expect(result.current.activeLocator).toBe(firstLocator)
    expect(service.close).not.toHaveBeenCalled()

    act(() => result.current.clear())
    await waitFor(() => expect(service.close).toHaveBeenCalledWith("session-1"))
    expect(result.current.query).toBe("")
    expect(result.current.locators).toEqual([])
    expect(result.current.status).toBe("idle")
    expect(result.current.activeLocator).toBeNull()
  })

  it("should close the previous session when a new search starts", async () => {
    let sessionNumber = 0
    const service: ReaderSearchService = {
      getCapabilities: () => ({ searchable: true, options: {} }),
      start: vi.fn(async () => ({ id: `session-${++sessionNumber}` })),
      next: vi.fn(async () => ({
        locators: [],
        resultCount: 0,
        done: false,
      })),
      close: vi.fn(async () => {}),
    }
    const { result, unmount } = renderHook(() => useReaderSearch(service))

    act(() => result.current.setQuery("first"))
    await act(async () => result.current.search())
    expect(service.close).not.toHaveBeenCalled()

    act(() => result.current.setQuery("second"))
    await act(async () => result.current.search())
    expect(service.close).toHaveBeenCalledWith("session-1")

    unmount()
    await waitFor(() => expect(service.close).toHaveBeenCalledWith("session-2"))
  })

  it("should keep existing results unsubmitted when the query changes", async () => {
    const firstLocator: ReaderLocator = {
      href: "chapter-1.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0 },
      text: { highlight: "first" },
    }
    const service: ReaderSearchService = {
      getCapabilities: () => ({ searchable: true, options: {} }),
      start: vi.fn(async () => ({ id: "session-1" })),
      next: vi.fn(async () => ({
        locators: [firstLocator],
        resultCount: 1,
        done: false,
      })),
      close: vi.fn(async () => {}),
    }
    const { result } = renderHook(() => useReaderSearch(service))

    act(() => result.current.setQuery("submitted query"))
    await act(async () => result.current.search())
    act(() => result.current.setQuery("draft query"))

    expect(result.current.query).toBe("draft query")
    expect(result.current.status).toBe("results")
    expect(result.current.locators).toEqual([firstLocator])
    expect(service.start).toHaveBeenCalledTimes(1)
  })

  it("should expose empty status when a completed search has no results", async () => {
    const service: ReaderSearchService = {
      getCapabilities: () => ({ searchable: true, options: {} }),
      start: vi.fn(async () => ({ id: "session-empty", resultCount: 0 })),
      next: vi.fn(async () => ({
        locators: [],
        resultCount: 0,
        done: true,
      })),
      close: vi.fn(async () => {}),
    }
    const { result } = renderHook(() => useReaderSearch(service))

    act(() => result.current.setQuery("missing"))
    await act(async () => result.current.search())

    expect(result.current.status).toBe("empty")
  })

  it("should expose error status when the initial search fails", async () => {
    const service: ReaderSearchService = {
      getCapabilities: () => ({ searchable: true, options: {} }),
      start: vi.fn(async () => {
        throw new Error("search failed")
      }),
      next: vi.fn(),
      close: vi.fn(async () => {}),
    }
    const { result } = renderHook(() => useReaderSearch(service))

    act(() => result.current.setQuery("broken"))
    await act(async () => result.current.search())

    expect(result.current.status).toBe("error")
  })
})
