import type {
  Locator,
  TtsPlaybackState,
  TtsSynthesisCancelEvent,
  TtsSynthesisRequestEvent,
} from "@my-reader/readium"
import { useCallback, useEffect, useRef, useState, type RefObject } from "react"
import { Platform } from "react-native"

import type { ReadiumReflowReaderRef } from "@/src/features/reader/components/reader/reflow/ReadiumReflowReader"
import {
  getTtsConfig,
  listTtsVoices,
  setTtsVoice,
  synthesizeTts,
} from "@/src/services/core/tts"
import { describeError } from "@/src/utils/common"
import {
  buildReaderTtsEngineConfig,
  buildReaderTtsSynthesisRequest,
  chooseReaderTtsVoice,
  resolveReaderTtsSelection,
} from "./reader-tts"

const REMOTE_AUDIO_MIME_TYPES =
  Platform.OS === "ios"
    ? ["audio/mpeg", "audio/aac", "audio/mp4", "audio/wav"]
    : [
        "audio/mpeg",
        "audio/webm",
        "audio/ogg",
        "audio/aac",
        "audio/mp4",
        "audio/wav",
      ]

type UseReaderTtsSessionOptions = {
  enabled: boolean
  publicationKey: string
  language: string
  highlightColor: string
  readerRef: RefObject<ReadiumReflowReaderRef | null>
  onError?: (error: string) => void
}

export const READER_TTS_NO_READABLE_CONTENT_ERROR =
  "TTS_NO_READABLE_CONTENT_FROM_POSITION"
export const READER_TTS_UNKNOWN_ERROR = "TTS_UNKNOWN_ERROR"
export const READER_TTS_VOICES_EMPTY_ERROR = "TTS_VOICES_EMPTY"

