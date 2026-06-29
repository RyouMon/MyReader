import { useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/tauri-api"

export const bookReadingFormatKeys = {
  all: ["bookReadingFormat"] as const,
  list: (libraryId: string | null | undefined) =>
    [...bookReadingFormatKeys.all, libraryId ?? ""] as const,
}

export function useBookReadingFormats(libraryId: string | null | undefined) {
  return useQuery<Record<string, string>, Error>({
    queryKey: bookReadingFormatKeys.list(libraryId),
    queryFn: async () => {
      if (!libraryId) return {}
      return api.listBookReadingFormats(libraryId)
    },
    enabled: Boolean(libraryId),
    staleTime: 0,
  })
}

export function useSetBookReadingFormat(libraryId: string | null | undefined) {
  const queryClient = useQueryClient()
  return async (bookId: number, format: string | null) => {
    if (!libraryId) return
    await api.setBookReadingFormat(libraryId, bookId, format)
    await queryClient.invalidateQueries({
      queryKey: bookReadingFormatKeys.list(libraryId),
    })
  }
}
