import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import {
  chooseTtsVoiceForLanguage,
  filterTtsVoicesForLanguage,
  normalizeTtsLanguage,
} from "@my-reader/tools/reader-tts-language"
import {
  createReaderTtsSessionMachine,
  type ReaderTtsSessionStatus,
  type ReaderTtsSessionTransition,
} from "@my-reader/tools/reader-tts-session"
import type { EpubNavigator } from "@readium/navigator"
import type { Locator } from "@readium/shared"
import {
  ReadiumSpeechNavigator,
  type ReadiumSpeechVoice,
  SpeechPreferences,
  WebSpeechEngine,
} from "@readium/speech"
import { listen } from "@tauri-apps/api/event"
import {
  type RefObject,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react"
import type { EpubTextResource } from "@/lib/readium/epubContentLocators"
import {
  type EpubTtsUtterance,
  epubTtsCompleteUtteranceIndexAtViewportStart,
  epubTtsUtteranceAtPoint,
  epubTtsUtteranceIndexAtLocator,
  extractEpubTtsUtterances,
} from "@/lib/readium/epubTts"
import {
  applyEpubTtsHighlight,
  clearEpubTtsHighlight,
} from "@/lib/readium/epubTtsHighlight"
import { api, formatApiError } from "@/lib/tauri-api"
import type {
  TtsConfigDto,
  TtsPlaybackPreferencesDto,
  TtsVoiceRefDto,
} from "@/lib/tauri-specta"
import { CoreSpeechEngine } from "@/lib/tts/CoreSpeechEngine"
import {
  notifyTtsConfigChanged,
  TTS_CONFIG_CHANGED_EVENT,
  type TtsConfigChangedPayload,
} from "@/lib/tts/events"

type UseEpubTtsSessionOptions = {
  enabled: boolean
  navigatorRef: RefObject<EpubNavigator | null>
  resources: EpubTextResource[]
  positions: ReaderLocator[]
  currentLocator: Locator | null
  language: string
  highlightTint: string
}

export type EpubTtsSession = {
  available: boolean
  loading: boolean
  state: ReaderTtsSessionStatus
  viewportDetached: boolean
  remote: boolean
  engineName: string
  utteranceCount: number
  currentUtterance: EpubTtsUtterance | null
  voices: ReadiumSpeechVoice[]
  currentVoiceId: string
  speed: number
  error: string | null
  play: () => void
  pause: () => void
  stop: () => void
  previous: () => void
  next: () => void
  readFrom: (locator: Locator) => void
  readAtPoint: (
    resourceHref: string,
    document: Document,
    point: { x: number; y: number },
  ) => boolean
  rebase: (
    locator: Locator,
    options?: {
      autoplay?: boolean
      forceRestart?: boolean
      navigationId?: string
      skipPartialViewportSentence?: boolean
    },
  ) => void
  markViewportMoved: (navigationId: string) => void
  goToCurrent: () => void
  setVoice: (voiceId: string) => void
  setSpeed: (speed: number) => void
}

function finitePreference(value: number | null, fallback: number): number {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback
}

function voiceId(voice: ReadiumSpeechVoice): string {
  return voice.identifier ?? voice.voiceURI ?? voice.originalName ?? voice.name
}

function isLocatorVisibleInViewport(
  navigator: EpubNavigator,
  locator: Locator,
): boolean {
  const href = locator.href.split("#")[0]
  const range = navigator.viewport?.progressions.get(href)
  const progression = locator.locations.progression
  return Boolean(
    range &&
      typeof progression === "number" &&
      progression >= range.start - 0.0001 &&
      progression <= range.end + 0.0001,
  )
}

function configuredVoice(
  config: TtsConfigDto,
  language: string,
): TtsVoiceRefDto | undefined {
  const requested = normalizeTtsLanguage(language)
  const exact = Object.entries(config.voiceByLanguage).find(
    ([key]) => normalizeTtsLanguage(key) === requested,
  )?.[1]
  if (exact) return exact
  const base = requested.split("-")[0]
  const baseMatch = Object.entries(config.voiceByLanguage).find(
    ([key]) => normalizeTtsLanguage(key).split("-")[0] === base,
  )?.[1]
  if (baseMatch) return baseMatch
  return Object.entries(config.voiceByLanguage).find(
    ([key]) => normalizeTtsLanguage(key) === "und",
  )?.[1]
}

export function useEpubTtsSession({
  enabled,
  navigatorRef,
  resources,
  positions,
  currentLocator,
  language,
  highlightTint,
}: UseEpubTtsSessionOptions): EpubTtsSession {
  const [config, setConfig] = useState<TtsConfigDto | null>(null)
  const [loading, setLoading] = useState(enabled)
  const [state, setState] = useState<ReaderTtsSessionStatus>("idle")
  const [viewportDetached, setViewportDetached] = useState(false)
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)
  const [voices, setVoices] = useState<ReadiumSpeechVoice[]>([])
  const [currentVoiceId, setCurrentVoiceId] = useState("")
  const [speed, setSpeedState] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const speechRef = useRef<ReadiumSpeechNavigator | null>(null)
  const configRef = useRef<TtsConfigDto | null>(null)
  const utterancesRef = useRef<EpubTtsUtterance[]>([])
  const currentLocatorRef = useRef<Locator | null>(currentLocator)
  const restartAfterConfigRef = useRef<{
    locator: Locator
    autoplay: boolean
  } | null>(null)
  const configRefreshRevisionRef = useRef(0)
  const highlightRevisionRef = useRef(0)
  const suppressNextFollowRef = useRef(false)
  const sourceRef = useRef(
    `reader-${globalThis.crypto?.randomUUID?.() ?? Math.random().toString(36)}`,
  )
  const sessionMachineRef = useRef<ReturnType<
    typeof createReaderTtsSessionMachine
  > | null>(null)
  sessionMachineRef.current ??= createReaderTtsSessionMachine(sourceRef.current)
  const speechSessionsRef = useRef(
    new WeakMap<ReadiumSpeechNavigator, string>(),
  )

  const utterances = useMemo(
    () =>
      enabled && config
        ? extractEpubTtsUtterances(resources, positions, {
            fallbackLanguage: normalizeTtsLanguage(language) || undefined,
            skipPageBreaks: config.playback.skipPageBreaks,
            skipFootnotes: config.playback.skipFootnotes,
          })
        : [],
    [config, enabled, language, positions, resources],
  )
  utterancesRef.current = utterances
  currentLocatorRef.current = currentLocator

  const beginSession = useCallback(
    (options?: { navigationId?: string; pauseAfterStart?: boolean }) => {
      const speech = speechRef.current
      if (!speech) return null
      const transition = sessionMachineRef.current!.send({
        type: "begin",
        navigationId: options?.navigationId,
        pauseAfterStart: options?.pauseAfterStart,
      })
      if (!transition.accepted || !transition.snapshot.sessionId) return null
      speechSessionsRef.current.set(speech, transition.snapshot.sessionId)
      setState("loading")
      setViewportDetached(transition.snapshot.viewportDetached)
      return transition.snapshot.sessionId
    },
    [],
  )

  const reattachViewportIfVisible = useCallback(
    (locator: Locator) => {
      const machine = sessionMachineRef.current!
      const { sessionId, viewportDetached } = machine.snapshot
      const navigator = navigatorRef.current
      if (
        !sessionId ||
        !viewportDetached ||
        !navigator ||
        !isLocatorVisibleInViewport(navigator, locator)
      ) {
        return false
      }
      const transition = machine.send({
        type: "viewport-matched",
        sessionId,
      })
      if (transition.accepted) {
        setViewportDetached(transition.snapshot.viewportDetached)
      }
      return transition.accepted
    },
    [navigatorRef],
  )

  const captureActiveRestart = useCallback(() => {
    const speech = speechRef.current
    const activeState =
      speech?.getState() ?? sessionMachineRef.current!.snapshot.status
    if (
      !sessionMachineRef.current?.snapshot.sessionId ||
      (activeState !== "playing" &&
        activeState !== "loading" &&
        activeState !== "paused")
    )
      return false
    const currentId = speech?.getCurrentContent()?.id
    const utterance = currentId
      ? utterancesRef.current.find((candidate) => candidate.id === currentId)
      : undefined
    const locator = utterance?.locator ?? currentLocatorRef.current
    restartAfterConfigRef.current = locator
      ? { locator, autoplay: activeState !== "paused" }
      : null
    return Boolean(restartAfterConfigRef.current)
  }, [])

  const refreshConfig = useCallback(async () => {
    if (!enabled) return
    const revision = ++configRefreshRevisionRef.current
    captureActiveRestart()
    setLoading(true)
    try {
      const next = await api.getTtsConfig()
      if (revision !== configRefreshRevisionRef.current) return
      configRef.current = next
      setConfig(next)
      setSpeedState(finitePreference(next.playback.speed, 1))
      setError(null)
    } catch (refreshError: unknown) {
      if (revision === configRefreshRevisionRef.current) {
        setError(formatApiError(refreshError))
      }
    } finally {
      if (revision === configRefreshRevisionRef.current) setLoading(false)
    }
  }, [captureActiveRestart, enabled])

  useEffect(() => {
    if (!enabled) {
      configRefreshRevisionRef.current += 1
      configRef.current = null
      setConfig(null)
      setLoading(false)
      return
    }
    void refreshConfig()
    let disposed = false
    let unlisten: (() => void) | undefined
    void listen<TtsConfigChangedPayload>(TTS_CONFIG_CHANGED_EVENT, (event) => {
      if (event.payload.source === sourceRef.current) return
      void refreshConfig()
    }).then((cleanup) => {
      if (disposed) cleanup()
      else unlisten = cleanup
    })
    return () => {
      disposed = true
      unlisten?.()
    }
  }, [enabled, refreshConfig])

  const showUtterance = useCallback(
    (index: number, followText = true) => {
      const utterance = utterances[index]
      const navigator = navigatorRef.current
      if (!utterance || !navigator) return
      const highlightRevision = ++highlightRevisionRef.current
      setCurrentIndex(index)
      applyEpubTtsHighlight(navigator, utterance.locator, highlightTint)
      if (followText) {
        navigator.go(utterance.locator, false, () => {
          window.requestAnimationFrame(() => {
            if (
              navigatorRef.current === navigator &&
              highlightRevisionRef.current === highlightRevision
            ) {
              applyEpubTtsHighlight(navigator, utterance.locator, highlightTint)
            }
          })
        })
      }
    },
    [highlightTint, navigatorRef, utterances],
  )

  useEffect(() => {
    const activeConfig = config
    if (!enabled || !activeConfig || utterances.length === 0) return

    const configuredEngine = activeConfig.defaultEngine
    const provider =
      configuredEngine.kind === "provider"
        ? activeConfig.profiles.find(
            (profile) =>
              profile.id === configuredEngine.profileId && profile.enabled,
          )
        : undefined
    const engine = provider
      ? new CoreSpeechEngine(provider.id)
      : new WebSpeechEngine()
    const speech = new ReadiumSpeechNavigator(engine, {
      preferences: {
        rate: finitePreference(activeConfig.playback.speed, 1),
        pitch: finitePreference(activeConfig.playback.pitch, 1),
        pauseDuration: 80,
      },
    })
    speech.setSpeakInContentLanguage(true)
    speechRef.current = speech
    setState("loading")
    setCurrentIndex(null)
    setVoices([])
    setCurrentVoiceId("")
    setError(null)

    const currentSpeechIndex = () => {
      const id = speech.getCurrentContent()?.id
      return id ? utterances.findIndex((utterance) => utterance.id === id) : -1
    }
    const syncCurrent = () => {
      const sessionId = speechSessionsRef.current.get(speech)
      if (
        !sessionId ||
        sessionId !== sessionMachineRef.current!.snapshot.sessionId
      )
        return
      const index = currentSpeechIndex()
      if (index >= 0) {
        const utterance = utterances[index]
        const viewportWasDetached =
          sessionMachineRef.current!.snapshot.viewportDetached
        if (viewportWasDetached && utterance) {
          reattachViewportIfVisible(utterance.locator)
        }
        const followText =
          !suppressNextFollowRef.current && !viewportWasDetached
        suppressNextFollowRef.current = false
        showUtterance(index, followText)
      }
    }
    const applyPlayback = (
      status:
        | "loading"
        | "ready"
        | "playing"
        | "paused"
        | "ended"
        | "error"
        | "stopped",
      error?: string,
    ): ReaderTtsSessionTransition | null => {
      const sessionId = speechSessionsRef.current.get(speech)
      if (!sessionId) {
        if (status === "loading" || status === "ready") setState(status)
        if (status === "error") {
          setError(error || "TTS_PLAYBACK_FAILED")
          setState("error")
        }
        return null
      }
      const transition = sessionMachineRef.current!.send({
        type: "playback",
        sessionId,
        status,
        error,
      })
      if (!transition.accepted) return null
      setViewportDetached(transition.snapshot.viewportDetached)
      if (transition.effect?.type === "report-error") {
        setError(transition.effect.error)
      }
      setState(transition.snapshot.status)
      if (transition.effect?.type === "pause") speech.pause()
      return transition
    }
    const restartIfNeeded = () => {
      const restart = restartAfterConfigRef.current
      if (!restart || speechRef.current !== speech) return
      restartAfterConfigRef.current = null
      const index = epubTtsUtteranceIndexAtLocator(utterances, restart.locator)
      if (index < 0) return
      const sessionId = beginSession({
        pauseAfterStart: !restart.autoplay,
      })
      if (!sessionId) return
      showUtterance(index)
      if (!speech.jumpTo(index, true)) speech.play()
    }
    const unsubscribers = [
      speech.on("loading", () => applyPlayback("loading")),
      speech.on("ready", () => applyPlayback("ready")),
      speech.on("start", () => {
        if (applyPlayback("playing")) syncCurrent()
      }),
      speech.on("pause", () => applyPlayback("paused")),
      speech.on("resume", () => {
        if (applyPlayback("playing")) syncCurrent()
      }),
      speech.on("skip", () => {
        const nextState = speech.getState()
        if (
          nextState !== "idle" &&
          applyPlayback(nextState) &&
          (nextState === "playing" || nextState === "paused")
        ) {
          syncCurrent()
        }
      }),
      speech.on("end", () => {
        const nextState = speech.getState()
        applyPlayback(nextState === "idle" ? "ended" : nextState)
      }),
      speech.on("stop", () => {
        applyPlayback("stopped")
      }),
      speech.on("error", (event) => {
        const message = event.detail?.message
        applyPlayback(
          "error",
          typeof message === "string" ? message : "TTS_PLAYBACK_FAILED",
        )
      }),
    ]

    speech.loadContent(utterances)
    void speech
      .getVoices()
      .then((availableVoices) => {
        if (speechRef.current !== speech) return
        const publicationVoices = filterTtsVoicesForLanguage(
          availableVoices,
          language,
        )
        setVoices(publicationVoices)
        const preference = configuredVoice(activeConfig, language)
        const preferredId =
          preference?.engine === "system" && !provider
            ? preference.voiceId
            : preference?.engine === "provider" &&
                provider?.id === preference.profileId
              ? preference.voiceId
              : undefined
        const voice =
          publicationVoices.find(
            (candidate) => voiceId(candidate) === preferredId,
          ) ?? chooseTtsVoiceForLanguage(availableVoices, language)
        if (voice) {
          speech.setVoice(voice)
          setCurrentVoiceId(voiceId(voice))
        }
        restartIfNeeded()
      })
      .catch((voiceError: unknown) => {
        if (speechRef.current === speech) {
          setError(formatApiError(voiceError))
          restartIfNeeded()
        }
      })
    return () => {
      unsubscribers.forEach((unsubscribe) => {
        unsubscribe()
      })
      highlightRevisionRef.current += 1
      suppressNextFollowRef.current = false
      speechSessionsRef.current.delete(speech)
      if (speechRef.current === speech) speechRef.current = null
      void speech.destroy()
      const navigator = navigatorRef.current
      if (navigator) clearEpubTtsHighlight(navigator)
    }
  }, [
    beginSession,
    config,
    enabled,
    language,
    navigatorRef,
    reattachViewportIfVisible,
    showUtterance,
    utterances,
  ])

  const play = useCallback(() => {
    const speech = speechRef.current
    if (!speech) return
    setError(null)
    if (sessionMachineRef.current!.snapshot.sessionId) {
      speech.play()
      return
    }
    if (!beginSession()) return
    const locator = currentLocator ?? navigatorRef.current?.currentLocator
    if (locator) {
      const index = epubTtsUtteranceIndexAtLocator(utterances, locator)
      const currentId = speech.getCurrentContent()?.id
      if (index >= 0 && utterances[index]?.id !== currentId) {
        showUtterance(index, false)
        if (!speech.jumpTo(index, true)) speech.play()
        return
      }
    }
    speech.play()
  }, [beginSession, currentLocator, navigatorRef, showUtterance, utterances])

  const pause = useCallback(() => speechRef.current?.pause(), [])

  const stop = useCallback(() => {
    const highlightRevision = ++highlightRevisionRef.current
    restartAfterConfigRef.current = null
    suppressNextFollowRef.current = false
    const transition = sessionMachineRef.current!.send({ type: "stop" })
    const speech = speechRef.current
    if (speech) speechSessionsRef.current.delete(speech)
    speech?.stop()
    setState("idle")
    setViewportDetached(transition.snapshot.viewportDetached)
    setCurrentIndex(null)
    const navigator = navigatorRef.current
    if (navigator) {
      clearEpubTtsHighlight(navigator)
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (
            !sessionMachineRef.current!.snapshot.sessionId &&
            highlightRevisionRef.current === highlightRevision &&
            navigatorRef.current === navigator
          ) {
            clearEpubTtsHighlight(navigator)
          }
        })
      })
    }
  }, [navigatorRef])

  const previous = useCallback(() => {
    speechRef.current?.previous()
  }, [])

  const next = useCallback(() => {
    speechRef.current?.next()
  }, [])

  const markViewportMoved = useCallback(
    (navigationId: string) => {
      const wasViewportDetached =
        sessionMachineRef.current!.snapshot.viewportDetached
      const transition = sessionMachineRef.current!.send({
        type: "viewport-moved",
        navigationId,
      })
      if (transition.accepted) {
        setViewportDetached(transition.snapshot.viewportDetached)
        const currentId = speechRef.current?.getCurrentContent()?.id
        const locator = currentId
          ? utterancesRef.current.find(
              (utterance) => utterance.id === currentId,
            )?.locator
          : undefined
        if (wasViewportDetached && locator) {
          reattachViewportIfVisible(locator)
        }
      }
    },
    [reattachViewportIfVisible],
  )

  const readFrom = useCallback(
    (locator: Locator) => {
      const speech = speechRef.current
      if (!speech) return
      const index = epubTtsUtteranceIndexAtLocator(utterances, locator)
      if (index < 0) return
      const currentId = speech.getCurrentContent()?.id
      const sessionId = beginSession()
      if (!sessionId) return
      if (utterances[index]?.id === currentId) {
        speechSessionsRef.current.delete(speech)
        speech.stop()
        speechSessionsRef.current.set(speech, sessionId)
      }
      showUtterance(index, false)
      suppressNextFollowRef.current = true
      if (!speech.jumpTo(index, true)) speech.play()
    },
    [beginSession, showUtterance, utterances],
  )

  const rebase = useCallback(
    (
      locator: Locator,
      options?: {
        autoplay?: boolean
        forceRestart?: boolean
        navigationId?: string
        skipPartialViewportSentence?: boolean
      },
    ) => {
      const speech = speechRef.current
      const activeState = sessionMachineRef.current!.snapshot.status
      if (
        !speech ||
        !sessionMachineRef.current!.snapshot.sessionId ||
        (activeState !== "loading" &&
          activeState !== "playing" &&
          activeState !== "paused")
      )
        return
      const index = options?.skipPartialViewportSentence
        ? epubTtsCompleteUtteranceIndexAtViewportStart(utterances, locator)
        : epubTtsUtteranceIndexAtLocator(utterances, locator)
      if (index < 0) return
      const currentId = speech.getCurrentContent()?.id
      if (utterances[index]?.id === currentId && !options?.forceRestart) return
      const sessionId = beginSession({
        navigationId: options?.navigationId,
        pauseAfterStart: activeState === "paused" && options?.autoplay !== true,
      })
      if (!sessionId) return
      if (utterances[index]?.id === currentId) {
        speechSessionsRef.current.delete(speech)
        speech.stop()
        speechSessionsRef.current.set(speech, sessionId)
      }
      showUtterance(index, false)
      suppressNextFollowRef.current = true
      if (!speech.jumpTo(index, true)) speech.play()
    },
    [beginSession, showUtterance, utterances],
  )

  const readAtPoint = useCallback(
    (
      resourceHref: string,
      document: Document,
      point: { x: number; y: number },
    ) => {
      const utterance = epubTtsUtteranceAtPoint(
        utterances,
        resourceHref,
        document,
        point,
      )
      if (!utterance) return false
      readFrom(utterance.locator)
      return true
    },
    [readFrom, utterances],
  )

  const goToCurrent = useCallback(() => {
    const utterance = currentIndex == null ? null : utterances[currentIndex]
    if (!utterance) return
    navigatorRef.current?.go(utterance.locator, false, () => {
      const navigator = navigatorRef.current
      if (navigator) {
        applyEpubTtsHighlight(navigator, utterance.locator, highlightTint)
        reattachViewportIfVisible(utterance.locator)
      }
    })
  }, [
    currentIndex,
    highlightTint,
    navigatorRef,
    reattachViewportIfVisible,
    utterances,
  ])

  const setVoice = useCallback(
    (nextVoiceId: string) => {
      const speech = speechRef.current
      const activeConfig = configRef.current
      if (!speech || !activeConfig || !nextVoiceId) return
      captureActiveRestart()
      speech.setVoice(nextVoiceId)
      setCurrentVoiceId(nextVoiceId)
      const engine = activeConfig.defaultEngine
      const voice: TtsVoiceRefDto =
        engine.kind === "provider"
          ? {
              engine: "provider",
              profileId: engine.profileId,
              voiceId: nextVoiceId,
            }
          : { engine: "system", voiceId: nextVoiceId }
      void api
        .setTtsVoiceForLanguage(normalizeTtsLanguage(language) || "und", voice)
        .then((nextConfig) => {
          configRef.current = nextConfig
          setConfig(nextConfig)
          return notifyTtsConfigChanged(sourceRef.current)
        })
        .catch((saveError: unknown) => setError(formatApiError(saveError)))
    },
    [captureActiveRestart, language],
  )

  const setSpeed = useCallback((nextSpeed: number) => {
    const activeConfig = configRef.current
    const speech = speechRef.current
    if (!activeConfig || !speech || !Number.isFinite(nextSpeed)) return
    const normalized = Math.max(0.5, Math.min(3, nextSpeed))
    speech.submitPreferences(new SpeechPreferences({ rate: normalized }))
    setSpeedState(normalized)
    const playback: TtsPlaybackPreferencesDto = {
      ...activeConfig.playback,
      speed: normalized,
    }
    void api
      .setTtsPlaybackPreferences(playback)
      .then((nextConfig) => {
        configRef.current = nextConfig
        return notifyTtsConfigChanged(sourceRef.current)
      })
      .catch((saveError: unknown) => setError(formatApiError(saveError)))
  }, [])

  const selectedEngine = config?.defaultEngine
  const providerName =
    selectedEngine?.kind === "provider"
      ? config?.profiles.find(
          (profile) => profile.id === selectedEngine.profileId,
        )?.name
      : undefined

  return {
    available: enabled && Boolean(config) && utterances.length > 0,
    loading,
    state,
    viewportDetached,
    remote: selectedEngine?.kind === "provider",
    engineName: providerName ?? "system",
    utteranceCount: utterances.length,
    currentUtterance:
      currentIndex == null ? null : (utterances[currentIndex] ?? null),
    voices,
    currentVoiceId,
    speed,
    error,
    play,
    pause,
    stop,
    previous,
    next,
    readFrom,
    readAtPoint,
    rebase,
    markViewportMoved,
    goToCurrent,
    setVoice,
    setSpeed,
  }
}
