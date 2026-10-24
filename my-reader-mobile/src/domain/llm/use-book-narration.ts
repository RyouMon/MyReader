import type { Library } from "@my-reader/tools/types/library"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getBookNarration,
  saveBookNarration,
  importBookCharacters,
  type BookNarrationSettings,
} from "@/src/services/core/narration"

export function useBookNarration(
  library: Library | null,
  bookId: number,
  enabled = true,
) {
  const client = useQueryClient()
  const key = ["book-narration", library?.id, bookId]
  const query = useQuery({
    queryKey: key,
    queryFn: () => getBookNarration(library!, bookId),
    enabled: enabled && Boolean(library),
  })
  const save = useMutation({
    mutationFn: (settings: BookNarrationSettings) =>
      saveBookNarration(library!, settings),
    onSuccess: (data) => client.setQueryData(key, data),
  })
  const importCharacters = useMutation({
    mutationFn: (request: Parameters<typeof importBookCharacters>[1]) =>
      importBookCharacters(library!, request),
  })
  return { query, save, importCharacters }
}
