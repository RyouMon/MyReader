import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react-native"
import type { ReactNode } from "react"

import type { Library } from "@/src/domain/types"
import {
  listBookReadingFormats,
  setBookReadingFormat,
} from "@/src/services/core/content"

import {
  useBookReadingFormat,
  fetchBookReadingFormats,
} from "./use-book-reading-format"

jest.mock("@/src/services/core/content", () => ({
  listBookReadingFormats: jest.fn(),
  setBookReadingFormat: jest.fn(),
}))

const mockLibrary: Library = {
  id: "lib-1",
  name: "Test Library",
  path: "/test",
  sourceType: "local",
} as Library

function wrapper({ children }: { children: ReactNode }) {
  const client = new QueryClient({
    defaultOptions: { queries: { staleTime: 0, gcTime: 0 } },
  })
  return (
    <QueryClientProvider client={client}>
      {children as never}
    </QueryClientProvider>
  )
}

describe("useBookReadingFormat", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should return an empty map when no library is selected", async () => {
    const { result, unmount } = renderHook(() => useBookReadingFormat(null), {
      wrapper,
    })

    expect(result.current.selectedFormatById).toEqual({})
    expect(listBookReadingFormats).not.toHaveBeenCalled()

    unmount()
  })

  it("should return an empty map when fetching formats without a library", async () => {
    const result = await fetchBookReadingFormats(null)

    expect(result).toEqual({})
    expect(listBookReadingFormats).not.toHaveBeenCalled()
  })

  it("should return formats validated by core when a library is selected", async () => {
    jest.mocked(listBookReadingFormats).mockResolvedValue({
      "1": "EPUB",
    })

    const { result, unmount } = renderHook(
      () => useBookReadingFormat(mockLibrary),
      { wrapper },
    )

    await waitFor(() =>
      expect(result.current.selectedFormatById).toEqual({ "1": "EPUB" }),
    )

    expect(listBookReadingFormats).toHaveBeenCalledWith(mockLibrary)

    unmount()
  })

  it("should set the reading format when the book has multiple readable formats", async () => {
    jest.mocked(listBookReadingFormats).mockResolvedValue({})
    jest.mocked(setBookReadingFormat).mockResolvedValue(undefined)

    const { result, unmount } = renderHook(
      () => useBookReadingFormat(mockLibrary),
      { wrapper },
    )

    await waitFor(() => expect(result.current.selectedFormatById).toEqual({}))

    await act(async () => {
      await result.current.setBookReadingFormat("1", "pdf")
    })

    expect(setBookReadingFormat).toHaveBeenCalledWith(mockLibrary, 1, "pdf")

    unmount()
  })

  it("should clear the reading format when set to null", async () => {
    jest.mocked(listBookReadingFormats).mockResolvedValue({})
    jest.mocked(setBookReadingFormat).mockResolvedValue(undefined)

    const { result, unmount } = renderHook(
      () => useBookReadingFormat(mockLibrary),
      { wrapper },
    )

    await waitFor(() => expect(result.current.selectedFormatById).toEqual({}))

    await act(async () => {
      await result.current.setBookReadingFormat("1", null)
    })

    expect(setBookReadingFormat).toHaveBeenCalledWith(mockLibrary, 1, null)

    unmount()
  })

  it("should do nothing when setting format without a library", async () => {
    const { result, unmount } = renderHook(() => useBookReadingFormat(null), {
      wrapper,
    })

    await act(async () => {
      await result.current.setBookReadingFormat("1", "epub")
    })

    expect(setBookReadingFormat).not.toHaveBeenCalled()

    unmount()
  })

  it("should return an empty map when the query fails", async () => {
    jest.mocked(listBookReadingFormats).mockRejectedValue(new Error("db error"))

    const { result, unmount } = renderHook(
      () => useBookReadingFormat(mockLibrary),
      { wrapper },
    )

    await waitFor(() => expect(result.current.selectedFormatById).toEqual({}))

    unmount()
  })
})
