import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query"
import { useEffect } from "react"
import { listen } from "@tauri-apps/api/event"
import { api } from "@/lib/tauri-api"
import type {
  BookNarrationSettingsDto,
  CharacterImportRequestDto,
  NarrationMergePlanDto,
} from "@/lib/tauri-specta"
import {
  notifyTtsConfigChanged,
  TTS_CONFIG_CHANGED_EVENT,
} from "@/lib/tts/events"
import { useCharacterDraft } from "./use-character-draft"

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
  useEffect(() => {
    if (!enabled || !libraryId) return
    let disposed = false
    let unlisten: (() => void) | undefined
    void listen(TTS_CONFIG_CHANGED_EVENT, () => {
      void client.invalidateQueries({
        queryKey: ["book-narration", libraryId, bookId],
        exact: true,
      })
    }).then((cleanup) => {
      if (disposed) cleanup()
      else unlisten = cleanup
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [bookId, client, enabled, libraryId])
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
  const { draftCharacters, draftProgress, cancelDraft } = useCharacterDraft(
    libraryId,
    bookId,
  )
  const previewMerge = useMutation({
    mutationFn: (automatic: boolean) =>
      api.previewBookNarrationMerge(libraryId!, bookId, automatic),
  })
  const merge = useMutation({
    mutationFn: (plan: NarrationMergePlanDto) =>
      api.mergeBookNarration(libraryId!, bookId, plan),
    onSuccess: update,
  })
  return {
    query,
    save,
    searchSources,
    draftCharacters,
    draftProgress,
    cancelDraft,
    previewMerge,
    merge,
  }
}
