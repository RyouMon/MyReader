import { QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react-native"
import type { ComponentProps } from "react"

import type { BookItem, Library } from "@/src/domain/types"
import { listFavoriteBookIds } from "@/src/services/core/reading"
import { queryClient } from "@/src/services/query/query-client"
import { queryKeys } from "@/src/services/query/query-keys"
import { addFavoriteBook, removeFavoriteBook } from "../favorite-books"

import { fetchFavoriteBookIds, useFavoriteBooks } from "./use-favorite-books"

jest.mock("@/src/services/query/query-client", () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { QueryClient } = require("@tanstack/react-query")
  return {
    queryClient: new QueryClient({
      defaultOptions: {
        queries: { staleTime: 0, gcTime: 0 },
      },
    }),
  }
})

jest.mock("../favorite-books", () => ({
  addFavoriteBook: jest.fn(),
  removeFavoriteBook: jest.fn(),
}))

jest.mock("@/src/services/core/reading", () => ({
  listFavoriteBookIds: jest.fn(),
}))
const mockLibrary: Library = {
  id: "lib-1",
  name: "Test Library",
  path: "/test",
  sourceType: "local",
} as Library

const books: BookItem[] = [
  { id: "1", title: "Book 1", author: "A", path: "/1" } as BookItem,
  { id: "2", title: "Book 2", author: "B", path: "/2" } as BookItem,
  { id: "3", title: "Book 3", author: "C", path: "/3" } as BookItem,
]

