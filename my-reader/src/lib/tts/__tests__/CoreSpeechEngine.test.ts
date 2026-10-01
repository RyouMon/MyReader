import { describe, expect, it, vi } from "vitest"
import type { TtsAudioArtifactDto } from "@/lib/tauri-specta"
import { CoreSpeechEngine, type TtsAudio } from "@/lib/tts/CoreSpeechEngine"

class FakeAudio implements TtsAudio {
  src = ""
  currentTime = 0
  playbackRate = 1
  volume = 1
  play = vi.fn(async () => {})
  pause = vi.fn()
  private listeners = new Map<string, Set<() => void>>()

  addEventListener(event: "ended" | "error", listener: () => void) {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(listener)
    this.listeners.set(event, listeners)
  }

  removeEventListener(event: "ended" | "error", listener: () => void) {
    this.listeners.get(event)?.delete(listener)
  }

  dispatch(event: "ended" | "error") {
    this.listeners.get(event)?.forEach((listener) => {
      listener()
    })
  }
}

function artifact(path: string): TtsAudioArtifactDto {
  return {
    path,
    mimeType: "audio/mpeg",
    durationMs: null,
    timings: [],
    cacheKey: null,
  }
}

function deferred<T>() {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise
  })
  return { promise, resolve }
}

async function flushPromises() {
  await Promise.resolve()
  await Promise.resolve()
}