export function useReaderTtsSession({
  enabled,
  publicationKey,
  language,
  highlightColor,
  readerRef,
  onError,
}: UseReaderTtsSessionOptions) {
  const [sessionState, setSessionState] = useState<{
    publicationKey: string
    state: TtsPlaybackState | null
  }>({ publicationKey, state: null })
  const state =
    sessionState.publicationKey === publicationKey ? sessionState.state : null
  const [remote, setRemote] = useState(false)
  const generationRef = useRef(0)
  const activeEngineConfigRef = useRef<ReturnType<
    typeof buildReaderTtsEngineConfig
  > | null>(null)
  const synthesisControllersRef = useRef(new Map<string, AbortController>())
  const pauseAfterStartRef = useRef(false)
  const terminalErrorRef = useRef(false)
  const playbackStartedRef = useRef(false)

  const abortOutstandingSynthesis = useCallback(() => {
    synthesisControllersRef.current.forEach((controller) => {
      controller.abort()
    })
    synthesisControllersRef.current.clear()
  }, [])

  const stop = useCallback(() => {
    generationRef.current += 1
    activeEngineConfigRef.current = null
    pauseAfterStartRef.current = false
    terminalErrorRef.current = false
    playbackStartedRef.current = false
    abortOutstandingSynthesis()
    readerRef.current?.stopTts()
    setRemote(false)
    setSessionState({ publicationKey, state: null })
  }, [abortOutstandingSynthesis, publicationKey, readerRef])

  useEffect(() => {
    const activeReader = readerRef.current
    return () => {
      generationRef.current += 1
      activeEngineConfigRef.current = null
      pauseAfterStartRef.current = false
      terminalErrorRef.current = false
      playbackStartedRef.current = false
      abortOutstandingSynthesis()
      activeReader?.stopTts()
    }
  }, [abortOutstandingSynthesis, publicationKey, readerRef])

  const reportError = useCallback(
    (error?: string) => {
      if (terminalErrorRef.current) return
      const message = error?.trim() || READER_TTS_UNKNOWN_ERROR
      terminalErrorRef.current = true
      pauseAfterStartRef.current = false
      abortOutstandingSynthesis()
      setSessionState({
        publicationKey,
        state: { state: "error", error: message },
      })
      onError?.(message)
    },
    [abortOutstandingSynthesis, onError, publicationKey],
  )

  const start = useCallback(
    async (
      fromLocator?: Locator,
      options?: {
        pauseAfterStart?: boolean
        startAtViewportStart?: boolean
      },
    ) => {
      if (!enabled) return
      const generation = generationRef.current + 1
      generationRef.current = generation
      activeEngineConfigRef.current = null
      pauseAfterStartRef.current = options?.pauseAfterStart === true
      terminalErrorRef.current = false
      playbackStartedRef.current = false
      abortOutstandingSynthesis()
      setRemote(false)
      setSessionState({ publicationKey, state: { state: "loading" } })

      try {
        let config = await getTtsConfig()
        let selection = resolveReaderTtsSelection(config, language)

        if (selection.kind === "provider" && !selection.voiceId) {
          const voices = await listTtsVoices(selection.profile.id)
          const voice = chooseReaderTtsVoice(voices, language)
          if (!voice) throw new Error(READER_TTS_VOICES_EMPTY_ERROR)
          config = await setTtsVoice(language || "und", {
            language: language || "und",
            engine: "provider",
            profileId: selection.profile.id,
            voiceId: voice.id,
          })
          selection = resolveReaderTtsSelection(config, language)
        }

        if (generationRef.current !== generation) return
        setRemote(selection.kind === "provider")
        const engineConfig = buildReaderTtsEngineConfig(
          config,
          selection,
          language,
          highlightColor,
        )
        activeEngineConfigRef.current = engineConfig
        if (options?.startAtViewportStart) {
          readerRef.current?.startTts(engineConfig, fromLocator, {
            startAtViewportStart: true,
          })
        } else {
          readerRef.current?.startTts(engineConfig, fromLocator)
        }
      } catch (error) {
        if (generationRef.current !== generation) return
        reportError(describeError(error))
      }
    },
    [
      abortOutstandingSynthesis,
      enabled,
      highlightColor,
      language,
      publicationKey,
      readerRef,
      reportError,
    ],
  )

  const seek = useCallback(
    (
      fromLocator: Locator,
      options?: {
        pauseAfterStart?: boolean
        startAtViewportStart?: boolean
      },
    ) => {
      const engineConfig = activeEngineConfigRef.current
      if (!engineConfig) {
        void start(fromLocator, options)
        return
      }

      generationRef.current += 1
      pauseAfterStartRef.current = options?.pauseAfterStart === true
      terminalErrorRef.current = false
      playbackStartedRef.current = false
      abortOutstandingSynthesis()
      setRemote(engineConfig.kind === "provider")
      setSessionState({ publicationKey, state: { state: "loading" } })
      if (options?.startAtViewportStart) {
        readerRef.current?.startTts(engineConfig, fromLocator, {
          startAtViewportStart: true,
        })
      } else {
        readerRef.current?.startTts(engineConfig, fromLocator)
      }
    },
    [abortOutstandingSynthesis, publicationKey, readerRef, start],
  )

  const handleStateChange = useCallback(
    (next: TtsPlaybackState) => {
      if (terminalErrorRef.current) return
      if (next.state === "error") {
        reportError(next.error)
        return
      }
      if (next.state === "ended" && !playbackStartedRef.current) {
        reportError(READER_TTS_NO_READABLE_CONTENT_ERROR)
        return
      }
      if (next.state === "playing" || next.state === "paused") {
        playbackStartedRef.current = true
      }
      if (next.state === "stopped" || next.state === "ended") {
        pauseAfterStartRef.current = false
        abortOutstandingSynthesis()
      }
      setSessionState({
        publicationKey,
        state: next.state === "stopped" ? null : next,
      })
      if (next.state === "playing" && pauseAfterStartRef.current) {
        pauseAfterStartRef.current = false
        readerRef.current?.pauseTts()
      }
    },
    [abortOutstandingSynthesis, publicationKey, readerRef, reportError],
  )

  const handleSynthesisRequest = useCallback(
    async (request: TtsSynthesisRequestEvent) => {
      const generation = generationRef.current
      synthesisControllersRef.current.get(request.requestId)?.abort()
      const controller = new AbortController()
      synthesisControllersRef.current.set(request.requestId, controller)
      try {
        const artifact = await synthesizeTts(
          buildReaderTtsSynthesisRequest(request, REMOTE_AUDIO_MIME_TYPES),
          { signal: controller.signal },
        )
        if (generationRef.current !== generation || controller.signal.aborted)
          return
        readerRef.current?.completeTtsSynthesis({
          requestId: request.requestId,
          path: artifact.path,
          mimeType: artifact.mimeType,
          timings: artifact.timings,
        })
      } catch (error) {
        if (
          generationRef.current !== generation ||
          controller.signal.aborted ||
          (error instanceof Error && error.name === "AbortError")
        )
          return
        readerRef.current?.completeTtsSynthesis({
          requestId: request.requestId,
          error: describeError(error),
        })
      } finally {
        if (
          synthesisControllersRef.current.get(request.requestId) === controller
        ) {
          synthesisControllersRef.current.delete(request.requestId)
        }
      }
    },
    [readerRef],
  )

  const handleSynthesisCancel = useCallback(
    ({ requestIds }: TtsSynthesisCancelEvent) => {
      requestIds.forEach((requestId) => {
        const controller = synthesisControllersRef.current.get(requestId)
        controller?.abort()
        synthesisControllersRef.current.delete(requestId)
      })
    },
    [],
  )

  const play = useCallback(() => readerRef.current?.playTts(), [readerRef])
  const pause = useCallback(() => readerRef.current?.pauseTts(), [readerRef])
  const previous = useCallback(
    () => readerRef.current?.previousTts(),
    [readerRef],
  )
  const next = useCallback(() => readerRef.current?.nextTts(), [readerRef])

  return {
    state,
    remote,
    start,
    seek,
    play,
    pause,
    previous,
    next,
    stop,
    handleStateChange,
    handleSynthesisRequest,
    handleSynthesisCancel,
  }
}
