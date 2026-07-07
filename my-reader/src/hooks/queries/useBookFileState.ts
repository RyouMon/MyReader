import { useQuery, useQueryClient } from "@tanstack/react-query"
import { useMemo } from "react"
import { api } from "@/lib/tauri-api"
import type { BookFileStateDto, FileStateRequestDto } from "@/lib/tauri-specta"

const BOOK_FILE_STATE_GC_TIME = 30 * 60 * 1000

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

export type BookFileStateLookup = {
  bookId: number
  format: string | null | undefined
}

function toBookFileState(
  dto: Pick<BookFileStateDto, "path" | "localState" | "localSize">,
): BookFileState {
  return {
    path: dto.path,
    localState: dto.localState,
    localSize: dto.localSize,
  }
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
      return toBookFileState(dto)
    },
    enabled: Boolean(libraryId && bookId != null && format && enabled),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: BOOK_FILE_STATE_GC_TIME,
  })
}

export function useBookFileStates(
  libraryId: string | null | undefined,
  lookups: BookFileStateLookup[],
  enabled = true,
) {
  const queryClient = useQueryClient()
  const missingLookups = useMemo<FileStateRequestDto[]>(() => {
    if (!libraryId || !enabled) return []

    const seen = new Set<string>()
    const missing: FileStateRequestDto[] = []
    for (const lookup of lookups) {
      const format = lookup.format?.toUpperCase()
      if (!format) continue

      const signature = `${lookup.bookId}:${format}`
      if (seen.has(signature)) continue
      seen.add(signature)

      const key = bookFileStateKeys.detail(libraryId, lookup.bookId, format)
      const state = queryClient.getQueryState<BookFileState>(key)
      if (state?.data && !state.isInvalidated) continue

      missing.push({ bookId: lookup.bookId, format })
    }

    return missing
  }, [enabled, libraryId, lookups, queryClient])

  const missingSignature = missingLookups.map(
    (lookup) => `${lookup.bookId}:${lookup.format}`,
  )

  return useQuery<BookFileStateDto[], Error>({
    queryKey: [
      ...bookFileStateKeys.all,
      "batch",
      libraryId ?? "",
      ...missingSignature,
    ],
    queryFn: async () => {
      if (!libraryId) return []

      const rows = await api.checkBookFileStates(libraryId, missingLookups)
      for (const row of rows) {
        queryClient.setQueryData(
          bookFileStateKeys.detail(libraryId, row.bookId, row.format),
          toBookFileState(row),
        )
      }
      return rows
    },
    enabled: Boolean(libraryId && enabled && missingLookups.length > 0),
    staleTime: Number.POSITIVE_INFINITY,
    gcTime: BOOK_FILE_STATE_GC_TIME,
  })
}
