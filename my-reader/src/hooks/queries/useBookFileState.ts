import { useQuery } from "@tanstack/react-query"
import { api } from "@/lib/tauri-api"

export const bookFileStateKeys = {
  all: ["bookFileState"] as const,
  detail: (libraryId: string, bookId: number, format: string) =>
    [...bookFileStateKeys.all, libraryId, bookId, format] as const,
}

export type BookFileState = {
  path: string
  localState: "present" | "remote_only" | string
  localSize: number | null
}

export function useBookFileState(
  libraryId: string | null | undefined,
  bookId: number | null | undefined,
  format: string | null | undefined,
  enabled = true,
) {
  return useQuery<BookFileState, Error>({
    queryKey: bookFileStateKeys.detail(
      libraryId ?? "",
      bookId ?? 0,
      format?.toUpperCase() ?? "",
    ),
    queryFn: async () => {
      if (!libraryId || bookId == null || !format) {
        throw new Error("Missing libraryId, bookId or format")
      }
      const dto = await api.checkBookFileState(
        libraryId,
        bookId,
        format.toUpperCase(),
      )
      return {
        path: dto.path,
        localState: dto.localState,
        localSize: dto.localSize,
      }
    },
    enabled: Boolean(libraryId && bookId != null && format && enabled),
    staleTime: 0,
  })
}
