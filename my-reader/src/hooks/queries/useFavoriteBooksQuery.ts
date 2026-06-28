import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import type { CalibreBook } from "@my-reader/tools/types/book"
import { api } from "@/lib/tauri-api"

export const favoriteBookKeys = {
  all: ["favoriteBooks"] as const,
  list: (libraryId: string | null) =>
    [...favoriteBookKeys.all, libraryId] as const,
}

function normalizeSearch(value: string) {
  return value.trim().toLowerCase()
}

function matchesSearch(book: CalibreBook, search: string) {
  const q = normalizeSearch(search)
  if (!q) return true
  return [
    book.title,
    book.authorSort,
    book.series ?? "",
    ...book.authors,
    ...book.tags,
  ]
    .join(" ")
    .toLowerCase()
    .includes(q)
}

function sortBooks(books: CalibreBook[], sortBy: string) {
  const next = [...books]
  if (sortBy === "author") {
    next.sort((a, b) => a.authorSort.localeCompare(b.authorSort))
  } else if (sortBy === "recent" || sortBy === "progress") {
    next.sort((a, b) => (b.timestamp ?? "").localeCompare(a.timestamp ?? ""))
  } else {
    next.sort((a, b) => a.title.localeCompare(b.title))
  }
  return next
}

export function useFavoriteBookIds(libraryId: string | null) {
  return useQuery({
    queryKey: favoriteBookKeys.list(libraryId),
    queryFn: () => api.listFavoriteBookIds(libraryId),
    enabled: !!libraryId,
  })
}

export function useFavoriteBookSet(libraryId: string | null) {
  const query = useFavoriteBookIds(libraryId)
  return {
    ...query,
    favoriteSet: new Set(query.data ?? []),
  }
}

export function useFavoriteBookMutations(libraryId: string | null) {
  const queryClient = useQueryClient()

  const add = useMutation({
    mutationFn: (bookId: number) => api.addFavoriteBook(libraryId, bookId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: favoriteBookKeys.list(libraryId),
      })
    },
  })

  const remove = useMutation({
    mutationFn: (bookId: number) => api.removeFavoriteBook(libraryId, bookId),
    onSuccess: () => {
      void queryClient.invalidateQueries({
        queryKey: favoriteBookKeys.list(libraryId),
      })
    },
  })

  return {
    addFavoriteBook: add.mutateAsync,
    removeFavoriteBook: remove.mutateAsync,
    isPending: add.isPending || remove.isPending,
  }
}

export function useFavoriteBooks(
  libraryId: string | null,
  sortBy: string,
  search: string,
) {
  return useQuery({
    queryKey: [...favoriteBookKeys.list(libraryId), "books", sortBy, search],
    queryFn: async () => {
      const [favoriteIds, books] = await Promise.all([
        api.listFavoriteBookIds(libraryId),
        api.getBooks(libraryId),
      ])
      const favoriteSet = new Set(favoriteIds)
      const items = sortBooks(
        books.filter(
          (book) => favoriteSet.has(book.id) && matchesSearch(book, search),
        ),
        sortBy,
      )
      return {
        items,
        total: items.length,
      }
    },
    enabled: !!libraryId,
  })
}
