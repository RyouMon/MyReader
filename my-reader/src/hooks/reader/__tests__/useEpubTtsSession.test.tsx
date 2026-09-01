import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { EpubNavigator } from "@readium/navigator"
import { Locator, LocatorLocations } from "@readium/shared"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { RefObject } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useEpubTtsSession } from "@/hooks/reader/useEpubTtsSession"
import type { EpubTextResource } from "@/lib/readium/epubContentLocators"
import {
  epubTtsUtteranceIndexAtLocator,
  extractEpubTtsUtterances,
} from "@/lib/readium/epubTts"
import {
  applyEpubTtsHighlight,
  clearEpubTtsHighlight,
} from "@/lib/readium/epubTtsHighlight"
import { api } from "@/lib/tauri-api"

const speechInstances = vi.hoisted(() => [] as unknown[])
const speechVoices = vi.hoisted(() => [] as unknown[])
const configChangeListeners = vi.hoisted(
  () => [] as Array<(event: { payload: { source: string } }) => void>,
)

vi.mock("@readium/speech", () => {
  type Event = { detail?: { message?: string } }
  type Listener = (event: Event) => void

  class FakeSpeechNavigator {
    private content: Array<{ id?: string }> = []
    private currentIndex = 0
    private state = "idle"
    private listeners = new Map<string, Set<Listener>>()

    constructor() {
      speechInstances.push(this)
    }

    on(event: string, listener: Listener) {
      const listeners = this.listeners.get(event) ?? new Set<Listener>()
      listeners.add(listener)
      this.listeners.set(event, listeners)
      return () => listeners.delete(listener)
    }

    private emit(event: string) {
      this.listeners.get(event)?.forEach((listener) => {
        listener({})
      })
    }

    loadContent(content: Array<{ id?: string }>) {
      this.content = content
      this.state = "ready"
      this.emit("ready")
    }

    getCurrentContent() {
      return this.content[this.currentIndex] ?? null
    }

    getState() {
      return this.state
    }

    getVoices() {
      return Promise.resolve(speechVoices)
    }

    setSpeakInContentLanguage() {}
    setVoice = vi.fn()
    submitPreferences() {}

    play = vi.fn(() => {
      this.state = "playing"
      this.emit("start")
    })

    pause() {
      this.state = "paused"
      this.emit("pause")
    }

    stop = vi.fn(() => {
      this.state = "idle"
      this.emit("stop")
    })

    previous() {
      return false
    }

    next() {
      return false
    }

    jumpTo = vi.fn((index: number) => {
      if (index === this.currentIndex) return false
      this.currentIndex = index
      return true
    })

    emitSkip(index: number) {
      this.currentIndex = index
      this.emit("skip")
    }

    emitStart(index: number) {
      this.currentIndex = index
      this.state = "playing"
      this.emit("start")
    }

    destroy() {
      return Promise.resolve()
    }
  }

  return {
    ReadiumSpeechNavigator: FakeSpeechNavigator,
    SpeechPreferences: class {},
    WebSpeechEngine: class {},
  }
})

vi.mock("@tauri-apps/api/event", () => ({
  emit: vi.fn().mockResolvedValue(undefined),
  listen: vi.fn(
    async (
      _event: string,
      listener: (event: { payload: { source: string } }) => void,
    ) => {
      configChangeListeners.push(listener)
      return vi.fn()
    },
  ),
}))

vi.mock("@/lib/readium/epubTts", () => ({
  extractEpubTtsUtterances: vi.fn(),
  epubTtsUtteranceIndexAtLocator: vi.fn().mockReturnValue(0),
  epubTtsUtteranceAtPoint: vi.fn().mockReturnValue(null),
}))

vi.mock("@/lib/readium/epubTtsHighlight", () => ({
  applyEpubTtsHighlight: vi.fn(),
  clearEpubTtsHighlight: vi.fn(),
}))

vi.mock("@/lib/tauri-api", () => ({
  api: {
    getTtsConfig: vi.fn(),
    setTtsPlaybackPreferences: vi.fn(),
    setTtsVoiceForLanguage: vi.fn(),
  },
  formatApiError: (error: unknown) => String(error),
}))

