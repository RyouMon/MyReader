import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/tauri-api"
import type {
  BookNarrationSettingsDto,
  CharacterImportRequestDto,
  CharacterDraftRequestDto,
  NarrationMergePlanDto,
} from "@/lib/tauri-specta"
import { notifyTtsConfigChanged } from "@/lib/tts/events"

export function useBookNarration(
  libraryId: string | null,
  bookId: number,
  enabled = true,
) {
  const client = useQueryClient()
  const key = ["book-narration", libraryId, bookId]
  const query = useQuery({
    queryKey: key,
    queryFn: () => api.getBookNarration(libraryId!, bookId),
    enabled: enabled && Boolean(libraryId),
  })
  const update = async (data: BookNarrationSettingsDto) => {
    client.setQueryData(key, data)
    await client.invalidateQueries({
      queryKey: ["book-narration", libraryId],
      predicate: (query) => query.queryKey[2] !== bookId,
    })
    await notifyTtsConfigChanged("book-narration")
  }
  const save = useMutation({
    mutationFn: (settings: BookNarrationSettingsDto) =>
      api.saveBookNarration(libraryId!, settings),
    onSuccess: update,
  })
  const searchSources = useMutation({
    mutationFn: (request: CharacterImportRequestDto) =>
      api.searchBookCharacterSources(libraryId!, request),
  })
  const draftCharacters = useMutation({
    mutationFn: (request: CharacterDraftRequestDto) =>
      api.draftBookCharacters(libraryId!, request),
  })
  const previewMerge = useMutation({
    mutationFn: (automatic: boolean) =>
      api.previewBookNarrationMerge(libraryId!, bookId, automatic),
  })
  const merge = useMutation({
    mutationFn: (plan: NarrationMergePlanDto) =>
      api.mergeBookNarration(libraryId!, bookId, plan),
    onSuccess: update,
  })
  return { query, save, searchSources, draftCharacters, previewMerge, merge }
}
