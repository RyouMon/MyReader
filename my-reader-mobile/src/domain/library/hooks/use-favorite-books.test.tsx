import { QueryClientProvider } from "@tanstack/react-query"
import { act, renderHook, waitFor } from "@testing-library/react-native"
import type { ReactNode } from "react"

import type { BookItem, Library } from "@/src/domain/types"
import {
  addFavoriteBook,
  listFavoriteBooks,
  removeFavoriteBook,
} from "@/src/repos/favorite-books"
import { queryClient } from "@/src/services/query/query-client"
import { queryKeys } from "@/src/services/query/query-keys"

import { useFavoriteBooks, fetchFavoriteBookIds } from "./use-favorite-books"

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

jest.mock("@/src/repos/favorite-books", () => ({
  addFavoriteBook: jest.fn(),
  listFavoriteBooks: jest.fn(),
  removeFavoriteBook: jest.fn(),
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

function wrapper({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  )
}

describe("useFavoriteBooks", () => {
  beforeEach(() => {
    queryClient.clear()
    jest.clearAllMocks()
  })

  it("returns an empty set when no library is selected", async () => {
    const { result, unmount } = renderHook(
      () => useFavoriteBooks(null, books),
      { wrapper },
    )

    expect(result.current.favoriteSet.size).toBe(0)
    expect(result.current.isFavorite("1")).toBe(false)
    expect(listFavoriteBooks).not.toHaveBeenCalled()

    unmount()
  })

  it("returns an empty array when fetching favorites without a library", async () => {
    const result = await fetchFavoriteBookIds(null)

    expect(result).toEqual([])
    expect(listFavoriteBooks).not.toHaveBeenCalled()
  })

  it("returns favorite ids present in the current books", async () => {
    jest
      .mocked(listFavoriteBooks)
      .mockResolvedValue([
        { bookId: 1 },
        { bookId: 2 },
        { bookId: 99 },
      ] as Awaited<ReturnType<typeof listFavoriteBooks>>)

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

  it("filters out favorite ids that are not in the current books", async () => {
    jest
      .mocked(listFavoriteBooks)
      .mockResolvedValue([{ bookId: 1 }, { bookId: 99 }] as Awaited<
        ReturnType<typeof listFavoriteBooks>
      >)

    const { result, unmount } = renderHook(
      () => useFavoriteBooks(mockLibrary, books),
      { wrapper },
    )

    await waitFor(() => expect(result.current.favoriteSet.size).toBe(1))
    expect(result.current.isFavorite("1")).toBe(true)
    expect(result.current.isFavorite("99")).toBe(false)

    unmount()
  })

  it("removes a favorite when toggling an already-favorite book", async () => {
    jest
      .mocked(listFavoriteBooks)
      .mockResolvedValue([{ bookId: 1 }] as Awaited<
        ReturnType<typeof listFavoriteBooks>
      >)
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

  it("adds a favorite when toggling a non-favorite book", async () => {
    jest
      .mocked(listFavoriteBooks)
      .mockResolvedValue([] as Awaited<ReturnType<typeof listFavoriteBooks>>)
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

  it("does nothing when toggling with an invalid book id", async () => {
    jest
      .mocked(listFavoriteBooks)
      .mockResolvedValue([] as Awaited<ReturnType<typeof listFavoriteBooks>>)

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

  it("does nothing when toggling without a library", async () => {
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

  it("handles stale Set-shaped cache without crashing", async () => {
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

  it("handles non-iterable stale cache without crashing", async () => {
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

  it("returns an empty set when the query fails", async () => {
    jest.mocked(listFavoriteBooks).mockRejectedValue(new Error("db error"))

    const { result, unmount } = renderHook(
      () => useFavoriteBooks(mockLibrary, books),
      { wrapper },
    )

    await waitFor(() => expect(result.current.favoriteSet.size).toBe(0))
    expect(result.current.isFavorite("1")).toBe(false)

    unmount()
  })
})
