import type {
  Locator,
  TtsPlaybackState,
  TtsSynthesisCancelEvent,
  TtsSynthesisRequestEvent,
} from "@my-reader/readium"
import {
  createReaderTtsSessionMachine,
  type ReaderTtsSessionTransition,
} from "@my-reader/tools/reader-tts-session"
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
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

export const READER_TTS_VOICES_EMPTY_ERROR = "TTS_VOICES_EMPTY"

async function loadSessionConfig(language: string, isCurrent: () => boolean) {
  let config = await getTtsConfig()
  if (!isCurrent()) return null
  let selection = resolveReaderTtsSelection(config, language)

  if (selection.kind === "provider" && !selection.voiceId) {
    const voices = await listTtsVoices(selection.profile.id)
    if (!isCurrent()) return null
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

  return isCurrent() ? { config, selection } : null
}

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
  const [viewportState, setViewportState] = useState<{
    publicationKey: string
    detached: boolean
    originLocator?: Locator
  }>({
    publicationKey,
    detached: false,
  })
  const viewportDetached =
    viewportState.publicationKey === publicationKey
      ? viewportState.detached
      : false
  const viewportOriginLocator =
    viewportState.publicationKey === publicationKey && viewportState.detached
      ? viewportState.originLocator
      : undefined
  const [remote, setRemote] = useState(false)
  const viewportRevisionRef = useRef(0)
  const viewportNavigationIdRef = useRef<string | null>(null)
  const viewportReattachAttemptRef = useRef<{
    navigationId: string
    retryRequested: boolean
  } | null>(null)
  const sessionMachine = useMemo(
    () => createReaderTtsSessionMachine(publicationKey),
    [publicationKey],
  )
  const activeEngineConfigRef = useRef<ReturnType<
    typeof buildReaderTtsEngineConfig
  > | null>(null)
  const activeLocatorRef = useRef<{
    sessionId: string
    locator: Locator
  } | null>(null)
  const synthesisControllersRef = useRef(new Map<string, AbortController>())

  const abortOutstandingSynthesis = useCallback(() => {
    synthesisControllersRef.current.forEach((controller) => {
      controller.abort()
    })
    synthesisControllersRef.current.clear()
  }, [])

  const syncViewportState = useCallback(
    (transition: ReaderTtsSessionTransition, originLocator?: Locator) => {
      if (!transition.accepted) return
      setViewportState((current) => {
        const detached = transition.snapshot.viewportDetached
        return {
          publicationKey,
          detached,
          originLocator: detached
            ? current.publicationKey === publicationKey && current.detached
              ? current.originLocator
              : originLocator
            : undefined,
        }
      })
    },
    [publicationKey],
  )

  const stop = useCallback(() => {
    const transition = sessionMachine.send({ type: "stop" })
    syncViewportState(transition)
    activeEngineConfigRef.current = null
    activeLocatorRef.current = null
    viewportRevisionRef.current += 1
    viewportNavigationIdRef.current = null
    viewportReattachAttemptRef.current = null
    abortOutstandingSynthesis()
    readerRef.current?.stopTts()
    setRemote(false)
    setSessionState({ publicationKey, state: null })
  }, [
    abortOutstandingSynthesis,
    publicationKey,
    readerRef,
    sessionMachine,
    syncViewportState,
  ])

  useEffect(() => {
    const activeReader = readerRef.current
    return () => {
      sessionMachine.send({ type: "stop" })
      activeEngineConfigRef.current = null
      activeLocatorRef.current = null
      viewportRevisionRef.current += 1
      viewportNavigationIdRef.current = null
      viewportReattachAttemptRef.current = null
      abortOutstandingSynthesis()
      activeReader?.stopTts()
    }
  }, [abortOutstandingSynthesis, readerRef, sessionMachine])

  const presentTransitionError = useCallback(
    (sessionId: string, transition: ReaderTtsSessionTransition) => {
      if (transition.effect?.type !== "report-error") return
      syncViewportState(transition)
      abortOutstandingSynthesis()
      viewportNavigationIdRef.current = null
      viewportReattachAttemptRef.current = null
      setSessionState({
        publicationKey,
        state: {
          sessionId,
          state: "error",
          error: transition.effect.error,
        },
      })
      onError?.(transition.effect.error)
    },
    [abortOutstandingSynthesis, onError, publicationKey, syncViewportState],
  )

  const start = useCallback(
    async (
      fromLocator?: Locator,
      options?: {
        navigationId?: string
        pauseAfterStart?: boolean
        startAtViewportStart?: boolean
      },
    ) => {
      if (!enabled) return
      const transition = sessionMachine.send({
        type: "begin",
        navigationId: options?.navigationId,
        pauseAfterStart: options?.pauseAfterStart,
      })
      if (!transition.accepted || !transition.snapshot.sessionId) return
      syncViewportState(transition)
      viewportNavigationIdRef.current = null
      viewportReattachAttemptRef.current = null
      const { generation, sessionId } = transition.snapshot
      const isCurrentSession = () =>
        sessionMachine.snapshot.generation === generation &&
        sessionMachine.snapshot.sessionId === sessionId
      activeEngineConfigRef.current = null
      activeLocatorRef.current = null
      abortOutstandingSynthesis()
      setRemote(false)
      setSessionState({
        publicationKey,
        state: { sessionId, state: "loading" },
      })

      try {
        const resolved = await loadSessionConfig(language, isCurrentSession)
        if (!resolved) return
        if (!isCurrentSession()) return
        const { config, selection } = resolved
        const current = sessionMachine.snapshot
        setRemote(selection.kind === "provider")
        const engineConfig = buildReaderTtsEngineConfig(
          config,
          selection,
          language,
          highlightColor,
        )
        activeEngineConfigRef.current = engineConfig
        const viewportDetached = current.viewportDetached
        const viewportNavigationId = viewportNavigationIdRef.current
        const reader = readerRef.current
        if (!reader) throw new Error("TTS_READER_VIEW_UNAVAILABLE")
        await reader.startTts(engineConfig, fromLocator, {
          sessionId,
          startAtViewportStart:
            options?.startAtViewportStart === true && !viewportDetached,
          ...(viewportDetached
            ? {
                viewportDetached: true,
                ...(viewportNavigationId ? { viewportNavigationId } : {}),
              }
            : {}),
        })
      } catch (error) {
        if (!isCurrentSession()) return
        const failed = sessionMachine.send({
          type: "playback",
          sessionId,
          status: "error",
          error: describeError(error),
        })
        presentTransitionError(sessionId, failed)
      }
    },
    [
      abortOutstandingSynthesis,
      enabled,
      highlightColor,
      language,
      publicationKey,
      readerRef,
      presentTransitionError,
      sessionMachine,
      syncViewportState,
    ],
  )

  const seek = useCallback(
    async (
      fromLocator: Locator,
      options?: {
        navigationId?: string
        pauseAfterStart?: boolean
        startAtViewportStart?: boolean
      },
    ) => {
      const engineConfig = activeEngineConfigRef.current
      if (!engineConfig) {
        void start(fromLocator, options)
        return
      }

      const transition = sessionMachine.send({
        type: "begin",
        navigationId: options?.navigationId,
        pauseAfterStart: options?.pauseAfterStart,
      })
      if (!transition.accepted || !transition.snapshot.sessionId) return
      syncViewportState(transition)
      viewportNavigationIdRef.current = null
      viewportReattachAttemptRef.current = null
      const { sessionId } = transition.snapshot
      activeLocatorRef.current = null
      abortOutstandingSynthesis()
      setRemote(engineConfig.kind === "provider")
      setSessionState({
        publicationKey,
        state: { sessionId, state: "loading" },
      })
      try {
        const reader = readerRef.current
        if (!reader) throw new Error("TTS_READER_VIEW_UNAVAILABLE")
        await reader.startTts(engineConfig, fromLocator, {
          sessionId,
          startAtViewportStart: options?.startAtViewportStart === true,
        })
      } catch (error) {
        const current = sessionMachine.snapshot
        if (current.sessionId !== sessionId) return
        const failed = sessionMachine.send({
          type: "playback",
          sessionId,
          status: "error",
          error: describeError(error),
        })
        presentTransitionError(sessionId, failed)
      }
    },
    [
      abortOutstandingSynthesis,
      publicationKey,
      readerRef,
      presentTransitionError,
      sessionMachine,
      start,
      syncViewportState,
    ],
  )

  const reattachViewportIfVisible = useCallback(
    async (
      sessionId: string,
      viewportNavigationId: string,
      viewportRevision: number,
    ) => {
      const active = sessionMachine.snapshot
      if (
        active.sessionId !== sessionId ||
        !active.viewportDetached ||
        viewportNavigationIdRef.current !== viewportNavigationId ||
        viewportRevisionRef.current !== viewportRevision
      )
        return

      const pendingAttempt = viewportReattachAttemptRef.current
      if (pendingAttempt?.navigationId === viewportNavigationId) {
        pendingAttempt.retryRequested = true
        return
      }

      const attempt = {
        navigationId: viewportNavigationId,
        retryRequested: false,
      }
      viewportReattachAttemptRef.current = attempt
      try {
        do {
          attempt.retryRequested = false
          let reattached = false
          try {
            reattached =
              (await readerRef.current?.reattachTtsViewport(
                sessionId,
                viewportNavigationId,
              )) ?? false
          } catch {
            return
          }
          const current = sessionMachine.snapshot
          if (
            current.sessionId !== sessionId ||
            !current.viewportDetached ||
            viewportNavigationIdRef.current !== viewportNavigationId ||
            viewportRevisionRef.current !== viewportRevision
          )
            return
          if (reattached) {
            viewportNavigationIdRef.current = null
            const transition = sessionMachine.send({
              type: "viewport-matched",
              sessionId,
            })
            syncViewportState(transition)
            return
          }
        } while (attempt.retryRequested)
      } finally {
        if (viewportReattachAttemptRef.current === attempt) {
          viewportReattachAttemptRef.current = null
        }
      }
    },
    [readerRef, sessionMachine, syncViewportState],
  )

  const markViewportMoved = useCallback(
    (navigationId: string, originLocator?: Locator) => {
      if (
        sessionMachine.snapshot.viewportDetached &&
        viewportNavigationIdRef.current === navigationId
      ) {
        const activeLocator = activeLocatorRef.current
        if (activeLocator?.sessionId === sessionMachine.snapshot.sessionId) {
          void reattachViewportIfVisible(
            activeLocator.sessionId,
            navigationId,
            viewportRevisionRef.current,
          )
        }
        return
      }

      const viewportRevision = ++viewportRevisionRef.current
      const wasViewportDetached = sessionMachine.snapshot.viewportDetached
      const transition = sessionMachine.send({
        type: "viewport-moved",
        navigationId,
      })
      syncViewportState(transition, originLocator)
      if (transition.accepted) viewportNavigationIdRef.current = navigationId
      const activeLocator = activeLocatorRef.current
      if (
        transition.accepted &&
        wasViewportDetached &&
        activeLocator?.sessionId === transition.snapshot.sessionId
      ) {
        void reattachViewportIfVisible(
          activeLocator.sessionId,
          navigationId,
          viewportRevision,
        )
      }
    },
    [reattachViewportIfVisible, sessionMachine, syncViewportState],
  )

  const returnToPlaybackPosition = useCallback(async () => {
    const active = sessionMachine.snapshot
    const activeLocator = activeLocatorRef.current
    const viewportNavigationId = viewportNavigationIdRef.current
    if (
      !active.sessionId ||
      !active.viewportDetached ||
      activeLocator?.sessionId !== active.sessionId ||
      !viewportNavigationId
    )
      return

    const viewportRevision = ++viewportRevisionRef.current
    const matched = sessionMachine.send({
      type: "viewport-matched",
      sessionId: active.sessionId,
    })
    if (!matched.accepted) return
    viewportNavigationIdRef.current = null
    syncViewportState(matched)

    let returned = false
    try {
      returned =
        (await readerRef.current?.returnToTtsPosition(
          active.sessionId,
          viewportNavigationId,
        )) ?? false
    } catch {
      returned = false
    }

    const current = sessionMachine.snapshot
    if (
      returned ||
      current.sessionId !== active.sessionId ||
      current.viewportDetached ||
      viewportRevisionRef.current !== viewportRevision
    )
      return

    const restored = sessionMachine.send({
      type: "viewport-moved",
      navigationId: viewportNavigationId,
    })
    if (restored.accepted) {
      viewportNavigationIdRef.current = viewportNavigationId
      syncViewportState(restored)
    }
  }, [readerRef, sessionMachine, syncViewportState])

  const handleStateChange = useCallback(
    (next: TtsPlaybackState) => {
      const transition = sessionMachine.send({
        type: "playback",
        sessionId: next.sessionId,
        status: next.state,
        error: next.error,
      })
      if (!transition.accepted) return
      syncViewportState(transition)
      if (transition.effect?.type === "report-error") {
        activeLocatorRef.current = null
        viewportNavigationIdRef.current = null
        presentTransitionError(next.sessionId, transition)
        return
      }
      if (next.state === "stopped" || next.state === "ended") {
        activeLocatorRef.current = null
        viewportNavigationIdRef.current = null
        abortOutstandingSynthesis()
      } else if (next.locator) {
        activeLocatorRef.current = {
          sessionId: next.sessionId,
          locator: next.locator,
        }
      }
      setSessionState({
        publicationKey,
        state: next.state === "stopped" ? null : next,
      })
      if (transition.effect?.type === "pause") {
        readerRef.current?.pauseTts()
      }
      if (transition.snapshot.viewportDetached && next.locator) {
        const viewportNavigationId = viewportNavigationIdRef.current
        if (!viewportNavigationId) return
        void reattachViewportIfVisible(
          next.sessionId,
          viewportNavigationId,
          viewportRevisionRef.current,
        )
      }
    },
    [
      abortOutstandingSynthesis,
      presentTransitionError,
      publicationKey,
      reattachViewportIfVisible,
      readerRef,
      sessionMachine,
      syncViewportState,
    ],
  )

  const handleSynthesisRequest = useCallback(
    async (request: TtsSynthesisRequestEvent) => {
      const active = sessionMachine.snapshot
      if (request.sessionId !== active.sessionId) return
      const { generation } = active
      synthesisControllersRef.current.get(request.requestId)?.abort()
      const controller = new AbortController()
      synthesisControllersRef.current.set(request.requestId, controller)
      try {
        const artifact = await synthesizeTts(
          buildReaderTtsSynthesisRequest(request, REMOTE_AUDIO_MIME_TYPES),
          { signal: controller.signal },
        )
        const current = sessionMachine.snapshot
        if (
          current.generation !== generation ||
          current.sessionId !== request.sessionId ||
          controller.signal.aborted
        )
          return
        readerRef.current?.completeTtsSynthesis({
          sessionId: request.sessionId,
          requestId: request.requestId,
          path: artifact.path,
          mimeType: artifact.mimeType,
          timings: artifact.timings,
          playbackRate: artifact.playbackRate,
        })
      } catch (error) {
        if (
          sessionMachine.snapshot.generation !== generation ||
          sessionMachine.snapshot.sessionId !== request.sessionId ||
          controller.signal.aborted ||
          (error instanceof Error && error.name === "AbortError")
        )
          return
        readerRef.current?.completeTtsSynthesis({
          sessionId: request.sessionId,
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
    [readerRef, sessionMachine],
  )

  const handleSynthesisCancel = useCallback(
    ({ sessionId, requestIds }: TtsSynthesisCancelEvent) => {
      if (sessionId !== sessionMachine.snapshot.sessionId) return
      requestIds.forEach((requestId) => {
        const controller = synthesisControllersRef.current.get(requestId)
        controller?.abort()
        synthesisControllersRef.current.delete(requestId)
      })
    },
    [sessionMachine],
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
    viewportDetached,
    viewportOriginLocator,
    start,
    seek,
    markViewportMoved,
    returnToPlaybackPosition,
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
