import type { Library } from "@my-reader/tools/types/library"
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import {
  getBookNarration,
  saveBookNarration,
  previewBookNarrationMerge,
  mergeBookNarration,
  type BookNarrationSettings,
  type NarrationMergePlan,
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
  const update = async (data: BookNarrationSettings) => {
    client.setQueryData(key, data)
    await client.invalidateQueries({
      queryKey: ["book-narration", library?.id],
      predicate: (query) => query.queryKey[2] !== bookId,
    })
  }
  const save = useMutation({
    mutationFn: (settings: BookNarrationSettings) =>
      saveBookNarration(library!, settings),
    onSuccess: update,
  })
  const previewMerge = useMutation({
    mutationFn: (automatic: boolean) =>
      previewBookNarrationMerge(library!, bookId, automatic),
  })
  const merge = useMutation({
    mutationFn: (plan: NarrationMergePlan) =>
      mergeBookNarration(library!, bookId, plan),
    onSuccess: update,
  })
  return { query, save, previewMerge, merge }
}