describe("CoreSpeechEngine", () => {
  it("synthesizes and plays the active Readium utterance", async () => {
    const audio = new FakeAudio()
    const synthesize = vi.fn(async () => artifact("/cache/one.mp3"))
    const engine = new CoreSpeechEngine("provider", {
      synthesize,
      listVoices: async () => [
        { id: "voice", name: "Voice", language: "en", gender: null },
      ],
      createAudio: () => audio,
      audioSource: (path) => `asset:${path}`,
    })
    const events: string[] = []
    engine.on("start", (event) => events.push(event.type))
    engine.on("end", (event) => events.push(event.type))
    engine.loadUtterances([{ id: "one", plain: "Hello.", language: "en" }])

    engine.speak()
    await vi.waitFor(() => expect(synthesize).toHaveBeenCalledOnce())

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        profileId: "provider",
        text: "Hello.",
        voiceId: "voice",
      }),
      expect.objectContaining({
        requestId: expect.any(String),
        signal: expect.any(AbortSignal),
      }),
    )
    expect(audio.src).toBe("asset:/cache/one.mp3")
    await vi.waitFor(() => expect(events).toEqual(["start"]))

    audio.dispatch("ended")
    expect(events).toEqual(["start", "end"])
    expect(engine.getState()).toBe("ready")
  })

  it("switches voices for a sentence in another authored language", async () => {
    const audio = new FakeAudio()
    const synthesize = vi.fn(async () => artifact("/cache/english.mp3"))
    const engine = new CoreSpeechEngine("provider", {
      synthesize,
      listVoices: async () => [
        { id: "zh", name: "Chinese", language: "zh-CN", gender: null },
        { id: "en", name: "English", language: "en-US", gender: null },
      ],
      createAudio: () => audio,
      audioSource: (path) => path,
    })
    await engine.initialize()
    engine.setVoice("zh")
    engine.loadUtterances([
      { id: "english", plain: "Turn, Turn, Turn.", language: "eng" },
    ])

    engine.speak()
    await vi.waitFor(() => expect(synthesize).toHaveBeenCalledOnce())

    expect(synthesize).toHaveBeenCalledWith(
      expect.objectContaining({
        language: "eng",
        voiceId: "en",
      }),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    )
  })

  it("discards a synthesis response after the user skips", async () => {
    const first = deferred<TtsAudioArtifactDto>()
    const second = deferred<TtsAudioArtifactDto>()
    const synthesize = vi
      .fn()
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise)
    const audios: FakeAudio[] = []
    const engine = new CoreSpeechEngine("provider", {
      synthesize,
      listVoices: async () => [
        { id: "voice", name: "Voice", language: "en", gender: null },
      ],
      cancelSynthesis: async () => true,
      createAudio: () => {
        const audio = new FakeAudio()
        audios.push(audio)
        return audio
      },
      audioSource: (path) => path,
    })
    engine.loadUtterances([
      { id: "one", plain: "One.", language: "en" },
      { id: "two", plain: "Two.", language: "en" },
    ])

    engine.speak(0)
    await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(2))
    engine.speak(1)
    await flushPromises()
    first.resolve(artifact("/cache/stale.mp3"))
    await flushPromises()

    expect(audios).toHaveLength(0)

    second.resolve(artifact("/cache/current.mp3"))
    await vi.waitFor(() => expect(audios).toHaveLength(1))
    expect(audios[0]?.src).toBe("/cache/current.mp3")
  })

  it("resynthesizes the selected sentence when resuming after a paused skip", async () => {
    const synthesize = vi
      .fn()
      .mockResolvedValueOnce(artifact("/cache/one.mp3"))
      .mockResolvedValueOnce(artifact("/cache/two.mp3"))
    const audios: FakeAudio[] = []
    const engine = new CoreSpeechEngine("provider", {
      synthesize,
      listVoices: async () => [
        { id: "voice", name: "Voice", language: "en", gender: null },
      ],
      createAudio: () => {
        const audio = new FakeAudio()
        audios.push(audio)
        return audio
      },
      audioSource: (path) => path,
    })
    engine.loadUtterances([
      { id: "one", plain: "One.", language: "en" },
      { id: "two", plain: "Two.", language: "en" },
    ])
    engine.speak(0)
    await vi.waitFor(() => expect(engine.getState()).toBe("playing"))

    engine.pause()
    engine.setCurrentUtteranceIndex(1)
    engine.resume()

    await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(2))
    await vi.waitFor(() => expect(engine.getState()).toBe("playing"))
    expect(audios[1]?.src).toBe("/cache/two.mp3")
  })

  it("prefetches the next two utterances while the current one is playing", async () => {
    const synthesize = vi.fn(async ({ text }: { text: string }) =>
      artifact(`/cache/${text.toLowerCase()}.mp3`),
    )
    const audios: FakeAudio[] = []
    const engine = new CoreSpeechEngine("provider", {
      synthesize,
      listVoices: async () => [
        { id: "voice", name: "Voice", language: "en", gender: null },
      ],
      createAudio: () => {
        const audio = new FakeAudio()
        audios.push(audio)
        return audio
      },
      audioSource: (path) => path,
    })
    engine.loadUtterances([
      { id: "one", plain: "One", language: "en" },
      { id: "two", plain: "Two", language: "en" },
      { id: "three", plain: "Three", language: "en" },
      { id: "four", plain: "Four", language: "en" },
    ])

    engine.speak(0)

    await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(3))
    expect(synthesize.mock.calls.map(([input]) => input.text)).toEqual([
      "One",
      "Two",
      "Three",
    ])
    await vi.waitFor(() => expect(engine.getState()).toBe("playing"))

    engine.speak(1)

    await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(4))
    expect(synthesize.mock.calls[3]?.[0].text).toBe("Four")
    await vi.waitFor(() => expect(audios[1]?.src).toBe("/cache/two.mp3"))
  })

  it("cancels obsolete lookahead requests after a jump", async () => {
    const signals: AbortSignal[] = []
    const cancelSynthesis = vi.fn(async () => true)
    const synthesize = vi.fn(
      (_input: { text: string }, context?: { signal: AbortSignal }) =>
        new Promise<TtsAudioArtifactDto>((_resolve, reject) => {
          const signal = context?.signal
          if (!signal) return
          signals.push(signal)
          signal.addEventListener("abort", () => {
            const error = new Error("Aborted")
            error.name = "AbortError"
            reject(error)
          })
        }),
    )
    const engine = new CoreSpeechEngine("provider", {
      synthesize,
      cancelSynthesis,
      listVoices: async () => [
        { id: "voice", name: "Voice", language: "en", gender: null },
      ],
      createAudio: () => new FakeAudio(),
      audioSource: (path) => path,
    })
    engine.loadUtterances([
      { id: "one", plain: "One", language: "en" },
      { id: "two", plain: "Two", language: "en" },
      { id: "three", plain: "Three", language: "en" },
      { id: "four", plain: "Four", language: "en" },
      { id: "five", plain: "Five", language: "en" },
    ])
    engine.speak(0)
    await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(3))

    engine.speak(4)

    await vi.waitFor(() => expect(synthesize).toHaveBeenCalledTimes(4))
    expect(signals.slice(0, 3).every((signal) => signal.aborted)).toBe(true)
    expect(cancelSynthesis).toHaveBeenCalledTimes(3)
    expect(synthesize.mock.calls[3]?.[0].text).toBe("Five")
  })
})