beforeEach(() => {
  vi.clearAllMocks()
  speechInstances.length = 0
  speechVoices.length = 0
  configChangeListeners.length = 0
  vi.mocked(epubTtsUtteranceIndexAtLocator).mockReturnValue(0)
  vi.spyOn(window, "requestAnimationFrame").mockImplementation((callback) => {
    callback(0)
    return 1
  })
  vi.mocked(api.getTtsConfig).mockResolvedValue({
    schemaVersion: 1,
    defaultEngine: { kind: "system" },
    profiles: [],
    voiceByLanguage: {},
    playback: {
      speed: 1,
      pitch: 1,
      skipPageBreaks: true,
      skipFootnotes: true,
      announceContext: false,
    },
  })
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("useEpubTtsSession", () => {
  it("uses the global default voice when the publication has no language override", async () => {
    const locator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    const globalVoice = {
      identifier: "global-voice",
      name: "Global voice",
      language: "zh-CN",
    }
    speechVoices.push(globalVoice)
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "Global default.", locator },
    ])
    vi.mocked(api.getTtsConfig).mockResolvedValue({
      schemaVersion: 1,
      defaultEngine: { kind: "system" },
      profiles: [],
      voiceByLanguage: {
        und: { engine: "system", voiceId: "global-voice" },
      },
      playback: {
        speed: 1,
        pitch: 1,
        skipPageBreaks: true,
        skipFootnotes: true,
        announceContext: false,
      },
    })
    const navigatorRef = {
      current: {
        currentLocator: locator,
        go: vi.fn(),
      } as unknown as EpubNavigator,
    } as RefObject<EpubNavigator>

    renderHook(() =>
      useEpubTtsSession({
        enabled: true,
        navigatorRef,
        resources: [{} as EpubTextResource],
        positions: [{} as ReaderLocator],
        currentLocator: locator,
        language: "zh-CN",
        highlightTint: "#ff00aa",
      }),
    )

    await waitFor(() => expect(speechInstances).toHaveLength(1))
    const speech = speechInstances[0] as {
      setVoice: ReturnType<typeof vi.fn>
    }
    await waitFor(() =>
      expect(speech.setVoice).toHaveBeenCalledWith(globalVoice),
    )
  })

  it("rebases active narration only for an explicit user navigation", async () => {
    const firstLocator = new Locator({
      href: "chapter-1.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    const secondLocator = new Locator({
      href: "chapter-2.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.1 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "First page.", locator: firstLocator },
      { id: "sentence-2", plain: "Second page.", locator: secondLocator },
    ])
    vi.mocked(epubTtsUtteranceIndexAtLocator).mockImplementation(
      (_utterances, locator) => (locator.href === secondLocator.href ? 1 : 0),
    )
    const navigator = {
      currentLocator: firstLocator,
      go: vi.fn(),
    } as unknown as EpubNavigator
    const navigatorRef = { current: navigator } as RefObject<EpubNavigator>

    const { result, rerender } = renderHook(
      ({ locator }: { locator: Locator }) =>
        useEpubTtsSession({
          enabled: true,
          navigatorRef,
          resources: [{} as EpubTextResource],
          positions: [{} as ReaderLocator],
          currentLocator: locator,
          language: "en",
          highlightTint: "#ff00aa",
        }),
      { initialProps: { locator: firstLocator } },
    )

    await waitFor(() => expect(speechInstances).toHaveLength(1))
    const speech = speechInstances[0] as {
      play: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
      jumpTo: ReturnType<typeof vi.fn>
    }
    act(() => result.current.play())
    await waitFor(() => expect(result.current.state).toBe("playing"))

    rerender({ locator: secondLocator })

    expect(speech.jumpTo).not.toHaveBeenCalled()

    act(() => result.current.rebase(secondLocator))

    expect(speech.jumpTo).toHaveBeenCalledWith(1, true)
    expect(speech.stop).not.toHaveBeenCalled()
    expect(speech.play).toHaveBeenCalledOnce()
  })

  it("restarts the first visible sentence after an explicit page turn", async () => {
    const locator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.4 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "visible-sentence", plain: "Visible sentence.", locator },
    ])
    const navigatorRef = {
      current: {
        currentLocator: locator,
        go: vi.fn(),
      } as unknown as EpubNavigator,
    } as RefObject<EpubNavigator>
    const { result } = renderHook(() =>
      useEpubTtsSession({
        enabled: true,
        navigatorRef,
        resources: [{} as EpubTextResource],
        positions: [{} as ReaderLocator],
        currentLocator: locator,
        language: "en",
        highlightTint: "#ff00aa",
      }),
    )

    await waitFor(() => expect(speechInstances).toHaveLength(1))
    const speech = speechInstances[0] as {
      jumpTo: ReturnType<typeof vi.fn>
    }
    act(() => result.current.play())
    speech.jumpTo.mockClear()

    act(() => result.current.rebase(locator, { forceRestart: true }))

    expect(speech.jumpTo).toHaveBeenCalledWith(0, true)
  })

  it("does not treat delayed follow-text locators as user navigation", async () => {
    const firstLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.1 }),
    })
    const secondLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.6 }),
    })
    const reportedViewportLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.4 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "First sentence.", locator: firstLocator },
      { id: "sentence-2", plain: "Second sentence.", locator: secondLocator },
    ])
    vi.mocked(epubTtsUtteranceIndexAtLocator).mockImplementation(
      (_utterances, locator) =>
        locator.locations.progression === secondLocator.locations.progression
          ? 1
          : 0,
    )
    let finishFollowText: (() => void) | undefined
    const navigator = {
      currentLocator: firstLocator,
      go: vi.fn(
        (_locator: Locator, _animated: boolean, callback: () => void) => {
          finishFollowText = callback
        },
      ),
    } as unknown as EpubNavigator
    const navigatorRef = { current: navigator } as RefObject<EpubNavigator>

    const { result, rerender } = renderHook(
      ({ locator }: { locator: Locator }) =>
        useEpubTtsSession({
          enabled: true,
          navigatorRef,
          resources: [{} as EpubTextResource],
          positions: [{} as ReaderLocator],
          currentLocator: locator,
          language: "en",
          highlightTint: "#ff00aa",
        }),
      { initialProps: { locator: firstLocator } },
    )

    await waitFor(() => expect(speechInstances).toHaveLength(1))
    const speech = speechInstances[0] as {
      play: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
      jumpTo: ReturnType<typeof vi.fn>
      emitStart: (index: number) => void
    }
    act(() => result.current.play())
    await waitFor(() => expect(result.current.state).toBe("playing"))
    act(() => finishFollowText?.())
    speech.play.mockClear()
    speech.stop.mockClear()
    speech.jumpTo.mockClear()
    act(() => speech.emitStart(1))
    expect(result.current.currentUtterance?.id).toBe("sentence-2")
    act(() => finishFollowText?.())
    rerender({ locator: reportedViewportLocator })

    expect(speech.stop).not.toHaveBeenCalled()
    expect(speech.jumpTo).not.toHaveBeenCalled()
    expect(speech.play).not.toHaveBeenCalled()
    expect(result.current.currentUtterance?.id).toBe("sentence-2")

    rerender({ locator: firstLocator })

    expect(speech.stop).not.toHaveBeenCalled()
    expect(speech.jumpTo).not.toHaveBeenCalled()
    expect(speech.play).not.toHaveBeenCalled()

    act(() => result.current.rebase(firstLocator))

    expect(speech.jumpTo).toHaveBeenCalledWith(0, true)
  })

  it("keeps long-running narration at the latest utterance across locator updates", async () => {
    const locators = Array.from(
      { length: 24 },
      (_, index) =>
        new Locator({
          href: `chapter-${Math.floor(index / 6) + 1}.xhtml`,
          type: "application/xhtml+xml",
          locations: new LocatorLocations({ progression: (index % 6) / 6 }),
        }),
    )
    vi.mocked(extractEpubTtsUtterances).mockReturnValue(
      locators.map((locator, index) => ({
        id: `sentence-${index}`,
        plain: `Sentence ${index}.`,
        locator,
      })),
    )
    vi.mocked(epubTtsUtteranceIndexAtLocator).mockImplementation(
      (_utterances, locator) => locators.indexOf(locator),
    )
    const navigator = {
      currentLocator: locators[0],
      go: vi.fn(),
    } as unknown as EpubNavigator
    const navigatorRef = { current: navigator } as RefObject<EpubNavigator>

    const { result, rerender } = renderHook(
      ({ locator }: { locator: Locator }) =>
        useEpubTtsSession({
          enabled: true,
          navigatorRef,
          resources: [{} as EpubTextResource],
          positions: [{} as ReaderLocator],
          currentLocator: locator,
          language: "en",
          highlightTint: "#ff00aa",
        }),
      { initialProps: { locator: locators[0]! } },
    )

    await waitFor(() => expect(speechInstances).toHaveLength(1))
    const speech = speechInstances[0] as {
      jumpTo: ReturnType<typeof vi.fn>
      emitStart: (index: number) => void
    }
    act(() => result.current.play())
    speech.jumpTo.mockClear()

    for (let index = 1; index < locators.length; index += 1) {
      act(() => speech.emitStart(index))
      rerender({ locator: locators[Math.max(0, index - 1)]! })
    }

    expect(result.current.currentUtterance?.id).toBe("sentence-23")
    expect(speech.jumpTo).not.toHaveBeenCalled()
  })

  it("rebuilds active narration immediately after a provider change", async () => {
    const locator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "Keep reading.", locator },
    ])
    const navigator = {
      currentLocator: locator,
      go: vi.fn(),
    } as unknown as EpubNavigator
    const navigatorRef = { current: navigator } as RefObject<EpubNavigator>
    const { result } = renderHook(() =>
      useEpubTtsSession({
        enabled: true,
        navigatorRef,
        resources: [{} as EpubTextResource],
        positions: [{} as ReaderLocator],
        currentLocator: locator,
        language: "en",
        highlightTint: "#ff00aa",
      }),
    )

    await waitFor(() => expect(configChangeListeners).toHaveLength(1))
    act(() => result.current.play())
    await waitFor(() => expect(result.current.state).toBe("playing"))
    vi.mocked(api.getTtsConfig).mockResolvedValue({
      schemaVersion: 1,
      defaultEngine: { kind: "provider", profileId: "openai" },
      profiles: [
        {
          id: "openai",
          name: "OpenAI compatible",
          kind: "openAiCompatible",
          enabled: true,
          endpoint: "https://example.com/v1",
          model: "tts-model",
          options: {
            kind: "openAiCompatible",
            voices: ["reader"],
            defaultVoice: "reader",
          },
          revision: 2,
          hasCredential: true,
        },
      ],
      voiceByLanguage: {},
      playback: {
        speed: 1,
        pitch: 1,
        skipPageBreaks: true,
        skipFootnotes: true,
        announceContext: false,
      },
    })

    act(() => {
      configChangeListeners[0]?.({ payload: { source: "settings" } })
    })

    await waitFor(() => expect(speechInstances).toHaveLength(2))
    const replacement = speechInstances[1] as {
      play: ReturnType<typeof vi.fn>
      jumpTo: ReturnType<typeof vi.fn>
    }
    await waitFor(() => expect(replacement.play).toHaveBeenCalledOnce())
    expect(replacement.jumpTo).toHaveBeenCalledWith(0, true)
  })

  it("restarts the active sentence with a newly selected voice", async () => {
    const locator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "Change voices.", locator },
    ])
    vi.mocked(api.setTtsVoiceForLanguage).mockResolvedValue({
      schemaVersion: 1,
      defaultEngine: { kind: "system" },
      profiles: [],
      voiceByLanguage: {
        en: { engine: "system", voiceId: "alternate" },
      },
      playback: {
        speed: 1,
        pitch: 1,
        skipPageBreaks: true,
        skipFootnotes: true,
        announceContext: false,
      },
    })
    const navigator = {
      currentLocator: locator,
      go: vi.fn(),
    } as unknown as EpubNavigator
    const navigatorRef = { current: navigator } as RefObject<EpubNavigator>
    const { result } = renderHook(() =>
      useEpubTtsSession({
        enabled: true,
        navigatorRef,
        resources: [{} as EpubTextResource],
        positions: [{} as ReaderLocator],
        currentLocator: locator,
        language: "en",
        highlightTint: "#ff00aa",
      }),
    )

    await waitFor(() => expect(speechInstances).toHaveLength(1))
    act(() => result.current.play())
    await waitFor(() => expect(result.current.state).toBe("playing"))

    act(() => result.current.setVoice("alternate"))

    await waitFor(() => expect(speechInstances).toHaveLength(2))
    expect(api.setTtsVoiceForLanguage).toHaveBeenCalledWith("en", {
      engine: "system",
      voiceId: "alternate",
    })
    const replacement = speechInstances[1] as {
      play: ReturnType<typeof vi.fn>
      jumpTo: ReturnType<typeof vi.fn>
    }
    await waitFor(() => expect(replacement.play).toHaveBeenCalledOnce())
    expect(replacement.jumpTo).toHaveBeenCalledWith(0, true)
  })

  it("does not restore a stale follow-text highlight after stop", async () => {
    const locator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "Read this sentence.", locator },
      { id: "sentence-2", plain: "Then stop.", locator },
    ])
    let followTextCallback: (() => void) | undefined
    const navigator = {
      currentLocator: locator,
      go: vi.fn(
        (_locator: Locator, _animated: boolean, callback: () => void) => {
          followTextCallback = callback
        },
      ),
    } as unknown as EpubNavigator
    const navigatorRef = { current: navigator } as RefObject<EpubNavigator>
    const resources = [{} as EpubTextResource]
    const positions = [{} as ReaderLocator]

    const { result } = renderHook(() =>
      useEpubTtsSession({
        enabled: true,
        navigatorRef,
        resources,
        positions,
        currentLocator: locator,
        language: "en",
        highlightTint: "#ff00aa",
      }),
    )

    await waitFor(() => expect(result.current.available).toBe(true))
    act(() => result.current.play())
    expect(applyEpubTtsHighlight).toHaveBeenCalledOnce()
    expect(followTextCallback).toBeTypeOf("function")

    act(() => result.current.stop())
    expect(clearEpubTtsHighlight).toHaveBeenCalled()

    const speech = speechInstances[0] as {
      emitSkip: (index: number) => void
    }
    act(() => followTextCallback?.())
    act(() => speech.emitSkip(1))
    expect(applyEpubTtsHighlight).toHaveBeenCalledOnce()
  })
})
