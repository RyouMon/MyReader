import { search as readiumSearch } from "@my-reader/readium"
import type { ReaderSearchResultPage } from "@my-reader/tools/reader-search"
import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import { act, renderHook, waitFor } from "@testing-library/react-native"

import { useReaderSearch } from "./use-reader-search"

jest.mock("@my-reader/readium", () => ({
  search: {
    getCapabilities: jest.fn(),
    search: jest.fn(),
    next: jest.fn(),
    cancel: jest.fn(() => Promise.resolve()),
  },
}))

const mockSearch = readiumSearch.search as jest.MockedFunction<
  typeof readiumSearch.search
>
const mockNext = readiumSearch.next as jest.MockedFunction<
  typeof readiumSearch.next
>
const mockCancel = readiumSearch.cancel as jest.MockedFunction<
  typeof readiumSearch.cancel
>
const mockGetCapabilities =
  readiumSearch.getCapabilities as jest.MockedFunction<
    typeof readiumSearch.getCapabilities
  >

function locator(position: number): ReaderLocator {
  return {
    href: `chapter-${position}.xhtml`,
    type: "application/xhtml+xml",
    locations: { progression: 0, position },
    text: { highlight: `result ${position}` },
  }
}

describe("useReaderSearch", () => {
  beforeEach(() => {
    jest.clearAllMocks()
    mockGetCapabilities.mockResolvedValue({
      searchable: true,
      options: {},
    })
  })

  it("should expose search only when the publication reports it as searchable", async () => {
    const { result, rerender } = renderHook(
      ({ publicationId }: { publicationId: string | null }) =>
        useReaderSearch(publicationId),
      { initialProps: { publicationId: "publication" } },
    )

    await waitFor(() =>
      expect(result.current.capabilities?.searchable).toBe(true),
    )

    mockGetCapabilities.mockResolvedValueOnce({
      searchable: false,
      options: {},
    })
    rerender({ publicationId: "other-publication" })

    await waitFor(() =>
      expect(result.current.capabilities?.searchable).toBe(false),
    )
  })

  it("should accumulate pages and close the iterator when search finishes", async () => {
    mockSearch.mockResolvedValue({ id: "session", resultCount: 1 })
    mockNext
      .mockResolvedValueOnce({
        locators: [locator(1)],
        resultCount: 1,
        done: false,
      })
      .mockResolvedValueOnce({
        locators: [locator(2)],
        resultCount: 2,
        done: true,
      })
    const { result } = renderHook(() => useReaderSearch("publication"))
    await waitFor(() => expect(result.current.capabilities).not.toBeNull())

    await act(async () => {
      await result.current.runSearch("needle")
    })
    expect(result.current.locators).toEqual([locator(1)])
    expect(result.current.hasMore).toBe(true)

    await act(async () => {
      await result.current.loadMore()
    })

    expect(result.current.locators).toEqual([locator(1), locator(2)])
    expect(result.current.resultCount).toBe(2)
    expect(result.current.done).toBe(true)
    expect(mockCancel).toHaveBeenCalledWith("session")
  })

  it("should issue only one next-page request when end events overlap", async () => {
    let resolveNextPage: ((page: ReaderSearchResultPage) => void) | undefined
    mockSearch.mockResolvedValue({ id: "session" })
    mockNext
      .mockResolvedValueOnce({ locators: [locator(1)], done: false })
      .mockImplementationOnce(
        () =>
          new Promise<ReaderSearchResultPage>((resolve) => {
            resolveNextPage = resolve
          }),
      )
    const { result } = renderHook(() => useReaderSearch("publication"))
    await waitFor(() => expect(result.current.capabilities).not.toBeNull())
    await act(async () => {
      await result.current.runSearch("needle")
    })

    let firstRequest: Promise<void> | undefined
    await act(async () => {
      firstRequest = result.current.loadMore()
      void result.current.loadMore()
      await Promise.resolve()
    })

    expect(mockNext).toHaveBeenCalledTimes(2)

    await act(async () => {
      resolveNextPage?.({ locators: [locator(2)], done: true })
      await firstRequest
    })
    expect(result.current.locators).toEqual([locator(1), locator(2)])
  })

  it("should cancel the previous iterator when a new query starts", async () => {
    let resolveFirstPage: ((page: ReaderSearchResultPage) => void) | undefined
    mockSearch
      .mockResolvedValueOnce({ id: "first-session" })
      .mockResolvedValueOnce({ id: "second-session" })
    mockNext
      .mockImplementationOnce(
        () =>
          new Promise<ReaderSearchResultPage>((resolve) => {
            resolveFirstPage = resolve
          }),
      )
      .mockResolvedValueOnce({
        locators: [locator(2)],
        done: true,
      })
    const { result } = renderHook(() => useReaderSearch("publication"))
    await waitFor(() => expect(result.current.capabilities).not.toBeNull())

    act(() => {
      void result.current.runSearch("first")
    })
    await waitFor(() => expect(mockNext).toHaveBeenCalledWith("first-session"))

    await act(async () => {
      await result.current.runSearch("second")
    })

    expect(mockCancel).toHaveBeenCalledWith("first-session")
    expect(result.current.query).toBe("second")
    expect(result.current.locators).toEqual([locator(2)])

    await act(async () => {
      resolveFirstPage?.({ locators: [locator(1)], done: true })
      await Promise.resolve()
    })
    expect(result.current.query).toBe("second")
    expect(result.current.locators).toEqual([locator(2)])
  })

  it("should cancel the active iterator when search is reset", async () => {
    mockSearch.mockResolvedValue({ id: "session" })
    mockNext.mockResolvedValue({ locators: [locator(1)], done: false })
    const { result } = renderHook(() => useReaderSearch("publication"))
    await waitFor(() => expect(result.current.capabilities).not.toBeNull())
    await act(async () => {
      await result.current.runSearch("needle")
    })

    act(() => result.current.reset())

    expect(mockCancel).toHaveBeenCalledWith("session")
    expect(result.current.status).toBe("idle")
    expect(result.current.locators).toEqual([])
  })

  it("should not restore stale results when returning to a publication", async () => {
    mockSearch.mockResolvedValue({ id: "session" })
    mockNext.mockResolvedValue({ locators: [locator(1)], done: false })
    const { result, rerender } = renderHook(
      ({ publicationId }: { publicationId: string }) =>
        useReaderSearch(publicationId),
      { initialProps: { publicationId: "publication-a" } },
    )
    await waitFor(() => expect(result.current.capabilities).not.toBeNull())
    await act(async () => {
      await result.current.runSearch("needle")
    })

    rerender({ publicationId: "publication-b" })
    await waitFor(() => expect(mockCancel).toHaveBeenCalledWith("session"))
    expect(result.current.locators).toEqual([])

    rerender({ publicationId: "publication-a" })

    expect(result.current.status).toBe("idle")
    expect(result.current.query).toBe("")
    expect(result.current.locators).toEqual([])
    await waitFor(() => expect(result.current.capabilities).not.toBeNull())
  })
})
