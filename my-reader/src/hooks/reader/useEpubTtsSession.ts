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
import { isEpubTextLocatorVisible } from "@/lib/readium/epubBookmarkAnchor"
import {
  type EpubTtsUtterance,
  epubTtsPlaybackPlanAtLocator,
  extractEpubTtsUtterances,
} from "@/lib/readium/epubTts"
import {
  applyEpubTtsHighlight,
  clearEpubTtsHighlight,
} from "@/lib/readium/epubTtsHighlight"
import { resolveEpubTtsViewportRelation } from "@/lib/readium/epubTtsViewport"
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
  viewportOriginLocator: Locator | null
  remote: boolean
  engineName: string
  utteranceCount: number
  currentUtterance: EpubTtsUtterance | null
  voices: ReadiumSpeechVoice[]
  currentVoiceId: string
  speed: number
  error: string | null
  play: (locator?: Locator) => void
  pause: () => void
  stop: () => void
  previous: () => void
  next: () => void
  readFrom: (locator: Locator) => void
  rebase: (
    locator: Locator,
    options?: {
      autoplay?: boolean
      forceRestart?: boolean
      navigationId?: string
    },
  ) => void
  markViewportMoved: (
    navigationId: string,
    phase?: "begin" | "complete" | "cancel",
    originLocator?: Locator,
  ) => void
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
  if (isEpubTextLocatorVisible(navigator, locator)) return true
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

