import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import {
  chooseTtsVoiceForLanguage,
  filterTtsVoicesForLanguage,
  normalizeTtsLanguage,
} from "@my-reader/tools/reader-tts-language"
import type { EpubNavigator } from "@readium/navigator"
import type { Locator } from "@readium/shared"
import {
  ReadiumSpeechNavigator,
  type ReadiumSpeechPlaybackState,
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
  state: ReadiumSpeechPlaybackState
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
  rebase: (locator: Locator, options?: { forceRestart?: boolean }) => void
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
  const [state, setState] = useState<ReadiumSpeechPlaybackState>("idle")
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)
  const [voices, setVoices] = useState<ReadiumSpeechVoice[]>([])
  const [currentVoiceId, setCurrentVoiceId] = useState("")
  const [speed, setSpeedState] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const speechRef = useRef<ReadiumSpeechNavigator | null>(null)
  const configRef = useRef<TtsConfigDto | null>(null)
  const startedRef = useRef(false)
  const stateRef = useRef<ReadiumSpeechPlaybackState>("idle")
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

  const captureActiveRestart = useCallback(() => {
    const speech = speechRef.current
    const activeState = speech?.getState() ?? stateRef.current
    if (
      !startedRef.current ||
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
    startedRef.current = false
    stateRef.current = "loading"
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
      if (!startedRef.current) return
      const index = currentSpeechIndex()
      if (index >= 0) {
        const followText = !suppressNextFollowRef.current
        suppressNextFollowRef.current = false
        showUtterance(index, followText)
      }
    }
    const setPlaybackState = (nextState: ReadiumSpeechPlaybackState) => {
      stateRef.current = nextState
      setState(nextState)
    }
    const restartIfNeeded = () => {
      const restart = restartAfterConfigRef.current
      if (!restart || speechRef.current !== speech) return
      restartAfterConfigRef.current = null
      const index = epubTtsUtteranceIndexAtLocator(utterances, restart.locator)
      if (index < 0) return
      startedRef.current = false
      speech.jumpTo(index, true)
      showUtterance(index)
      startedRef.current = true
      if (restart.autoplay) speech.play()
      else speech.pause()
    }
    const unsubscribers = [
      speech.on("loading", () => setPlaybackState("loading")),
      speech.on("ready", () => setPlaybackState("ready")),
      speech.on("start", () => {
        startedRef.current = true
        setPlaybackState("playing")
        syncCurrent()
      }),
      speech.on("pause", () => setPlaybackState("paused")),
      speech.on("resume", () => {
        setPlaybackState("playing")
        syncCurrent()
      }),
      speech.on("skip", () => {
        setPlaybackState(speech.getState())
        syncCurrent()
      }),
      speech.on("end", () => setPlaybackState(speech.getState())),
      speech.on("stop", () => {
        startedRef.current = false
        setPlaybackState("idle")
      }),
      speech.on("error", (event) => {
        const message = event.detail?.message
        setError(typeof message === "string" ? message : "TTS_PLAYBACK_FAILED")
        setPlaybackState("idle")
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
      if (speechRef.current === speech) speechRef.current = null
      void speech.destroy()
      const navigator = navigatorRef.current
      if (navigator) clearEpubTtsHighlight(navigator)
    }
  }, [config, enabled, language, navigatorRef, showUtterance, utterances])

  const play = useCallback(() => {
    const speech = speechRef.current
    if (!speech) return
    setError(null)
    if (startedRef.current) {
      speech.play()
      return
    }
    const locator = currentLocator ?? navigatorRef.current?.currentLocator
    if (locator) {
      const index = epubTtsUtteranceIndexAtLocator(utterances, locator)
      const currentId = speech.getCurrentContent()?.id
      if (index >= 0 && utterances[index]?.id !== currentId) {
        showUtterance(index, false)
        startedRef.current = true
        speech.jumpTo(index, true)
        return
      }
    }
    startedRef.current = true
    speech.play()
  }, [currentLocator, navigatorRef, showUtterance, utterances])

  const pause = useCallback(() => speechRef.current?.pause(), [])

  const stop = useCallback(() => {
    const highlightRevision = ++highlightRevisionRef.current
    startedRef.current = false
    restartAfterConfigRef.current = null
    suppressNextFollowRef.current = false
    speechRef.current?.stop()
    setCurrentIndex(null)
    const navigator = navigatorRef.current
    if (navigator) {
      clearEpubTtsHighlight(navigator)
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          if (
            !startedRef.current &&
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

  const readFrom = useCallback(
    (locator: Locator) => {
      const speech = speechRef.current
      if (!speech) return
      const index = epubTtsUtteranceIndexAtLocator(utterances, locator)
      if (index < 0) return
      const currentId = speech.getCurrentContent()?.id
      showUtterance(index, false)
      suppressNextFollowRef.current = true
      if (utterances[index]?.id === currentId) speech.stop()
      startedRef.current = true
      if (!speech.jumpTo(index, true)) speech.play()
    },
    [showUtterance, utterances],
  )

  const rebase = useCallback(
    (locator: Locator, options?: { forceRestart?: boolean }) => {
      const speech = speechRef.current
      const activeState = stateRef.current
      if (
        !speech ||
        !startedRef.current ||
        (activeState !== "loading" &&
          activeState !== "playing" &&
          activeState !== "paused")
      )
        return
      const index = epubTtsUtteranceIndexAtLocator(utterances, locator)
      if (index < 0) return
      const currentId = speech.getCurrentContent()?.id
      if (utterances[index]?.id === currentId && !options?.forceRestart) return
      showUtterance(index, false)
      suppressNextFollowRef.current = true
      speech.jumpTo(index, activeState !== "paused")
    },
    [showUtterance, utterances],
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
      if (navigator)
        applyEpubTtsHighlight(navigator, utterance.locator, highlightTint)
    })
  }, [currentIndex, highlightTint, navigatorRef, utterances])

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
    goToCurrent,
    setVoice,
    setSpeed,
  }
}
