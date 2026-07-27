import { useCallback } from "react"

import { useQuery } from "@tanstack/react-query"

import type { Library } from "@/src/domain/types"
import {
  listBookReadingFormats,
  setBookReadingFormat as setBookReadingFormatCore,
} from "@/src/services/core/content"
import { queryKeys } from "@/src/services/query/query-keys"

export async function fetchBookReadingFormats(
  selectedLibrary: Library | null,
): Promise<Record<string, string>> {
  if (!selectedLibrary) return {}
  return listBookReadingFormats(selectedLibrary)
}

export function useBookReadingFormat(selectedLibrary: Library | null) {
  const query = useQuery({
    queryKey: queryKeys.bookReadingFormat(selectedLibrary?.id),
    queryFn: () => fetchBookReadingFormats(selectedLibrary),
    enabled: !!selectedLibrary,
    staleTime: 0,
  })

  const setBookReadingFormat = useCallback(
    async (bookId: string, format: string | null) => {
      if (!selectedLibrary) return

      await setBookReadingFormatCore(selectedLibrary, Number(bookId), format)
    },
    [selectedLibrary],
  )

  return { selectedFormatById: query.data ?? {}, setBookReadingFormat }
}