function readerLocatorForTtsRelation(locator: Locator): ReaderLocator {
  return {
    href: locator.href,
    type: locator.type,
    locations: {
      progression:
        locator.locations.progression ??
        locator.locations.totalProgression ??
        0,
      position: locator.locations.position,
      totalProgression: locator.locations.totalProgression,
    },
  }
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
  const [viewportOriginLocator, setViewportOriginLocator] =
    useState<Locator | null>(null)
  const [currentIndex, setCurrentIndex] = useState<number | null>(null)
  const [voices, setVoices] = useState<ReadiumSpeechVoice[]>([])
  const [currentVoiceId, setCurrentVoiceId] = useState("")
  const [speed, setSpeedState] = useState(1)
  const [error, setError] = useState<string | null>(null)
  const speechRef = useRef<ReadiumSpeechNavigator | null>(null)
  const configRef = useRef<TtsConfigDto | null>(null)
  const playbackUtterancesRef = useRef<EpubTtsUtterance[]>([])
  const currentLocatorRef = useRef<Locator | null>(currentLocator)
  const positionsRef = useRef(positions)
  const restartAfterConfigRef = useRef<{
    locator: Locator
    autoplay: boolean
  } | null>(null)
  const configRefreshRevisionRef = useRef(0)
  const highlightRevisionRef = useRef(0)
  const suppressNextFollowRef = useRef(false)
  const pendingViewportNavigationRef = useRef<string | null>(null)
  const pendingViewportStartedDetachedRef = useRef(false)
  const pendingViewportPlaybackIdRef = useRef<string | null>(null)
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
  currentLocatorRef.current = currentLocator
  positionsRef.current = positions

  const syncViewportState = useCallback(
    (transition: ReaderTtsSessionTransition, originLocator?: Locator) => {
      if (!transition.accepted) return
      const detached = transition.snapshot.viewportDetached
      setViewportDetached(detached)
      setViewportOriginLocator((current) =>
        detached
          ? (current ?? originLocator ?? currentLocatorRef.current)
          : null,
      )
    },
    [],
  )

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
      pendingViewportNavigationRef.current = null
      pendingViewportStartedDetachedRef.current = false
      pendingViewportPlaybackIdRef.current = null
      speechSessionsRef.current.set(speech, transition.snapshot.sessionId)
      setState("loading")
      syncViewportState(transition)
      return transition.snapshot.sessionId
    },
    [syncViewportState],
  )

  const reattachViewport = useCallback(() => {
    const machine = sessionMachineRef.current!
    const { sessionId, viewportDetached } = machine.snapshot
    if (!sessionId || !viewportDetached) return false
    const transition = machine.send({
      type: "viewport-matched",
      sessionId,
    })
    if (transition.accepted) {
      syncViewportState(transition)
    }
    return transition.accepted
  }, [syncViewportState])

  const reattachViewportIfVisible = useCallback(
    (locator: Locator) => {
      const navigator = navigatorRef.current
      if (!navigator) {
        return false
      }
      if (isEpubTextLocatorVisible(navigator, locator)) {
        return reattachViewport()
      }
      if (!isLocatorVisibleInViewport(navigator, locator)) return false
      const relation = resolveEpubTtsViewportRelation({
        viewportDetached: true,
        viewportLocator: readerLocatorForTtsRelation(navigator.currentLocator),
        playbackLocator: readerLocatorForTtsRelation(locator),
        positions: positionsRef.current,
      })
      if (relation === "after") return false
      return reattachViewport()
    },
    [navigatorRef, reattachViewport],
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
      ? playbackUtterancesRef.current.find(
          (candidate) => candidate.id === currentId,
        )
      : undefined
    const locator = utterance?.locator ?? currentLocatorRef.current
    restartAfterConfigRef.current = locator
      ? { locator, autoplay: activeState !== "paused" }
      : null
    return Boolean(restartAfterConfigRef.current)
  }, [])

  const preparePlaybackPlan = useCallback(
    (speech: ReadiumSpeechNavigator, locator: Locator, forceReload = false) => {
      const plan = epubTtsPlaybackPlanAtLocator(utterances, locator)
      if (!plan) return null
      const loaded = speech.getContentQueue()
      const queueChanged =
        loaded.length !== plan.utterances.length ||
        loaded.some((item, index) => item !== plan.utterances[index])
      playbackUtterancesRef.current = plan.utterances
      if (forceReload || queueChanged) {
        speechSessionsRef.current.delete(speech)
        speech.loadContent(plan.utterances)
      }
      return plan
    },
    [utterances],
  )

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
      const utterance = playbackUtterancesRef.current[index]
      const navigator = navigatorRef.current
      if (!utterance || !navigator) return
      const highlightRevision = ++highlightRevisionRef.current
      setCurrentIndex(index)
      applyEpubTtsHighlight(navigator, utterance.locator, highlightTint)
      if (
        followText &&
        !isLocatorVisibleInViewport(navigator, utterance.locator)
      ) {
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
    [highlightTint, navigatorRef],
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
    playbackUtterancesRef.current = utterances
    setState("loading")
    setCurrentIndex(null)
    setVoices([])
    setCurrentVoiceId("")
    setError(null)

    const currentSpeechIndex = () => {
      const id = speech.getCurrentContent()?.id
      return id
        ? playbackUtterancesRef.current.findIndex(
            (utterance) => utterance.id === id,
          )
        : -1
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
        const utterance = playbackUtterancesRef.current[index]
        const viewportWasDetached =
          sessionMachineRef.current!.snapshot.viewportDetached
        const viewportNavigationPending = Boolean(
          pendingViewportNavigationRef.current,
        )
        if (viewportWasDetached && utterance && !viewportNavigationPending) {
          reattachViewportIfVisible(utterance.locator)
        }
        const suppressFollow = suppressNextFollowRef.current
        suppressNextFollowRef.current = false
        if (viewportNavigationPending) {
          setCurrentIndex(index)
          return
        }
        if (!suppressFollow) showUtterance(index, !viewportWasDetached)
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
      syncViewportState(transition)
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
      const plan = preparePlaybackPlan(speech, restart.locator, true)
      if (!plan) return
      const sessionId = beginSession({
        pauseAfterStart: !restart.autoplay,
      })
      if (!sessionId) return
      showUtterance(plan.index)
      if (speech.getCurrentContent()?.id === plan.utterances[plan.index]?.id) {
        speech.play()
      } else if (!speech.jumpTo(plan.index, true)) {
        speech.play()
      }
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
    preparePlaybackPlan,
    reattachViewportIfVisible,
    showUtterance,
    syncViewportState,
    utterances,
  ])

  const play = useCallback(
    (requestedLocator?: Locator) => {
      const speech = speechRef.current
      if (!speech) return
      setError(null)
      if (sessionMachineRef.current!.snapshot.sessionId) {
        speech.play()
        return
      }
      const locator =
        requestedLocator ??
        currentLocator ??
        navigatorRef.current?.currentLocator
      if (locator) {
        const plan = preparePlaybackPlan(speech, locator)
        if (plan) {
          if (!beginSession()) return
          const currentId = speech.getCurrentContent()?.id
          const targetId = plan.utterances[plan.index]?.id
          if (requestedLocator || currentId !== targetId) {
            showUtterance(plan.index, false)
            suppressNextFollowRef.current = true
          }
          if (speech.getCurrentContent()?.id === targetId) {
            speech.play()
          } else if (!speech.jumpTo(plan.index, true)) {
            speech.play()
          }
          return
        }
      }
      if (!beginSession()) return
      speech.play()
    },
    [
      beginSession,
      currentLocator,
      navigatorRef,
      preparePlaybackPlan,
      showUtterance,
    ],
  )

  const pause = useCallback(() => speechRef.current?.pause(), [])

  const stop = useCallback(() => {
    const highlightRevision = ++highlightRevisionRef.current
    restartAfterConfigRef.current = null
    suppressNextFollowRef.current = false
    pendingViewportNavigationRef.current = null
    pendingViewportStartedDetachedRef.current = false
    pendingViewportPlaybackIdRef.current = null
    const transition = sessionMachineRef.current!.send({ type: "stop" })
    const speech = speechRef.current
    if (speech) speechSessionsRef.current.delete(speech)
    speech?.stop()
    setState("idle")
    syncViewportState(transition)
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
  }, [navigatorRef, syncViewportState])

  const previous = useCallback(() => {
    speechRef.current?.previous()
  }, [])

  const next = useCallback(() => {
    speechRef.current?.next()
  }, [])

  const markViewportMoved = useCallback(
    (
      navigationId: string,
      phase: "begin" | "complete" | "cancel" = "complete",
      originLocator?: Locator,
    ) => {
      if (
        phase !== "begin" &&
        pendingViewportNavigationRef.current &&
        pendingViewportNavigationRef.current !== navigationId
      ) {
        return
      }
      const machine = sessionMachineRef.current!
      const startedDetached =
        phase === "begin"
          ? machine.snapshot.viewportDetached
          : pendingViewportNavigationRef.current === navigationId
            ? pendingViewportStartedDetachedRef.current
            : machine.snapshot.viewportDetached
      const playbackIdAtStart =
        phase === "begin"
          ? (speechRef.current?.getCurrentContent()?.id ?? null)
          : pendingViewportNavigationRef.current === navigationId
            ? pendingViewportPlaybackIdRef.current
            : (speechRef.current?.getCurrentContent()?.id ?? null)
      if (phase === "begin") {
        pendingViewportNavigationRef.current = navigationId
        pendingViewportStartedDetachedRef.current = startedDetached
        pendingViewportPlaybackIdRef.current = playbackIdAtStart
      } else if (pendingViewportNavigationRef.current === navigationId) {
        pendingViewportNavigationRef.current = null
        pendingViewportStartedDetachedRef.current = false
        pendingViewportPlaybackIdRef.current = null
      }
      if (phase === "cancel") {
        if (!startedDetached) reattachViewport()
        return
      }
      const transition = machine.send({
        type: "viewport-moved",
        navigationId,
      })
      if (transition.accepted) {
        syncViewportState(
          transition,
          originLocator ?? currentLocatorRef.current ?? undefined,
        )
        const currentId = speechRef.current?.getCurrentContent()?.id
        const locator = currentId
          ? playbackUtterancesRef.current.find(
              (utterance) => utterance.id === currentId,
            )?.locator
          : undefined
        const playbackAdvanced = currentId !== playbackIdAtStart
        const activeSentenceVisible = Boolean(
          phase === "complete" &&
            locator &&
            navigatorRef.current &&
            isEpubTextLocatorVisible(navigatorRef.current, locator),
        )
        if (
          phase === "complete" &&
          (activeSentenceVisible || startedDetached || playbackAdvanced) &&
          locator
        ) {
          reattachViewportIfVisible(locator)
        }
      }
    },
    [
      navigatorRef,
      reattachViewport,
      reattachViewportIfVisible,
      syncViewportState,
    ],
  )

  const readFrom = useCallback(
    (locator: Locator) => {
      const speech = speechRef.current
      if (!speech) return
      const plan = preparePlaybackPlan(speech, locator, true)
      if (!plan) return
      const sessionId = beginSession()
      if (!sessionId) return
      showUtterance(plan.index, false)
      suppressNextFollowRef.current = true
      if (speech.getCurrentContent()?.id === plan.utterances[plan.index]?.id) {
        speech.play()
      } else if (!speech.jumpTo(plan.index, true)) {
        speech.play()
      }
    },
    [beginSession, preparePlaybackPlan, showUtterance],
  )

  const rebase = useCallback(
    (
      locator: Locator,
      options?: {
        autoplay?: boolean
        forceRestart?: boolean
        navigationId?: string
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
      const plan = epubTtsPlaybackPlanAtLocator(utterances, locator)
      if (!plan) return
      const currentId = speech.getCurrentContent()?.id
      if (
        plan.utterances[plan.index]?.id === currentId &&
        !options?.forceRestart
      )
        return
      const sessionId = beginSession({
        navigationId: options?.navigationId,
        pauseAfterStart: activeState === "paused" && options?.autoplay !== true,
      })
      if (!sessionId) return
      const prepared = preparePlaybackPlan(
        speech,
        locator,
        options?.forceRestart,
      )
      if (!prepared) return
      speechSessionsRef.current.set(speech, sessionId)
      showUtterance(prepared.index, false)
      suppressNextFollowRef.current = true
      if (
        speech.getCurrentContent()?.id ===
        prepared.utterances[prepared.index]?.id
      ) {
        speech.play()
      } else if (!speech.jumpTo(prepared.index, true)) {
        speech.play()
      }
    },
    [beginSession, preparePlaybackPlan, showUtterance, utterances],
  )

  const goToCurrent = useCallback(() => {
    const utterance =
      currentIndex == null ? null : playbackUtterancesRef.current[currentIndex]
    if (!utterance) return
    navigatorRef.current?.go(utterance.locator, false, (ok) => {
      if (!ok) return
      const navigator = navigatorRef.current
      if (navigator) {
        applyEpubTtsHighlight(navigator, utterance.locator, highlightTint)
        reattachViewport()
      }
    })
  }, [currentIndex, highlightTint, navigatorRef, reattachViewport])

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
    viewportOriginLocator,
    remote: selectedEngine?.kind === "provider",
    engineName: providerName ?? "system",
    utteranceCount: utterances.length,
    currentUtterance:
      currentIndex == null
        ? null
        : (playbackUtterancesRef.current[currentIndex] ?? null),
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
    rebase,
    markViewportMoved,
    goToCurrent,
    setVoice,
    setSpeed,
  }
}
