import { appendLlmProgress } from "@my-reader/tools/llm-progress"
import { captureEpubViewportStartLocator } from "@/lib/readium/epubBookmarkAnchor"
import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { useQuery } from "@tanstack/react-query"
import { listen } from "@tauri-apps/api/event"
import { useTranslation } from "react-i18next"
import { Locator } from "@readium/shared"
import type { EpubNavigator } from "@readium/navigator"
import type { EpubTtsUtterance } from "@/lib/readium/epubTts"
import type { EpubTextResource } from "@/lib/readium/epubContentLocators"
import type { TtsVoiceRefDto, NarrationPlanEntryDto } from "@/lib/tauri-specta"
import { api } from "@/lib/tauri-api"
import { contentVersion, narrationContext } from "@/lib/tts/narration-context"
import { TTS_CONFIG_CHANGED_EVENT } from "@/lib/tts/events"
import {
  narrationPlanLocator,
  narrationPlanIndex,
  narrationSpeechForEntry,
} from "@my-reader/tools/narration-plan"
import { applyNarrationDecorations } from "@/lib/readium/narrationDecorations"
import { errorMessage } from "@/lib/error-presentation"

export function useReadingPlan({
  libraryId,
  bookId,
  enabled,
  resources,
  utterances,
  voice,
  navigatorRef,
  currentLocator,
  stop,
  playEntry,
  navigate,
}: {
  libraryId?: string | null
  bookId?: number
  enabled: boolean
  resources: EpubTextResource[]
  utterances: EpubTtsUtterance[]
  voice: TtsVoiceRefDto
  navigatorRef: RefObject<EpubNavigator | null>
  currentLocator: Locator | null
  playEntry: (entry: NarrationPlanEntryDto, locator: Locator) => void
  navigate: (locator: Locator) => void
  stop: () => void
}) {
  const { t } = useTranslation()
  const [version, setVersion] = useState("")
  const [shown, setShown] = useState(false)
  const [busy, setBusy] = useState(false)
  const [progress, setProgress] = useState({ kind: "", text: "" })
  const [failure, setFailure] = useState<unknown>(null)
  const controller = useRef<AbortController | null>(null)
  const chapters = useRef(new Map<string, Promise<void>>())
  const generation = useRef(0)
  useEffect(() => {
    let active = true
    setVersion("")
    if (!enabled) return
    void contentVersion(resources).then((value) => {
      if (active) setVersion(value)
    })
    return () => {
      active = false
    }
  }, [resources, enabled])
  const query = useQuery({
    queryKey: ["reading-plan", libraryId, bookId, version, voice],
    queryFn: () => api.getBookReadingPlan(libraryId!, bookId!, version, voice),
    enabled: enabled && !!libraryId && bookId !== undefined && !!version,
  })
  const reset = useCallback(() => {
    generation.current++
    controller.current?.abort()
    controller.current = null
    chapters.current.clear()
    setBusy(false)
    setProgress({ kind: "", text: "" })
  }, [])
  useEffect(() => {
    reset()
    setShown(false)
    return reset
  }, [libraryId, bookId, version, enabled, reset])
  const refreshRef = useRef(query.refetch)
  refreshRef.current = query.refetch
  useEffect(() => {
    if (!enabled) return
    const changed = () => {
      reset()
      if (enabled) void refreshRef.current()
    }
    let disposed = false
    let unlisten: (() => void) | undefined
    void listen(TTS_CONFIG_CHANGED_EVENT, changed).then((cleanup) => {
      if (disposed) cleanup()
      else unlisten = cleanup
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [reset, enabled])

  const ensureChapter = useCallback(
    async (utterance: EpubTtsUtterance, signal?: AbortSignal) => {
      if (!libraryId || bookId === undefined || !enabled) return
      const href = utterance.locator.href
      const existing = chapters.current.get(href)
      if (existing) return existing
      const abort = new AbortController()
      controller.current = abort
      const cancel = () => abort.abort()
      signal?.addEventListener("abort", cancel, { once: true })
      if (signal?.aborted) abort.abort()
      const current = generation.current
      setBusy(true)
      setProgress({ kind: "", text: "" })
      setFailure(null)
      const work = (async () => {
        try {
          const requests = await Promise.all(
            utterances
              .filter((item) => item.locator.href === href)
              .map((item) =>
                narrationContext(bookId, item, utterances, resources),
              ),
          )
          if (requests.length)
            await api.analyzeBookNarration(
              libraryId,
              requests,
              abort.signal,
              (event) => {
                if (
                  generation.current === current &&
                  controller.current === abort &&
                  !abort.signal.aborted
                )
                  setProgress((previous) => appendLlmProgress(previous, event))
              },
            )
        } catch (error) {
          if (generation.current === current) {
            chapters.current.delete(href)
            if (controller.current === abort && !abort.signal.aborted)
              setFailure(error)
          }
          throw error
        } finally {
          signal?.removeEventListener("abort", cancel)
          if (generation.current === current && controller.current === abort) {
            await refreshRef.current()
            if (controller.current === abort) {
              setBusy(false)
              controller.current = null
              setProgress({ kind: "", text: "" })
            }
          }
        }
      })()
      chapters.current.set(href, work)
      return work
    },
    [bookId, libraryId, enabled, resources, utterances],
  )

  useEffect(() => {
    const navigator = navigatorRef.current
    if (!navigator) return
    const render = () =>
      applyNarrationDecorations(
        navigator,
        shown && enabled
          ? (query.data ?? []).map((entry) => ({
              ...entry,
              characterName:
                entry.characterId === "narrator"
                  ? t("narration.narrator")
                  : entry.characterName,
            }))
          : [],
      )
    render()
    const frame = requestAnimationFrame(render)
    window.addEventListener("resize", render)
    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener("resize", render)
      applyNarrationDecorations(navigator, [])
    }
  }, [shown, enabled, query.data, currentLocator, navigatorRef, t])

  const locateCurrent = useCallback(() => {
    let locator = currentLocator?.serialize()
    if (locator && navigatorRef.current) {
      try {
        locator =
          captureEpubViewportStartLocator(navigatorRef.current, locator) ??
          locator
      } catch {
        // A resource navigation may be replacing the frame; keep its Readium locator.
      }
    }
    return narrationPlanIndex(query.data ?? [], locator)
  }, [currentLocator, navigatorRef, query.data])

  return {
    entries: query.data ?? [],
    resolveSpeech: async (
      entry: NarrationPlanEntryDto,
      defaultVoice: TtsVoiceRefDto,
    ) => {
      if (!libraryId || bookId === undefined || !version)
        throw new Error("NARRATION_PLAN_INVALID")
      const entries = await api.getBookReadingPlan(
        libraryId,
        bookId,
        version,
        defaultVoice,
      )
      return narrationSpeechForEntry(entries, entry)
    },
    locateCurrent,
    currentIndex: narrationPlanIndex(
      query.data ?? [],
      currentLocator?.serialize(),
    ),
    shown,
    setShown,
    busy: busy || query.isFetching,
    analyzing: busy,
    progress: progress.text,
    error: failure || query.error ? errorMessage(failure ?? query.error) : null,
    ensureChapter,
    cancel: () => {
      reset()
      void refreshRef.current()
    },
    analyze: async () => {
      const unit =
        utterances.find((item) => item.locator.href === currentLocator?.href) ??
        utterances[0]
      if (unit) {
        try {
          await ensureChapter(unit)
        } catch {
          /* Displayed above. */
        }
      }
    },
    clear: async (ids: string[]) => {
      if (!libraryId || bookId === undefined) return
      stop()
      reset()
      setFailure(null)
      try {
        await api.clearBookReadingPlan(libraryId, bookId, version, ids)
        await query.refetch()
      } catch (error) {
        setFailure(error)
        throw error
      }
    },
    play: (id: string) => {
      const entry = query.data?.find((item) => item.id === id)
      const locator = entry && narrationPlanLocator(entry)
      const target = locator && Locator.deserialize(locator)
      if (entry && target) playEntry(entry, target)
    },
    jump: (id: string) => {
      const entry = query.data?.find((item) => item.id === id)
      const locator = entry && narrationPlanLocator(entry)
      const target = locator && Locator.deserialize(locator)
      if (target) navigate(target)
    },
  }
}

export type ReadingPlanController = ReturnType<typeof useReadingPlan>
