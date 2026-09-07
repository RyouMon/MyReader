import type { Locator } from "@my-reader/readium"
import { act, renderHook, waitFor } from "@testing-library/react-native"

import type { ReadiumReflowReaderRef } from "@/src/features/reader/components/reader/reflow/ReadiumReflowReader"
import {
  getTtsConfig,
  listTtsVoices,
  type MobileTtsConfig,
  setTtsVoice,
  synthesizeTts,
} from "@/src/services/core/tts"
import { useReaderTtsSession } from "./use-reader-tts-session"

jest.mock("@/src/services/core/tts", () => ({
  getTtsConfig: jest.fn(),
  listTtsVoices: jest.fn(),
  setTtsVoice: jest.fn(),
  synthesizeTts: jest.fn(),
}))

const playback = {
  speed: 1.2,
  pitch: 1,
  skipPageBreaks: true,
  skipFootnotes: false,
  announceContext: false,
}

const systemConfig: MobileTtsConfig = {
  schemaVersion: 1,
  defaultEngine: { kind: "system" },
  profiles: [],
  voices: [],
  playback,
}

function readerRef() {
  const reader: ReadiumReflowReaderRef & {
    reattachTtsViewport: jest.Mock<Promise<boolean>, [string, Locator, string]>
  } = {
    goTo: jest.fn(),
    clearSelection: jest.fn(),
    getBookmarkLocator: jest.fn(() => Promise.resolve(null)),
    isBookmarkVisible: jest.fn(() => Promise.resolve(false)),
    reattachTtsViewport: jest.fn<Promise<boolean>, [string, Locator, string]>(
      () => Promise.resolve(false),
    ),
    startTts: jest.fn(),
    playTts: jest.fn(),
    pauseTts: jest.fn(),
    stopTts: jest.fn(),
    previousTts: jest.fn(),
    nextTts: jest.fn(),
    completeTtsSynthesis: jest.fn(),
  }
  return { current: reader }
}

function lastSessionId(ref: ReturnType<typeof readerRef>): string {
  const sessionId = jest
    .mocked(ref.current.startTts)
    .mock.calls.at(-1)?.[2]?.sessionId
  if (!sessionId) throw new Error("Expected an active test session")
  return sessionId
}

