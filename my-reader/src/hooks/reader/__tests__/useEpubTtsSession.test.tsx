import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { EpubNavigator } from "@readium/navigator"
import { Locator, LocatorLocations, LocatorText } from "@readium/shared"
import { act, renderHook, waitFor } from "@testing-library/react"
import type { RefObject } from "react"
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { useEpubTtsSession } from "@/hooks/reader/useEpubTtsSession"
import type { EpubTextResource } from "@/lib/readium/epubContentLocators"
import {
  epubTtsPlaybackPlanAtLocator,
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
const ttsLocatorMocks = vi.hoisted(() => {
  const indexAtLocator = vi.fn().mockReturnValue(0)
  const playbackPlanAtLocator = vi.fn(
    (utterances: Array<{ id?: string }>, locator: Locator) => {
      const index = indexAtLocator(utterances, locator)
      return index < 0 ? null : { index, utterances }
    },
  )
  return { indexAtLocator, playbackPlanAtLocator }
})

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

    loadContent = vi.fn((content: Array<{ id?: string }>) => {
      this.content = content
      this.state = "ready"
      this.emit("ready")
    })

    getContentQueue() {
      return [...this.content]
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

    pause = vi.fn(() => {
      this.state = "paused"
      this.emit("pause")
    })

    stop = vi.fn(() => {
      this.state = "idle"
      this.emit("stop")
    })

    previous = vi.fn(() => false)
    next = vi.fn(() => false)

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

    emitError() {
      this.state = "error"
      this.emit("error")
    }

    emitEnd(index: number, state: "idle" | "playing") {
      this.currentIndex = index
      this.state = state
      this.emit("end")
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
  epubTtsPlaybackPlanAtLocator: ttsLocatorMocks.playbackPlanAtLocator,
  epubTtsUtteranceIndexAtLocator: ttsLocatorMocks.indexAtLocator,
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
  vi.mocked(epubTtsPlaybackPlanAtLocator).mockImplementation(
    (utterances, locator) => {
      const index = vi.mocked(epubTtsUtteranceIndexAtLocator)(
        utterances,
        locator,
      )
      return index < 0 ? null : { index, utterances }
    },
  )
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
  document.body.replaceChildren()
  Reflect.deleteProperty(Range.prototype, "getClientRects")
  vi.restoreAllMocks()
})

describe("useEpubTtsSession", () => {
  it.each([
    "cleared",
    "replaced",
  ])("cleans up the original navigator after its ref is %s", async (refChange) => {
    const locator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "Read this sentence.", locator },
    ])
    const navigator = {
      currentLocator: locator,
      go: vi.fn(),
    } as unknown as EpubNavigator
    const replacement = { ...navigator } as EpubNavigator
    const navigatorRef = { current: navigator as EpubNavigator | null }
    const resources = [{} as EpubTextResource]
    const positions = [{} as ReaderLocator]
    const { result, unmount } = renderHook(() =>
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
    expect(applyEpubTtsHighlight).toHaveBeenCalledWith(
      navigator,
      locator,
      "#ff00aa",
    )

    navigatorRef.current = refChange === "cleared" ? null : replacement
    unmount()

    expect(clearEpubTtsHighlight).toHaveBeenCalledOnce()
    expect(vi.mocked(clearEpubTtsHighlight).mock.calls[0]?.[0]).toBe(navigator)
  })

  it("uses the exact locator plan for play and read-from entry points", async () => {
    const sentenceLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    const visibleLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.4 }),
    })
    const sentence = {
      id: "sentence-1",
      plain: "Hidden prefix and visible suffix.",
      locator: sentenceLocator,
    }
    const visibleSuffix = {
      ...sentence,
      plain: "visible suffix.",
      locator: visibleLocator,
    }
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([sentence])
    vi.mocked(epubTtsPlaybackPlanAtLocator).mockReturnValue({
      index: 0,
      utterances: [visibleSuffix],
    })
    const navigatorRef = {
      current: {
        currentLocator: sentenceLocator,
        go: vi.fn(),
      } as unknown as EpubNavigator,
    } as RefObject<EpubNavigator>
    const { result } = renderHook(() =>
      useEpubTtsSession({
        enabled: true,
        navigatorRef,
        resources: [{} as EpubTextResource],
        positions: [{} as ReaderLocator],
        currentLocator: sentenceLocator,
        language: "en",
        highlightTint: "#ff00aa",
      }),
    )

    await waitFor(() => expect(speechInstances).toHaveLength(1))
    const speech = speechInstances[0] as {
      loadContent: ReturnType<typeof vi.fn>
    }

    act(() => result.current.play(visibleLocator))

    expect(epubTtsPlaybackPlanAtLocator).toHaveBeenLastCalledWith(
      [sentence],
      visibleLocator,
    )
    expect(speech.loadContent).toHaveBeenLastCalledWith([visibleSuffix])
    expect(result.current.currentUtterance).toBe(visibleSuffix)

    act(() => result.current.stop())
    act(() => result.current.readFrom(visibleLocator))

    expect(speech.loadContent).toHaveBeenLastCalledWith([visibleSuffix])
    expect(result.current.currentUtterance).toBe(visibleSuffix)
  })

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

  it("automatically follows narration when the next sentence is on another page", async () => {
    const firstLocator = new Locator({
      href: "chapter-1.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.9 }),
    })
    const nextPageLocator = new Locator({
      href: "chapter-2.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      {
        id: "sentence-1",
        plain: "End of the first page.",
        locator: firstLocator,
      },
      {
        id: "sentence-2",
        plain: "Start of the next page.",
        locator: nextPageLocator,
      },
    ])
    const navigatorRef = {
      current: {
        currentLocator: firstLocator,
        go: vi.fn(),
      } as unknown as EpubNavigator,
    } as RefObject<EpubNavigator>
    const { result } = renderHook(() =>
      useEpubTtsSession({
        enabled: true,
        navigatorRef,
        resources: [{} as EpubTextResource],
        positions: [{} as ReaderLocator],
        currentLocator: firstLocator,
        language: "en",
        highlightTint: "#ff00aa",
      }),
    )

    await waitFor(() => expect(speechInstances).toHaveLength(1))
    const speech = speechInstances[0] as {
      emitStart: (index: number) => void
    }
    const navigator = navigatorRef.current as EpubNavigator & {
      go: ReturnType<typeof vi.fn>
    }
    act(() => result.current.play())
    navigator.go.mockClear()

    act(() => speech.emitStart(1))

    expect(result.current.state).toBe("playing")
    expect(result.current.viewportDetached).toBe(false)
    expect(navigator.go).toHaveBeenCalledOnce()
    expect(navigator.go).toHaveBeenCalledWith(
      nextPageLocator,
      false,
      expect.any(Function),
    )
  })

  it("does not navigate again when the narrated sentence is already visible", async () => {
    const firstLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    const visibleLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.3 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      {
        id: "sentence-1",
        plain: "First visible sentence.",
        locator: firstLocator,
      },
      {
        id: "sentence-2",
        plain: "Second visible sentence.",
        locator: visibleLocator,
      },
    ])
    const navigator = {
      currentLocator: firstLocator,
      go: vi.fn(),
      viewport: {
        readingOrder: ["chapter.xhtml"],
        progressions: new Map([["chapter.xhtml", { start: 0.1, end: 0.4 }]]),
        positions: null,
      },
    } as unknown as EpubNavigator
    const navigatorRef = { current: navigator } as RefObject<EpubNavigator>
    const { result } = renderHook(() =>
      useEpubTtsSession({
        enabled: true,
        navigatorRef,
        resources: [{} as EpubTextResource],
        positions: [{} as ReaderLocator],
        currentLocator: firstLocator,
        language: "en",
        highlightTint: "#ff00aa",
      }),
    )

    await waitFor(() => expect(speechInstances).toHaveLength(1))
    const speech = speechInstances[0] as {
      emitStart: (index: number) => void
    }
    act(() => result.current.play())
    vi.mocked(navigator.go).mockClear()

    act(() => speech.emitStart(1))

    expect(result.current.currentUtterance?.id).toBe("sentence-2")
    expect(navigator.go).not.toHaveBeenCalled()
  })

  it("keeps the active session running when the viewport moves", async () => {
    const locator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    const nextLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.4 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "Keep reading.", locator },
      { id: "sentence-2", plain: "Still reading.", locator: nextLocator },
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
      stop: ReturnType<typeof vi.fn>
      emitStart: (index: number) => void
    }
    const navigator = navigatorRef.current as EpubNavigator & {
      go: ReturnType<typeof vi.fn>
    }
    act(() => result.current.play())
    act(() => speech.emitStart(0))
    speech.jumpTo.mockClear()
    speech.stop.mockClear()
    navigator.go.mockClear()

    act(() => {
      result.current.markViewportMoved("navigation-1")
      speech.emitStart(1)
    })

    expect(result.current.state).toBe("playing")
    expect(result.current.viewportDetached).toBe(true)
    expect(speech.jumpTo).not.toHaveBeenCalled()
    expect(speech.stop).not.toHaveBeenCalled()
    expect(navigator.go).not.toHaveBeenCalled()
  })

  it("does not reattach the first manual page turn to a stale viewport", async () => {
    const locator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    const nextPageLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.5 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "Keep reading.", locator },
    ])
    let navigatorCurrentLocator = locator
    const navigatorRef = {
      current: {
        get currentLocator() {
          return navigatorCurrentLocator
        },
        go: vi.fn(),
        viewport: {
          readingOrder: ["chapter.xhtml"],
          progressions: new Map([["chapter.xhtml", { start: 0.1, end: 0.3 }]]),
          positions: null,
        },
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
      emitStart: (index: number) => void
    }
    act(() => result.current.play())
    act(() => result.current.markViewportMoved("navigation-1", "begin"))
    navigatorCurrentLocator = nextPageLocator
    act(() => result.current.markViewportMoved("navigation-1", "complete"))
    act(() => speech.emitStart(0))

    expect(result.current.state).toBe("playing")
    expect(result.current.viewportDetached).toBe(true)
  })

  it("does not reattach while user navigation is still in progress", async () => {
    const firstLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    const nextLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.25 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "Keep reading.", locator: firstLocator },
      { id: "sentence-2", plain: "Still visible.", locator: nextLocator },
    ])
    const navigatorRef = {
      current: {
        currentLocator: firstLocator,
        go: vi.fn(),
        viewport: {
          readingOrder: ["chapter.xhtml"],
          progressions: new Map([["chapter.xhtml", { start: 0.1, end: 0.3 }]]),
          positions: null,
        },
      } as unknown as EpubNavigator,
    } as RefObject<EpubNavigator>
    const { result } = renderHook(() =>
      useEpubTtsSession({
        enabled: true,
        navigatorRef,
        resources: [{} as EpubTextResource],
        positions: [{} as ReaderLocator],
        currentLocator: firstLocator,
        language: "en",
        highlightTint: "#ff00aa",
      }),
    )

    await waitFor(() => expect(speechInstances).toHaveLength(1))
    const speech = speechInstances[0] as {
      emitStart: (index: number) => void
    }
    act(() => result.current.play())
    vi.mocked(applyEpubTtsHighlight).mockClear()
    act(() => result.current.markViewportMoved("navigation-1", "begin"))

    act(() => speech.emitStart(1))

    expect(result.current.viewportDetached).toBe(true)
    expect(result.current.currentUtterance?.id).toBe("sentence-2")
    expect(applyEpubTtsHighlight).not.toHaveBeenCalled()

    act(() => result.current.markViewportMoved("navigation-1", "complete"))

    expect(result.current.viewportDetached).toBe(false)
  })

  it("preserves playing and paused controls across viewport navigation", async () => {
    const locator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "Keep reading.", locator },
    ])
    const progressions = new Map([["chapter.xhtml", { start: 0.6, end: 0.8 }]])
    const go = vi.fn(
      (
        _locator: Locator,
        _animated: boolean,
        callback: (ok: boolean) => void,
      ) => {
        progressions.set("chapter.xhtml", { start: 0.1, end: 0.3 })
        callback(true)
      },
    )
    const navigatorRef = {
      current: {
        currentLocator: locator,
        go,
        viewport: {
          readingOrder: ["chapter.xhtml"],
          progressions,
          positions: null,
        },
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
      play: ReturnType<typeof vi.fn>
      pause: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
      previous: ReturnType<typeof vi.fn>
      next: ReturnType<typeof vi.fn>
    }

    act(() => result.current.play())
    act(() => {
      result.current.next()
      result.current.previous()
      progressions.set("chapter.xhtml", { start: 0.6, end: 0.8 })
      result.current.markViewportMoved("playing-navigation")
      result.current.next()
      result.current.previous()
    })
    expect(result.current.state).toBe("playing")
    expect(result.current.viewportDetached).toBe(true)
    expect(result.current.viewportOriginLocator).toBe(locator)
    expect(speech.next).toHaveBeenCalledTimes(2)
    expect(speech.previous).toHaveBeenCalledTimes(2)

    act(() => result.current.goToCurrent())
    expect(result.current.state).toBe("playing")
    expect(result.current.viewportDetached).toBe(false)
    expect(result.current.viewportOriginLocator).toBeNull()

    act(() => result.current.pause())
    act(() => {
      result.current.next()
      result.current.previous()
      progressions.set("chapter.xhtml", { start: 0.6, end: 0.8 })
      result.current.markViewportMoved("paused-navigation")
      result.current.next()
      result.current.previous()
    })
    expect(result.current.state).toBe("paused")
    expect(result.current.viewportDetached).toBe(true)
    expect(result.current.viewportOriginLocator).toBe(locator)
    expect(speech.next).toHaveBeenCalledTimes(4)
    expect(speech.previous).toHaveBeenCalledTimes(4)

    act(() => result.current.goToCurrent())
    expect(result.current.state).toBe("paused")
    expect(result.current.viewportDetached).toBe(false)
    expect(result.current.viewportOriginLocator).toBeNull()

    act(() => result.current.play())
    expect(result.current.state).toBe("playing")
    act(() => result.current.pause())
    expect(result.current.state).toBe("paused")
    act(() => result.current.stop())
    expect(result.current.state).toBe("idle")
    expect(result.current.viewportDetached).toBe(false)
    expect(speech.stop).toHaveBeenCalledOnce()
  })

  it("reattaches when the user turns back to the page being narrated", async () => {
    const locator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "Current sentence.", locator },
    ])
    const progressions = new Map([["chapter.xhtml", { start: 0.6, end: 0.8 }]])
    const navigatorRef = {
      current: {
        currentLocator: locator,
        go: vi.fn(),
        viewport: {
          readingOrder: ["chapter.xhtml"],
          progressions,
          positions: null,
        },
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
    act(() => result.current.play())
    act(() => result.current.markViewportMoved("navigation-away"))
    expect(result.current.viewportDetached).toBe(true)

    progressions.set("chapter.xhtml", { start: 0.1, end: 0.3 })
    act(() => result.current.markViewportMoved("navigation-back"))

    expect(result.current.viewportDetached).toBe(false)
  })

  it("returns to the narrated locator without moving the speech cursor", async () => {
    const locator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "Current sentence.", locator },
    ])
    const progressions = new Map([["chapter.xhtml", { start: 0.6, end: 0.8 }]])
    const go = vi.fn(
      (
        _locator: Locator,
        _animated: boolean,
        callback: (ok: boolean) => void,
      ) => {
        callback(true)
      },
    )
    const navigatorRef = {
      current: {
        currentLocator: locator,
        go,
        viewport: {
          readingOrder: ["chapter.xhtml"],
          progressions,
          positions: null,
        },
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
      stop: ReturnType<typeof vi.fn>
      emitStart: (index: number) => void
    }
    act(() => result.current.play())
    act(() => speech.emitStart(0))
    progressions.set("chapter.xhtml", { start: 0.6, end: 0.8 })
    act(() => result.current.markViewportMoved("navigation-away"))
    expect(result.current.viewportDetached).toBe(true)
    speech.jumpTo.mockClear()
    speech.stop.mockClear()

    act(() => result.current.goToCurrent())

    expect(go).toHaveBeenCalledWith(locator, false, expect.any(Function))
    expect(result.current.viewportDetached).toBe(false)
    expect(result.current.state).toBe("playing")
    expect(speech.jumpTo).not.toHaveBeenCalled()
    expect(speech.stop).not.toHaveBeenCalled()
    expect(applyEpubTtsHighlight).toHaveBeenCalledWith(
      navigatorRef.current,
      locator,
      "#ff00aa",
    )
  })

  it("reattaches when narration reaches the page left open by the user", async () => {
    const firstLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    const visibleLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.7 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "Earlier sentence.", locator: firstLocator },
      { id: "sentence-2", plain: "Visible sentence.", locator: visibleLocator },
    ])
    const progressions = new Map([["chapter.xhtml", { start: 0.4, end: 0.5 }]])
    const navigatorRef = {
      current: {
        currentLocator: firstLocator,
        go: vi.fn(),
        viewport: {
          readingOrder: ["chapter.xhtml"],
          progressions,
          positions: null,
        },
      } as unknown as EpubNavigator,
    } as RefObject<EpubNavigator>
    const { result } = renderHook(() =>
      useEpubTtsSession({
        enabled: true,
        navigatorRef,
        resources: [{} as EpubTextResource],
        positions: [{} as ReaderLocator],
        currentLocator: firstLocator,
        language: "en",
        highlightTint: "#ff00aa",
      }),
    )

    await waitFor(() => expect(speechInstances).toHaveLength(1))
    const speech = speechInstances[0] as {
      emitStart: (index: number) => void
    }
    const navigator = navigatorRef.current as EpubNavigator & {
      go: ReturnType<typeof vi.fn>
    }
    act(() => result.current.play())
    act(() => result.current.markViewportMoved("navigation-away"))
    expect(result.current.viewportDetached).toBe(true)
    navigator.go.mockClear()

    progressions.set("chapter.xhtml", { start: 0.65, end: 0.8 })
    act(() => speech.emitStart(1))

    expect(result.current.currentUtterance?.id).toBe("sentence-2")
    expect(result.current.viewportDetached).toBe(false)
    expect(navigator.go).not.toHaveBeenCalled()
  })

  it("reattaches on the visible tail of a sentence that began on the previous page", async () => {
    document.body.innerHTML =
      '<p id="cross-page">Hidden sentence prefix continues on this page.</p>'
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () =>
        [
          {
            left: 10,
            top: 10,
            right: 110,
            bottom: 30,
          },
        ] as unknown as DOMRectList,
    })
    const firstLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.1 }),
    })
    const crossPageLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({
        progression: 0.3,
        otherLocations: new Map<string, unknown>([
          ["cssSelector", "#cross-page"],
        ]),
      }),
      text: new LocatorText({
        highlight: "Hidden sentence prefix continues on this page.",
      }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "Earlier sentence.", locator: firstLocator },
      {
        id: "sentence-2",
        plain: "Hidden sentence prefix continues on this page.",
        locator: crossPageLocator,
      },
    ])
    const progressions = new Map([["chapter.xhtml", { start: 0.5, end: 0.7 }]])
    const navigatorRef = {
      current: {
        currentLocator: new Locator({
          href: "chapter.xhtml",
          type: "application/xhtml+xml",
          locations: new LocatorLocations({ progression: 0.5 }),
        }),
        go: vi.fn(),
        viewport: {
          readingOrder: ["chapter.xhtml"],
          progressions,
          positions: null,
        },
        _cframes: [{ iframe: { contentWindow: window } }],
      } as unknown as EpubNavigator,
    } as RefObject<EpubNavigator>
    const { result } = renderHook(() =>
      useEpubTtsSession({
        enabled: true,
        navigatorRef,
        resources: [{} as EpubTextResource],
        positions: [{} as ReaderLocator],
        currentLocator: firstLocator,
        language: "en",
        highlightTint: "#ff00aa",
      }),
    )

    await waitFor(() => expect(speechInstances).toHaveLength(1))
    const speech = speechInstances[0] as {
      emitStart: (index: number) => void
    }
    act(() => result.current.play())
    act(() => result.current.markViewportMoved("navigation-away"))
    expect(result.current.viewportDetached).toBe(true)

    act(() => speech.emitStart(1))

    expect(result.current.currentUtterance?.id).toBe("sentence-2")
    expect(result.current.viewportDetached).toBe(false)
  })

  it("stays attached when a manual page turn reveals the active sentence tail", async () => {
    document.body.innerHTML =
      '<p id="cross-page">Previous-page prefix continues on this page.</p>'
    Object.defineProperty(Range.prototype, "getClientRects", {
      configurable: true,
      value: () =>
        [
          {
            left: 10,
            top: 10,
            right: 110,
            bottom: 30,
          },
        ] as unknown as DOMRectList,
    })
    const crossPageLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({
        progression: 0.3,
        otherLocations: new Map<string, unknown>([
          ["cssSelector", "#cross-page"],
        ]),
      }),
      text: new LocatorText({
        highlight: "Previous-page prefix continues on this page.",
      }),
    })
    const nextPageLocator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.5 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      {
        id: "sentence-1",
        plain: "Previous-page prefix continues on this page.",
        locator: crossPageLocator,
      },
    ])
    let navigatorCurrentLocator = crossPageLocator
    const navigatorRef = {
      current: {
        get currentLocator() {
          return navigatorCurrentLocator
        },
        go: vi.fn(),
        viewport: {
          readingOrder: ["chapter.xhtml"],
          progressions: new Map([["chapter.xhtml", { start: 0.5, end: 0.7 }]]),
          positions: null,
        },
        _cframes: [{ iframe: { contentWindow: window } }],
      } as unknown as EpubNavigator,
    } as RefObject<EpubNavigator>
    const { result } = renderHook(() =>
      useEpubTtsSession({
        enabled: true,
        navigatorRef,
        resources: [{} as EpubTextResource],
        positions: [{} as ReaderLocator],
        currentLocator: crossPageLocator,
        language: "en",
        highlightTint: "#ff00aa",
      }),
    )

    await waitFor(() => expect(speechInstances).toHaveLength(1))
    act(() => result.current.play())
    act(() => result.current.markViewportMoved("navigation-1", "begin"))
    navigatorCurrentLocator = nextPageLocator
    act(() => result.current.markViewportMoved("navigation-1", "complete"))

    expect(result.current.viewportDetached).toBe(false)
  })

  it("restarts at the exact visible character after an explicit request", async () => {
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
      pause: ReturnType<typeof vi.fn>
      jumpTo: ReturnType<typeof vi.fn>
    }
    act(() => result.current.play())
    act(() => result.current.pause())
    expect(result.current.state).toBe("paused")
    speech.jumpTo.mockClear()
    speech.pause.mockClear()
    act(() => result.current.markViewportMoved("navigation-1"))
    expect(result.current.viewportDetached).toBe(true)

    act(() =>
      result.current.rebase(locator, {
        autoplay: true,
        forceRestart: true,
      }),
    )

    expect(epubTtsPlaybackPlanAtLocator).toHaveBeenCalledWith(
      expect.any(Array),
      locator,
    )
    expect(speech.jumpTo).not.toHaveBeenCalled()
    expect(speech.pause).not.toHaveBeenCalled()
    expect(result.current.state).toBe("playing")
    expect(result.current.viewportDetached).toBe(false)
  })

  it("preserves pause across a page rebase and ignores its duplicate navigation", async () => {
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
    const navigatorRef = {
      current: {
        currentLocator: firstLocator,
        go: vi.fn(),
      } as unknown as EpubNavigator,
    } as RefObject<EpubNavigator>
    const { result } = renderHook(() =>
      useEpubTtsSession({
        enabled: true,
        navigatorRef,
        resources: [{} as EpubTextResource],
        positions: [{} as ReaderLocator],
        currentLocator: firstLocator,
        language: "en",
        highlightTint: "#ff00aa",
      }),
    )

    await waitFor(() => expect(speechInstances).toHaveLength(1))
    const speech = speechInstances[0] as {
      pause: ReturnType<typeof vi.fn>
      stop: ReturnType<typeof vi.fn>
      jumpTo: ReturnType<typeof vi.fn>
      emitStart: (index: number) => void
    }
    act(() => result.current.play())
    act(() => result.current.pause())
    expect(result.current.state).toBe("paused")

    act(() =>
      result.current.rebase(secondLocator, {
        navigationId: "navigation-1",
      }),
    )
    act(() => speech.emitStart(1))
    expect(result.current.state).toBe("paused")
    expect(speech.pause).toHaveBeenCalledTimes(2)

    speech.stop.mockClear()
    speech.jumpTo.mockClear()
    act(() =>
      result.current.rebase(secondLocator, {
        forceRestart: true,
        navigationId: "navigation-1",
      }),
    )
    expect(speech.stop).not.toHaveBeenCalled()
    expect(speech.jumpTo).not.toHaveBeenCalled()
    expect(result.current.state).toBe("paused")
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

  it("keeps the session active between utterances and rejects callbacks after the final end", async () => {
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
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "First sentence.", locator: firstLocator },
      { id: "sentence-2", plain: "Second sentence.", locator: secondLocator },
    ])
    const navigatorRef = {
      current: {
        currentLocator: firstLocator,
        go: vi.fn(),
      } as unknown as EpubNavigator,
    } as RefObject<EpubNavigator>
    const { result } = renderHook(() =>
      useEpubTtsSession({
        enabled: true,
        navigatorRef,
        resources: [{} as EpubTextResource],
        positions: [{} as ReaderLocator],
        currentLocator: firstLocator,
        language: "en",
        highlightTint: "#ff00aa",
      }),
    )

    await waitFor(() => expect(speechInstances).toHaveLength(1))
    const speech = speechInstances[0] as {
      emitStart: (index: number) => void
      emitEnd: (index: number, state: "idle" | "playing") => void
    }
    act(() => result.current.play())
    act(() => speech.emitEnd(0, "playing"))
    expect(result.current.state).toBe("playing")

    act(() => speech.emitStart(1))
    expect(result.current.currentUtterance?.id).toBe("sentence-2")
    act(() => speech.emitEnd(1, "idle"))
    expect(result.current.state).toBe("ended")

    act(() => speech.emitStart(0))
    expect(result.current.state).toBe("ended")
    expect(result.current.currentUtterance?.id).toBe("sentence-2")
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
    expect(replacement.jumpTo).not.toHaveBeenCalled()
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
    expect(replacement.jumpTo).not.toHaveBeenCalled()
  })

  it("ignores a playback failure after stop and allows a fresh start", async () => {
    const locator = new Locator({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: new LocatorLocations({ progression: 0.2 }),
    })
    vi.mocked(extractEpubTtsUtterances).mockReturnValue([
      { id: "sentence-1", plain: "Read again.", locator },
    ])
    const navigatorRef = {
      current: {
        currentLocator: locator,
        go: vi.fn(),
      } as unknown as EpubNavigator,
    }
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
    act(() => result.current.stop())

    const speech = speechInstances[0] as { emitError: () => void }
    act(() => speech.emitError())
    expect(result.current.state).toBe("idle")
    expect(result.current.error).toBeNull()

    act(() => result.current.play())
    expect(result.current.state).toBe("playing")
    expect(result.current.error).toBeNull()
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
