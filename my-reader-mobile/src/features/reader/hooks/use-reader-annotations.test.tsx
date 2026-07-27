import type { Locator } from "@my-reader/readium"
import { QueryClient, QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react-native"
import type { PropsWithChildren } from "react"

import type { Library } from "@/src/domain/types"
import { useReaderAnnotations } from "./use-reader-annotations"

const mockAddReaderAnnotation = jest.fn()
const mockListReaderAnnotations = jest.fn()
const mockRemoveReaderAnnotation = jest.fn()
const mockUpdateReaderAnnotation = jest.fn()

jest.mock("@/src/features/reader/reader-annotations", () => ({
  addReaderAnnotation: (...args: unknown[]) => mockAddReaderAnnotation(...args),
  listReaderAnnotations: (...args: unknown[]) =>
    mockListReaderAnnotations(...args),
  removeReaderAnnotation: (...args: unknown[]) =>
    mockRemoveReaderAnnotation(...args),
  updateReaderAnnotation: (...args: unknown[]) =>
    mockUpdateReaderAnnotation(...args),
}))

const library = {
  id: "library-1",
  name: "Library",
  path: "/library",
  bookCount: 1,
} as Library

const locator: Locator = {
  href: "chapter.xhtml",
  type: "application/xhtml+xml",
  text: { highlight: "Selected text" },
}

function createWrapper() {
  const client = new QueryClient({
    defaultOptions: {
      queries: { retry: false, gcTime: Infinity },
      mutations: { retry: false, gcTime: Infinity },
    },
  })
  function Wrapper({ children }: PropsWithChildren) {
    return (
      <QueryClientProvider client={client}>
        {children as never}
      </QueryClientProvider>
    )
  }
  return Wrapper
}

describe("useReaderAnnotations", () => {
  let consoleError: jest.SpyInstance

  beforeEach(() => {
    jest.clearAllMocks()
    mockListReaderAnnotations.mockResolvedValue([])
    consoleError = jest.spyOn(console, "error").mockImplementation()
  })

  afterEach(() => {
    consoleError.mockRestore()
  })

  it("should log the original error and scope when loading annotations fails", async () => {
    const cause = new Error("database unavailable")
    const error = new Error("annotation query failed", { cause })
    mockListReaderAnnotations.mockRejectedValue(error)
    const Wrapper = createWrapper()

    const { result } = renderHook(
      () => useReaderAnnotations(library, 7, "EPUB"),
      { wrapper: Wrapper },
    )

    await waitFor(() => expect(result.current.error).toBe(error))
    expect(consoleError).toHaveBeenCalledWith(
      "[reader-annotations] load:failed",
      expect.objectContaining({
        libraryId: "library-1",
        bookId: 7,
        format: "EPUB",
        annotationId: null,
        error,
        cause,
      }),
    )
  })

  it("should log the original error and operation when adding an annotation fails", async () => {
    const error = new Error("annotation write failed")
    mockAddReaderAnnotation.mockRejectedValue(error)
    const Wrapper = createWrapper()
    const { result } = renderHook(
      () => useReaderAnnotations(library, 7, "EPUB"),
      { wrapper: Wrapper },
    )
    await waitFor(() => expect(result.current.loading).toBe(false))

    await act(async () => {
      await expect(result.current.add(locator, "yellow", "Note")).rejects.toBe(
        error,
      )
    })

    expect(consoleError).toHaveBeenCalledWith(
      "[reader-annotations] add:failed",
      expect.objectContaining({
        libraryId: "library-1",
        bookId: 7,
        format: "EPUB",
        annotationId: null,
        error,
      }),
    )
  })
})