function wrapper({
  children,
}: {
  children: ComponentProps<typeof QueryClientProvider>["children"]
}) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe("useFavoriteBooks", () => {
  beforeEach(() => {
    queryClient.clear()
    jest.clearAllMocks()
  })

  it("should return an empty set when no library is selected", async () => {
    const { result, unmount } = renderHook(
      () => useFavoriteBooks(null, books),
      { wrapper },
    )

    expect(result.current.favoriteSet.size).toBe(0)
    expect(result.current.isFavorite("1")).toBe(false)
    expect(listFavoriteBookIds).not.toHaveBeenCalled()

    unmount()
  })

  it("should return an empty array when fetching favorites without a library", async () => {
    const result = await fetchFavoriteBookIds(null)

    expect(result).toEqual([])
    expect(listFavoriteBookIds).not.toHaveBeenCalled()
  })

  it("should return favorite ids present in the current books when managing favorite books", async () => {
    jest.mocked(listFavoriteBookIds).mockResolvedValue([1, 2, 99])

    const { result, unmount } = renderHook(
      () => useFavoriteBooks(mockLibrary, books),
      { wrapper },
    )

    await waitFor(() => expect(result.current.favoriteSet.size).toBe(2))

    expect(result.current.isFavorite("1")).toBe(true)
    expect(result.current.isFavorite("2")).toBe(true)
    expect(result.current.isFavorite("3")).toBe(false)
    expect(result.current.isFavorite("99")).toBe(false)

    unmount()
  })

  it("should filter out favorite ids that are not in the current books when managing favorite books", async () => {
    jest.mocked(listFavoriteBookIds).mockResolvedValue([1, 99])

    const { result, unmount } = renderHook(
      () => useFavoriteBooks(mockLibrary, books),
      { wrapper },
    )

    await waitFor(() => expect(result.current.favoriteSet.size).toBe(1))
    expect(result.current.isFavorite("1")).toBe(true)
    expect(result.current.isFavorite("99")).toBe(false)

    unmount()
  })

  it("should remove a favorite when toggling an already-favorite book", async () => {
    jest.mocked(listFavoriteBookIds).mockResolvedValue([1])
    jest.mocked(removeFavoriteBook).mockResolvedValue(undefined)

    const { result, unmount } = renderHook(
      () => useFavoriteBooks(mockLibrary, books),
      { wrapper },
    )

    await waitFor(() => expect(result.current.isFavorite("1")).toBe(true))

    await act(async () => {
      await result.current.toggleFavorite("1")
    })

    expect(removeFavoriteBook).toHaveBeenCalledWith(mockLibrary, 1)
    expect(addFavoriteBook).not.toHaveBeenCalled()

    unmount()
  })

  it("should add a favorite when toggling a non-favorite book", async () => {
    jest.mocked(listFavoriteBookIds).mockResolvedValue([])
    jest.mocked(addFavoriteBook).mockResolvedValue(undefined)

    const { result, unmount } = renderHook(
      () => useFavoriteBooks(mockLibrary, books),
      { wrapper },
    )

    await waitFor(() => expect(result.current.favoriteSet.size).toBe(0))

    await act(async () => {
      await result.current.toggleFavorite("2")
    })

    expect(addFavoriteBook).toHaveBeenCalledWith(mockLibrary, 2)
    expect(removeFavoriteBook).not.toHaveBeenCalled()

    unmount()
  })

  it("should do nothing when toggling with an invalid book id", async () => {
    jest.mocked(listFavoriteBookIds).mockResolvedValue([])

    const { result, unmount } = renderHook(
      () => useFavoriteBooks(mockLibrary, books),
      { wrapper },
    )

    await waitFor(() => expect(result.current.favoriteSet.size).toBe(0))

    await act(async () => {
      await result.current.toggleFavorite("not-a-number")
    })

    expect(addFavoriteBook).not.toHaveBeenCalled()
    expect(removeFavoriteBook).not.toHaveBeenCalled()

    unmount()
  })

  it("should do nothing when toggling without a library", async () => {
    const { result, unmount } = renderHook(
      () => useFavoriteBooks(null, books),
      { wrapper },
    )

    await act(async () => {
      await result.current.toggleFavorite("1")
    })

    expect(addFavoriteBook).not.toHaveBeenCalled()
    expect(removeFavoriteBook).not.toHaveBeenCalled()

    unmount()
  })

  it("should handle stale Set-shaped cache without crashing when managing favorite books", async () => {
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries")

    act(() => {
      queryClient.setQueryData(
        queryKeys.favoriteBooks(mockLibrary.id),
        new Set(["1", "2"]),
      )
    })

    const { result, unmount } = renderHook(
      () => useFavoriteBooks(mockLibrary, books),
      { wrapper },
    )

    await waitFor(() => expect(result.current.favoriteSet.size).toBe(2))
    expect(result.current.isFavorite("1")).toBe(true)
    expect(result.current.isFavorite("2")).toBe(true)

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.favoriteBooks(mockLibrary.id),
      }),
    )

    invalidateSpy.mockRestore()
    unmount()
  })

  it("should handle non-iterable stale cache without crashing when managing favorite books", async () => {
    const invalidateSpy = jest.spyOn(queryClient, "invalidateQueries")

    act(() => {
      queryClient.setQueryData(queryKeys.favoriteBooks(mockLibrary.id), {
        bookId: 1,
      } as unknown as string[])
    })

    const { result, unmount } = renderHook(
      () => useFavoriteBooks(mockLibrary, books),
      { wrapper },
    )

    await waitFor(() => expect(result.current.favoriteSet.size).toBe(0))

    await waitFor(() =>
      expect(invalidateSpy).toHaveBeenCalledWith({
        queryKey: queryKeys.favoriteBooks(mockLibrary.id),
      }),
    )

    invalidateSpy.mockRestore()
    unmount()
  })

  it("should return an empty set when the query fails", async () => {
    jest.mocked(listFavoriteBookIds).mockRejectedValue(new Error("db error"))

    const { result, unmount } = renderHook(
      () => useFavoriteBooks(mockLibrary, books),
      { wrapper },
    )

    await waitFor(() => expect(result.current.favoriteSet.size).toBe(0))
    expect(result.current.isFavorite("1")).toBe(false)

    unmount()
  })
})
