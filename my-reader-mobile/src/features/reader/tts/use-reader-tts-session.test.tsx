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
  const reader: ReadiumReflowReaderRef = {
    goTo: jest.fn(),
    clearSelection: jest.fn(),
    getBookmarkLocator: jest.fn(() => Promise.resolve(null)),
    isBookmarkVisible: jest.fn(() => Promise.resolve(false)),
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
    )
    expect(listTtsVoices).not.toHaveBeenCalled()
    expect(result.current.remote).toBe(false)
  })

  it("should resolve a page turn from the first visible sentence", async () => {
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
      })
    })

    expect(ref.current.startTts).toHaveBeenCalledWith(
      expect.objectContaining({ kind: "system" }),
      pageLocator,
      { startAtViewportStart: true },
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
    )

    await act(async () => {
      await result.current.handleSynthesisRequest({
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

    let pending!: Promise<void>
    act(() => {
      pending = result.current.handleSynthesisRequest({
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
      result.current.handleSynthesisCancel({ requestIds: ["prefetch-2"] })
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
    let pending!: Promise<void>
    act(() => {
      pending = result.current.handleSynthesisRequest({
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
      { startAtViewportStart: true },
    )

    await act(async () => pending)
    act(() => {
      result.current.handleStateChange({
        state: "playing",
        locator: nextPage,
        utterance: "新页面的第一句",
      })
    })

    expect(ref.current.pauseTts).toHaveBeenCalledTimes(1)
    expect(ref.current.completeTtsSynthesis).not.toHaveBeenCalled()
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

    act(() => {
      result.current.handleStateChange({
        state: "error",
        error: "Connection refused",
      })
      result.current.handleStateChange({ state: "ended" })
    })

    expect(result.current.state).toEqual({
      state: "error",
      error: "Connection refused",
    })
    expect(onError).toHaveBeenCalledTimes(1)
    expect(onError).toHaveBeenCalledWith("Connection refused")

    await act(async () => result.current.start())
    act(() => {
      result.current.handleStateChange({
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

    act(() => {
      result.current.handleStateChange({ state: "ended" })
    })

    expect(result.current.state).toEqual({
      state: "error",
      error: "TTS_NO_READABLE_CONTENT_FROM_POSITION",
    })
    expect(onError).toHaveBeenCalledWith(
      "TTS_NO_READABLE_CONTENT_FROM_POSITION",
    )
  })
})
