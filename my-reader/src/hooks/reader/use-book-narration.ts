import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { api } from "@/lib/tauri-api"
import type {
  BookNarrationSettingsDto,
  CharacterImportRequestDto,
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
  const save = useMutation({
    mutationFn: (settings: BookNarrationSettingsDto) =>
      api.saveBookNarration(libraryId!, settings),
    onSuccess: async (data) => {
      client.setQueryData(key, data)
      await notifyTtsConfigChanged("book-narration")
    },
  })
  const importCharacters = useMutation({
    mutationFn: (request: CharacterImportRequestDto) =>
      api.importBookCharacters(libraryId!, request),
  })
  return { query, save, importCharacters }
}