describe("useReaderTtsSession", () => {
  beforeEach(() => {
    jest.clearAllMocks()
  })

  it("should start private system narration without requesting remote audio", async () => {
    jest.mocked(getTtsConfig).mockResolvedValue(systemConfig)
    const ref = readerRef()
    const startLocator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0.2 },
    } as Locator
    const { result } = renderHook(() =>
      useReaderTtsSession({
        enabled: true,
        publicationKey: "book-a",
        language: "zh-CN",
        highlightColor: "#C4622D",
        readerRef: ref,
      }),
    )

    await act(async () => {
      await result.current.start(startLocator)
    })

    expect(ref.current.startTts).toHaveBeenCalledWith(
      {
        kind: "system",
        language: "zh-cn",
        speed: 1.2,
        pitch: 1,
        highlightColor: "#C4622D",
      },
      startLocator,
      { sessionId: expect.any(String), startAtViewportStart: false },
    )
    expect(listTtsVoices).not.toHaveBeenCalled()
    expect(result.current.remote).toBe(false)
  })

  it("should report a native narration startup failure instead of staying loading", async () => {
    jest.mocked(getTtsConfig).mockResolvedValue(systemConfig)
    const ref = readerRef()
    const onError = jest.fn()
    jest
      .mocked(ref.current.startTts)
      .mockRejectedValueOnce(new Error("TTS_READER_VIEW_UNAVAILABLE"))
    const { result } = renderHook(() =>
      useReaderTtsSession({
        enabled: true,
        publicationKey: "book-a",
        language: "zh-CN",
        highlightColor: "#C4622D",
        readerRef: ref,
        onError,
      }),
    )

    await act(async () => result.current.start())

    expect(result.current.state).toMatchObject({
      state: "error",
      error: "TTS_READER_VIEW_UNAVAILABLE",
    })
    expect(onError).toHaveBeenCalledWith("TTS_READER_VIEW_UNAVAILABLE")
  })

  it("should keep the active session running when the viewport moves", async () => {
    jest.mocked(getTtsConfig).mockResolvedValue(systemConfig)
    const ref = readerRef()
    const pageLocator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0.2 },
    } as Locator
    const { result } = renderHook(() =>
      useReaderTtsSession({
        enabled: true,
        publicationKey: "book-a",
        language: "zh-CN",
        highlightColor: "#C4622D",
        readerRef: ref,
      }),
    )

    await act(async () => result.current.start(pageLocator))
    const sessionId = lastSessionId(ref)
    act(() => {
      result.current.handleStateChange({
        sessionId,
        state: "playing",
        locator: pageLocator,
      })
      result.current.markViewportMoved("navigation-1")
    })

    expect(result.current.state).toMatchObject({ sessionId, state: "playing" })
    expect(result.current.viewportDetached).toBe(true)
    expect(ref.current.startTts).toHaveBeenCalledTimes(1)
    expect(ref.current.stopTts).not.toHaveBeenCalled()
  })

  it("should hide the restart action when the user returns to the narrated page", async () => {
    jest.mocked(getTtsConfig).mockResolvedValue(systemConfig)
    const ref = readerRef()
    const narratedLocator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: {
        progression: 0.2,
        domRange: {
          start: { cssSelector: "p:nth-of-type(1)", textNodeIndex: 0 },
        },
      },
    } as Locator
    const { result } = renderHook(() =>
      useReaderTtsSession({
        enabled: true,
        publicationKey: "book-a",
        language: "zh-CN",
        highlightColor: "#C4622D",
        readerRef: ref,
      }),
    )

    await act(async () => result.current.start(narratedLocator))
    const sessionId = lastSessionId(ref)
    act(() => {
      result.current.handleStateChange({
        sessionId,
        state: "playing",
        locator: narratedLocator,
      })
      result.current.markViewportMoved("navigation-away")
    })
    await waitFor(() =>
      expect(ref.current.reattachTtsViewport).toHaveBeenCalledTimes(1),
    )
    expect(result.current.viewportDetached).toBe(true)

    jest.mocked(ref.current.reattachTtsViewport).mockResolvedValue(true)
    act(() => result.current.markViewportMoved("navigation-back"))

    await waitFor(() => expect(result.current.viewportDetached).toBe(false))
    expect(ref.current.reattachTtsViewport).toHaveBeenLastCalledWith(
      sessionId,
      narratedLocator,
      "navigation-back",
    )
    expect(ref.current.startTts).toHaveBeenCalledTimes(1)
  })

  it("should hide the restart action when narration reaches the open page", async () => {
    jest.mocked(getTtsConfig).mockResolvedValue(systemConfig)
    const ref = readerRef()
    const firstLocator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: {
        progression: 0.2,
        domRange: {
          start: { cssSelector: "p:nth-of-type(1)", textNodeIndex: 0 },
        },
      },
    } as Locator
    const openPageLocator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: {
        progression: 0.7,
        domRange: {
          start: { cssSelector: "p:nth-of-type(5)", textNodeIndex: 0 },
        },
      },
    } as Locator
    const { result } = renderHook(() =>
      useReaderTtsSession({
        enabled: true,
        publicationKey: "book-a",
        language: "zh-CN",
        highlightColor: "#C4622D",
        readerRef: ref,
      }),
    )

    await act(async () => result.current.start(firstLocator))
    const sessionId = lastSessionId(ref)
    act(() => {
      result.current.handleStateChange({
        sessionId,
        state: "playing",
        locator: firstLocator,
      })
      result.current.markViewportMoved("navigation-ahead")
    })
    await waitFor(() =>
      expect(ref.current.reattachTtsViewport).toHaveBeenCalledTimes(1),
    )
    expect(result.current.viewportDetached).toBe(true)

    jest.mocked(ref.current.reattachTtsViewport).mockResolvedValue(true)
    act(() => {
      result.current.handleStateChange({
        sessionId,
        state: "playing",
        locator: openPageLocator,
      })
    })

    await waitFor(() => expect(result.current.viewportDetached).toBe(false))
    expect(ref.current.reattachTtsViewport).toHaveBeenLastCalledWith(
      sessionId,
      openPageLocator,
      "navigation-ahead",
    )
    expect(ref.current.startTts).toHaveBeenCalledTimes(1)
  })

  it("should ignore a page match completed after a newer viewport move", async () => {
    jest.mocked(getTtsConfig).mockResolvedValue(systemConfig)
    const ref = readerRef()
    const locator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: {
        progression: 0.2,
        domRange: {
          start: { cssSelector: "p:nth-of-type(1)", textNodeIndex: 0 },
        },
      },
    } as Locator
    let resolveFirstMatch!: (matched: boolean) => void
    jest
      .mocked(ref.current.reattachTtsViewport)
      .mockReturnValueOnce(
        new Promise((resolve) => {
          resolveFirstMatch = resolve
        }),
      )
      .mockResolvedValue(false)
    const { result } = renderHook(() =>
      useReaderTtsSession({
        enabled: true,
        publicationKey: "book-a",
        language: "zh-CN",
        highlightColor: "#C4622D",
        readerRef: ref,
      }),
    )

    await act(async () => result.current.start(locator))
    const sessionId = lastSessionId(ref)
    act(() => {
      result.current.handleStateChange({
        sessionId,
        state: "playing",
        locator,
      })
      result.current.markViewportMoved("navigation-1")
    })
    await waitFor(() =>
      expect(ref.current.reattachTtsViewport).toHaveBeenCalledTimes(1),
    )

    act(() => result.current.markViewportMoved("navigation-2"))
    await waitFor(() =>
      expect(ref.current.reattachTtsViewport).toHaveBeenCalledTimes(2),
    )
    await act(async () => resolveFirstMatch(true))

    expect(result.current.viewportDetached).toBe(true)
  })

  it("should preserve the requested start when the viewport moves during setup", async () => {
    let resolveConfig!: (config: MobileTtsConfig) => void
    jest.mocked(getTtsConfig).mockReturnValue(
      new Promise((resolve) => {
        resolveConfig = resolve
      }),
    )
    const ref = readerRef()
    const requestedLocator = {
      href: "chapter-1.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0.2 },
    } as Locator
    const { result } = renderHook(() =>
      useReaderTtsSession({
        enabled: true,
        publicationKey: "book-a",
        language: "zh-CN",
        highlightColor: "#C4622D",
        readerRef: ref,
      }),
    )

    let pending!: Promise<void>
    act(() => {
      pending = result.current.start(requestedLocator, {
        startAtViewportStart: true,
      })
    })
    act(() => result.current.markViewportMoved("navigation-during-setup"))
    resolveConfig(systemConfig)
    await act(async () => pending)

    expect(ref.current.startTts).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "system" }),
      requestedLocator,
      {
        sessionId: expect.any(String),
        startAtViewportStart: false,
        viewportDetached: true,
        viewportNavigationId: "navigation-during-setup",
      },
    )
  })

  it("should explicitly restart after the first clipped viewport sentence", async () => {
    jest.mocked(getTtsConfig).mockResolvedValue(systemConfig)
    const ref = readerRef()
    const pageLocator = {
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0.8 },
    } as Locator
    const { result } = renderHook(() =>
      useReaderTtsSession({
        enabled: true,
        publicationKey: "book-a",
        language: "zh-CN",
        highlightColor: "#C4622D",
        readerRef: ref,
      }),
    )

    await act(async () => {
      await result.current.start(pageLocator, {
        startAtViewportStart: true,
        skipPartialViewportSentence: true,
      })
    })

    expect(ref.current.startTts).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "system" }),
      pageLocator,
      {
        sessionId: expect.any(String),
        startAtViewportStart: true,
        skipPartialViewportSentence: true,
      },
    )
  })

  it("should use the user-configured provider default before completing synthesis", async () => {
    const profile = {
      id: "openai",
      name: "OpenAI",
      kind: "openAiCompatible",
      enabled: true,
      endpoint: "https://api.openai.com/v1",
      model: "gpt-4o-mini-tts",
      responseFormat: "mp3",
      voices: ["reader-voice", "narrator-voice"],
      defaultVoice: "reader-voice",
      revision: 1,
      hasCredential: true,
    }
    const providerConfig: MobileTtsConfig = {
      ...systemConfig,
      defaultEngine: { kind: "provider", profileId: profile.id },
      profiles: [profile],
    }
    jest.mocked(getTtsConfig).mockResolvedValue(providerConfig)
    jest.mocked(synthesizeTts).mockResolvedValue({
      path: "/cache/tts/speech.mp3",
      mimeType: "audio/mpeg",
      timings: [],
    })
    const ref = readerRef()
    const { result } = renderHook(() =>
      useReaderTtsSession({
        enabled: true,
        publicationKey: "book-a",
        language: "zh-CN",
        highlightColor: "#C4622D",
        readerRef: ref,
      }),
    )

    await act(async () => {
      await result.current.start()
    })

    expect(listTtsVoices).not.toHaveBeenCalled()
    expect(setTtsVoice).not.toHaveBeenCalled()
    expect(result.current.remote).toBe(true)
    expect(ref.current.startTts).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: "provider",
        profileId: "openai",
        voiceId: "reader-voice",
      }),
      undefined,
      { sessionId: expect.any(String), startAtViewportStart: false },
    )

    const sessionId = lastSessionId(ref)

    await act(async () => {
      await result.current.handleSynthesisRequest({
        sessionId,
        requestId: "request-1",
        text: "你好",
        language: "zh-CN",
        profileId: "openai",
        voiceId: "reader-voice",
        speed: 1.2,
        pitch: 1.4,
      })
    })

    expect(synthesizeTts).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "openai",
        text: "你好",
        voiceId: "reader-voice",
        speed: 1.2,
        cachePolicy: "use",
      }),
      expect.objectContaining({ signal: expect.anything() }),
    )
    expect(jest.mocked(synthesizeTts).mock.calls[0]?.[0]).not.toHaveProperty(
      "pitch",
    )
    expect(ref.current.completeTtsSynthesis).toHaveBeenCalledWith({
      sessionId,
      requestId: "request-1",
      path: "/cache/tts/speech.mp3",
      mimeType: "audio/mpeg",
      timings: [],
    })
  })

  it("should abort a prefetched request when native navigation prunes it", async () => {
    const profile = {
      id: "openai",
      name: "OpenAI",
      kind: "openAiCompatible" as const,
      enabled: true,
      endpoint: "https://api.openai.com/v1",
      model: "gpt-4o-mini-tts",
      responseFormat: "mp3",
      voices: ["reader-voice"],
      defaultVoice: "reader-voice",
      revision: 1,
      hasCredential: true,
    }
    jest.mocked(getTtsConfig).mockResolvedValue({
      ...systemConfig,
      defaultEngine: { kind: "provider", profileId: profile.id },
      profiles: [profile],
    })
    const signals: AbortSignal[] = []
    jest.mocked(synthesizeTts).mockImplementation(
      (_request, options) =>
        new Promise((_resolve, reject) => {
          const signal = options?.signal
          if (!signal) return
          signals.push(signal)
          signal.addEventListener("abort", () => {
            const error = new Error("Aborted")
            error.name = "AbortError"
            reject(error)
          })
        }),
    )
    const ref = readerRef()
    const { result } = renderHook(() =>
      useReaderTtsSession({
        enabled: true,
        publicationKey: "book-a",
        language: "zh-CN",
        highlightColor: "#C4622D",
        readerRef: ref,
      }),
    )
    await act(async () => result.current.start())
    const sessionId = lastSessionId(ref)

    let pending!: Promise<void>
    act(() => {
      pending = result.current.handleSynthesisRequest({
        sessionId,
        requestId: "prefetch-2",
        text: "下一句",
        language: "zh-CN",
        profileId: "openai",
        voiceId: "reader-voice",
        speed: 1.2,
        pitch: 1,
      })
    })
    await waitFor(() => expect(signals).toHaveLength(1))

    act(() => {
      result.current.handleSynthesisCancel({
        sessionId,
        requestIds: ["prefetch-2"],
      })
    })
    await act(async () => pending)

    expect(signals[0]?.aborted).toBe(true)
    expect(ref.current.completeTtsSynthesis).not.toHaveBeenCalled()
  })

  it("should seek immediately with the active engine and preserve pause", async () => {
    const profile = {
      id: "openai",
      name: "OpenAI",
      kind: "openAiCompatible" as const,
      enabled: true,
      endpoint: "https://api.openai.com/v1",
      model: "gpt-4o-mini-tts",
      responseFormat: "mp3",
      voices: ["reader-voice"],
      defaultVoice: "reader-voice",
      revision: 1,
      hasCredential: true,
    }
    jest.mocked(getTtsConfig).mockResolvedValue({
      ...systemConfig,
      defaultEngine: { kind: "provider", profileId: profile.id },
      profiles: [profile],
    })
    let signal: AbortSignal | undefined
    jest.mocked(synthesizeTts).mockImplementation(
      (_request, options) =>
        new Promise((_resolve, reject) => {
          signal = options?.signal
          signal?.addEventListener("abort", () => {
            const error = new Error("Aborted")
            error.name = "AbortError"
            reject(error)
          })
        }),
    )
    const ref = readerRef()
    const { result } = renderHook(() =>
      useReaderTtsSession({
        enabled: true,
        publicationKey: "book-a",
        language: "zh-CN",
        highlightColor: "#C4622D",
        readerRef: ref,
      }),
    )
    await act(async () => result.current.start())
    const firstSessionId = lastSessionId(ref)
    let pending!: Promise<void>
    act(() => {
      pending = result.current.handleSynthesisRequest({
        sessionId: firstSessionId,
        requestId: "prefetch-old",
        text: "旧页面的下一句",
        language: "zh-CN",
        profileId: "openai",
        voiceId: "reader-voice",
        speed: 1.2,
        pitch: 1,
      })
    })
    await waitFor(() => expect(signal).toBeDefined())

    const nextPage = {
      href: "chapter-2.xhtml",
      type: "application/xhtml+xml",
      locations: { progression: 0.3 },
    } as Locator
    jest.mocked(getTtsConfig).mockClear()
    act(() => {
      result.current.seek(nextPage, {
        pauseAfterStart: true,
        startAtViewportStart: true,
      })
    })

    expect(signal?.aborted).toBe(true)
    expect(getTtsConfig).not.toHaveBeenCalled()
    expect(ref.current.startTts).toHaveBeenLastCalledWith(
      expect.objectContaining({
        kind: "provider",
        profileId: "openai",
        voiceId: "reader-voice",
      }),
      nextPage,
      { sessionId: expect.any(String), startAtViewportStart: true },
    )

    await act(async () => pending)
    const secondSessionId = lastSessionId(ref)
    act(() => {
      result.current.handleStateChange({
        sessionId: secondSessionId,
        state: "playing",
        locator: nextPage,
        utterance: "新页面的第一句",
      })
    })

    expect(ref.current.pauseTts).toHaveBeenCalledTimes(1)
    expect(ref.current.completeTtsSynthesis).not.toHaveBeenCalled()
  })

  it("should isolate playback lifecycle events across user navigation and stop", async () => {
    jest.mocked(getTtsConfig).mockResolvedValue(systemConfig)
    const ref = readerRef()
    const firstPage = {
      href: "chapter-1.xhtml",
      type: "application/xhtml+xml",
      locations: { position: 1, progression: 0 },
    } as Locator
    const secondPage = {
      href: "chapter-2.xhtml",
      type: "application/xhtml+xml",
      locations: { position: 2, progression: 0 },
    } as Locator
    const { result } = renderHook(() =>
      useReaderTtsSession({
        enabled: true,
        publicationKey: "book-a",
        language: "zh-CN",
        highlightColor: "#C4622D",
        readerRef: ref,
      }),
    )

    await act(async () => result.current.start(firstPage))
    const firstSessionId = lastSessionId(ref)
    expect(firstSessionId).toEqual(expect.any(String))

    act(() => {
      result.current.handleStateChange({
        sessionId: firstSessionId,
        state: "playing",
        locator: firstPage,
        utterance: "第一页",
      })
    })
    expect(result.current.state).toMatchObject({
      state: "playing",
      locator: firstPage,
    })

    act(() => {
      result.current.seek(secondPage, {
        navigationId: "navigation-1",
        startAtViewportStart: true,
      })
      result.current.seek(secondPage, {
        navigationId: "navigation-1",
        startAtViewportStart: true,
      })
    })

    expect(ref.current.startTts).toHaveBeenCalledTimes(2)
    const secondSessionId = lastSessionId(ref)
    expect(secondSessionId).toEqual(expect.any(String))
    expect(secondSessionId).not.toBe(firstSessionId)

    act(() => {
      result.current.handleStateChange({
        sessionId: firstSessionId,
        state: "playing",
        locator: firstPage,
        utterance: "旧会话回调",
      })
      result.current.handleStateChange({
        sessionId: firstSessionId,
        state: "ended",
      })
    })
    expect(result.current.state).toMatchObject({ state: "loading" })

    act(() => {
      result.current.handleStateChange({
        sessionId: secondSessionId,
        state: "playing",
        locator: secondPage,
        utterance: "新页面第一句",
      })
    })
    expect(result.current.state).toMatchObject({
      state: "playing",
      locator: secondPage,
      utterance: "新页面第一句",
    })

    act(() => {
      result.current.handleStateChange({
        sessionId: secondSessionId,
        state: "ended",
        locator: secondPage,
      })
      result.current.handleStateChange({
        sessionId: secondSessionId,
        state: "playing",
        locator: firstPage,
        utterance: "结束后的迟到回调",
      })
    })
    expect(result.current.state).toMatchObject({
      state: "ended",
      locator: secondPage,
    })

    act(() => {
      result.current.stop()
      result.current.handleStateChange({
        sessionId: secondSessionId,
        state: "playing",
        locator: secondPage,
        utterance: "停止后的旧回调",
      })
    })
    expect(result.current.state).toBeNull()
  })

  it("should scope navigation transactions to the current publication", async () => {
    jest.mocked(getTtsConfig).mockResolvedValue(systemConfig)
    const ref = readerRef()
    const { result, rerender } = renderHook(
      ({ publicationKey }: { publicationKey: string }) =>
        useReaderTtsSession({
          enabled: true,
          publicationKey,
          language: "zh-CN",
          highlightColor: "#C4622D",
          readerRef: ref,
        }),
      { initialProps: { publicationKey: "book-a" } },
    )

    await act(async () => {
      await result.current.start(undefined, {
        navigationId: "navigation-1",
      })
    })
    const firstSessionId = lastSessionId(ref)

    rerender({ publicationKey: "book-b" })
    await act(async () => {
      await result.current.start(undefined, {
        navigationId: "navigation-1",
      })
    })

    const secondSessionId = lastSessionId(ref)
    expect(ref.current.startTts).toHaveBeenCalledTimes(2)
    expect(firstSessionId).toMatch(/^book-a:/)
    expect(secondSessionId).toMatch(/^book-b:/)
  })

  it("should report a playback failure once and not let a later ended event hide it", async () => {
    jest.mocked(getTtsConfig).mockResolvedValue(systemConfig)
    const ref = readerRef()
    const onError = jest.fn()
    const { result } = renderHook(() =>
      useReaderTtsSession({
        enabled: true,
        publicationKey: "book-a",
        language: "zh-CN",
        highlightColor: "#C4622D",
        readerRef: ref,
        onError,
      }),
    )
    await act(async () => result.current.start())
    const firstSessionId = lastSessionId(ref)

    act(() => {
      result.current.handleStateChange({
        sessionId: firstSessionId,
        state: "error",
        error: "Connection refused",
      })
      result.current.handleStateChange({
        sessionId: firstSessionId,
        state: "ended",
      })
    })

    expect(result.current.state).toMatchObject({
      state: "error",
      error: "Connection refused",
    })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith("Connection refused")

    await act(async () => result.current.start())
    const secondSessionId = lastSessionId(ref)
    act(() => {
      result.current.handleStateChange({
        sessionId: secondSessionId,
        state: "error",
        error: "Connection refused",
      })
    })

    expect(onError).toHaveBeenCalledTimes(2)
  })

  it("should explain when a narration attempt ends before any text can play", async () => {
    jest.mocked(getTtsConfig).mockResolvedValue(systemConfig)
    const ref = readerRef()
    const onError = jest.fn()
    const { result } = renderHook(() =>
      useReaderTtsSession({
        enabled: true,
        publicationKey: "book-a",
        language: "zh-CN",
        highlightColor: "#C4622D",
        readerRef: ref,
        onError,
      }),
    )
    await act(async () => result.current.start())
    const sessionId = lastSessionId(ref)

    act(() => {
      result.current.handleStateChange({ sessionId, state: "ended" })
    })

    expect(result.current.state).toMatchObject({
      state: "error",
      error: "TTS_NO_READABLE_CONTENT_FROM_POSITION",
    })
    expect(onError).toHaveBeenCalledWith(
      "TTS_NO_READABLE_CONTENT_FROM_POSITION",
    )
  })
})
