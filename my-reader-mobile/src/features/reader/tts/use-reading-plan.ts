import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { useQuery } from "@tanstack/react-query"
import { useTranslation } from "react-i18next"
import type { Locator, DecorationGroup } from "@my-reader/readium"
import {
  narrationCharacterColor,
  narrationPlanLocator,
  narrationPlanIndex,
} from "@my-reader/tools/narration-plan"
import {
  getBookReadingPlan,
  clearBookReadingPlan,
  type NarrationVoice,
  type NarrationPlanEntry,
} from "@/src/services/core/narration"
import { getTtsConfig } from "@/src/services/core/tts"
import { useBookNarration } from "@/src/domain/llm/use-book-narration"
import { errorMessage } from "@/src/i18n/error-message"
import { resolveReaderTtsSelection } from "./reader-tts"
import type { NarrationBookContext } from "./narration-playback"
import {
  analyzeNarrationChapter,
  subscribeReadingPlan,
} from "./narration-chapter"

export function useReadingPlan(
  book: NarrationBookContext | undefined,
  locator: Locator | undefined,
  language: string,
  stop: () => void,
  play: (locator: Locator, entry: NarrationPlanEntry) => void,
  navigate: (locator: Locator) => void,
) {
  const { t } = useTranslation()
  const { query: settings } = useBookNarration(
    book?.library ?? null,
    book?.bookId ?? 0,
    !!book,
  )
  const [shown, setShown] = useState(false)
  const [analyzing, setAnalyzing] = useState(false)
  const [failure, setFailure] = useState<unknown>(null)
  const controller = useRef<AbortController | null>(null)
  const query = useQuery({
    queryKey: [
      "reading-plan",
      book?.library.id,
      book?.bookId,
      book?.contentVersion,
      settings.data?.revision,
      language,
    ],
    enabled: !!book && settings.data?.enabled === true,
    queryFn: async () => {
      const selected = resolveReaderTtsSelection(await getTtsConfig(), language)
      const voice: NarrationVoice = {
        engine: selected.kind,
        voiceId: selected.voiceId ?? "",
        profileId:
          selected.kind === "provider" ? selected.profile.id : undefined,
      }
      return getBookReadingPlan(
        book!.library,
        book!.bookId,
        book!.contentVersion,
        voice,
      )
    },
  })
  const refetch = useRef(query.refetch)
  refetch.current = query.refetch
  const cancel = useCallback(() => {
    controller.current?.abort()
    controller.current = null
    setAnalyzing(false)
  }, [])
  useEffect(() => {
    cancel()
    setShown(false)
    return cancel
  }, [book?.bookId, book?.contentVersion, cancel])
  useEffect(
    () =>
      subscribeReadingPlan(() => {
        if (settings.data?.enabled) void refetch.current()
      }),
    [settings.data?.enabled],
  )
  const decorations = useMemo<DecorationGroup[]>(
    () => [
      {
        name: "narration-plan",
        decorations:
          shown && settings.data?.enabled
            ? (query.data ?? []).flatMap((entry) => {
                const source = narrationPlanLocator(entry)
                return source
                  ? [
                      {
                        id: entry.id,
                        locator: source,
                        style: {
                          type: "myreader-narration",
                          tint: narrationCharacterColor(entry.characterId),
                        },
                        extras: {
                          characterName:
                            entry.characterId === "narrator"
                              ? t("narration.narrator")
                              : entry.characterName,
                        },
                      },
                    ]
                  : []
              })
            : [],
      },
    ],
    [query.data, shown, settings.data?.enabled, t],
  )
  return {
    entries: query.data ?? [],
    currentIndex: narrationPlanIndex(query.data ?? [], locator),
    shown,
    setShown,
    analyzing,
    busy: analyzing || query.isFetching,
    decorations,
    error:
      failure || query.error ? errorMessage(failure ?? query.error) : undefined,
    cancel: () => {
      cancel()
      void query.refetch()
    },
    refresh: query.refetch,
    analyze: async () => {
      if (!book || !locator) return
      cancel()
      const abort = new AbortController()
      controller.current = abort
      setAnalyzing(true)
      setFailure(null)
      try {
        await analyzeNarrationChapter(book, locator, abort.signal)
      } catch (error) {
        if (!abort.signal.aborted) setFailure(error)
      } finally {
        if (controller.current === abort) {
          await query.refetch()
          controller.current = null
          setAnalyzing(false)
        }
      }
    },
    clear: async (ids: string[]) => {
      if (!book) return
      stop()
      cancel()
      setFailure(null)
      try {
        await clearBookReadingPlan(
          book.library,
          book.bookId,
          book.contentVersion,
          ids,
        )
        await query.refetch()
      } catch (error) {
        setFailure(error)
        throw error
      }
    },
    play: (id: string) => {
      const entry = query.data?.find((item) => item.id === id)
      const source = entry && narrationPlanLocator(entry)
      if (source && entry) play(source, entry)
    },
    jump: (id: string) => {
      const entry = query.data?.find((item) => item.id === id)
      const source = entry && narrationPlanLocator(entry)
      if (source) navigate(source)
    },
  }
}
export type ReadingPlanController = ReturnType<typeof useReadingPlan>
