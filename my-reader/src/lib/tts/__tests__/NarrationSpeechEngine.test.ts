import { describe, expect, it, vi } from "vitest"
import { CoreSpeechEngine, type TtsAudio } from "../CoreSpeechEngine"
import { NarrationSpeechEngine } from "../NarrationSpeechEngine"
import type { NarrationSpeechDto } from "@/lib/tauri-specta"

class AudioFixture implements TtsAudio {
  src = ""
  currentTime = 0
  playbackRate = 1
  volume = 1
  play = vi.fn(async () => {})
  pause = vi.fn()
  listeners = new Map<string, Set<() => void>>()
  addEventListener(event: string, callback: () => void) {
    const listeners = this.listeners.get(event) ?? new Set()
    listeners.add(callback)
    this.listeners.set(event, listeners)
  }
  removeEventListener(event: string, callback: () => void) {
    this.listeners.get(event)?.delete(callback)
  }
  end() {
    this.listeners.get("ended")?.forEach((callback) => callback())
  }
}

const jobs: NarrationSpeechDto[] = [
  {
    text: "她说：",
    startUtf16: 0,
    endUtf16: 3,
    voice: { engine: "provider", profileId: "a", voiceId: "A" },
    instructions: "温柔",
  },
  {
    text: "你好😀",
    startUtf16: 3,
    endUtf16: 7,
    voice: { engine: "provider", profileId: "b", voiceId: "A" },
    instructions: "仿男声\n高兴",
  },
]

function fixture(
  prepare: ConstructorParameters<typeof NarrationSpeechEngine>[2] = async () =>
    jobs,
) {
  const audio: AudioFixture[] = []
  const requests: { profileId: string; text: string; instructions?: string }[] =
    []
  const create = (profileId: string, instructions?: string) =>
    new CoreSpeechEngine(profileId, {
      listVoices: async () => [
        { id: "A", name: "A", language: "zh", gender: null },
      ],
      synthesize: async (input) => {
        requests.push({ ...input, instructions })
        return {
          path: "/fixture.wav",
          mimeType: "audio/wav",
          durationMs: null,
          timings: [],
          cacheKey: null,
        }
      },
      cancelSynthesis: async () => true,
      createAudio: () => {
        const value = new AudioFixture()
        audio.push(value)
        return value
      },
      audioSource: (path) => path,
    })
  const engine = new NarrationSpeechEngine(
    create("default"),
    "default",
    prepare,
    (segment) =>
      create(
        segment.voice.engine === "provider"
          ? segment.voice.profileId
          : "system",
        segment.instructions,
      ),
  )
  engine.loadUtterances([
    {
      id: "one",
      plain: "她说：你好😀",
      ssml: "<speak>must not reuse full utterance</speak>",
    },
  ])
  return { engine, audio, requests }
}

describe("NarrationSpeechEngine", () => {
  it("keeps one source utterance until every independently voiced segment completes", async () => {
    const { engine, audio, requests } = fixture()
    const ended = vi.fn()
    engine.on("end", ended)
    engine.speak()
    await vi.waitFor(() => expect(audio).toHaveLength(1))
    expect(ended).not.toHaveBeenCalled()
    audio[0]!.end()
    await vi.waitFor(() => expect(audio).toHaveLength(2))
    expect(ended).not.toHaveBeenCalled()
    expect(requests).toEqual([
      expect.objectContaining({
        profileId: "a",
        text: "她说：",
        instructions: "温柔",
      }),
      expect.objectContaining({
        profileId: "b",
        text: "你好😀",
        instructions: "仿男声\n高兴",
      }),
    ])
    audio[1]!.end()
    await vi.waitFor(() => expect(ended).toHaveBeenCalledOnce())
    await engine.destroy()
  })

  it("ignores an analysis response that arrives after stop", async () => {
    let resolve!: (value: NarrationSpeechDto[]) => void
    const prepare = vi.fn(
      () =>
        new Promise<NarrationSpeechDto[]>((done) => {
          resolve = done
        }),
    )
    const { engine, audio } = fixture(prepare)
    const ended = vi.fn()
    engine.on("end", ended)
    engine.speak()
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce())
    engine.stop()
    resolve(jobs)
    await new Promise((done) => setTimeout(done, 0))
    expect(audio).toHaveLength(0)
    expect(ended).not.toHaveBeenCalled()
    expect(engine.getState()).toBe("idle")
    await engine.destroy()
  })

  it("honors pause while analysis is pending and cancels remaining segments on stop", async () => {
    let resolve!: (value: NarrationSpeechDto[]) => void
    const prepare = vi.fn(
      () =>
        new Promise<NarrationSpeechDto[]>((done) => {
          resolve = done
        }),
    )
    const { engine, audio, requests } = fixture(prepare)
    engine.speak()
    await vi.waitFor(() => expect(prepare).toHaveBeenCalledOnce())
    engine.pause()
    resolve(jobs)
    await vi.waitFor(() => expect(audio[0]?.pause).toHaveBeenCalled())
    expect(engine.getState()).toBe("paused")
    engine.resume()
    await vi.waitFor(() => expect(engine.getState()).toBe("playing"))
    engine.stop()
    audio[0]!.end()
    await new Promise((done) => setTimeout(done, 0))
    expect(requests).toHaveLength(1)
    await engine.destroy()
  })
})

it("retains reader voice and speed controls across segments and resets when the utterance list changes", async () => {
  const { engine, audio } = fixture()
  await engine.initialize()
  engine.setVoice("A")
  engine.setRate(1.4)
  engine.setPitch(1.2)
  engine.setVolume(0.5)
  engine.setSpeakInContentLanguage(true)
  expect((await engine.getAvailableVoices()).length).toBeGreaterThan(0)
  expect(engine.getCurrentVoice()).toBeDefined()
  expect(engine.getSpeakInContentLanguage()).toBe(true)
  expect(engine.getRate()).toBe(1.4)
  expect(engine.getPitch()).toBe(1.2)
  expect(engine.getVolume()).toBe(0.5)
  expect(engine.getUtteranceCount()).toBe(1)
  expect(engine.getCurrentUtteranceIndex()).toBe(0)
  const complete = vi.fn()
  engine.setCurrentUtteranceIndex(9, complete)
  expect(complete).toHaveBeenLastCalledWith(false)
  engine.setCurrentUtteranceIndex(0, complete)
  expect(complete).toHaveBeenLastCalledWith(true)
  engine.resume()
  await vi.waitFor(() => expect(audio).toHaveLength(1))
  expect(audio[0]!.playbackRate).toBe(1.4)
  expect(audio[0]!.volume).toBe(0.5)
  engine.setRate(1.8)
  engine.setVolume(0.7)
  expect(audio[0]!.playbackRate).toBe(1.8)
  expect(audio[0]!.volume).toBe(0.7)
  engine.loadUtterances([])
  expect(audio[0]!.pause).toHaveBeenCalled()
  const ended = vi.fn()
  const unsubscribe = engine.on("end", ended)
  unsubscribe()
  engine.speak()
  expect(ended).not.toHaveBeenCalled()
  expect(engine.getState()).toBe("idle")
  await engine.destroy()
})

it("surfaces analysis errors without advancing to another source utterance", async () => {
  const { engine, audio } = fixture(async () => {
    throw new Error("connection failed")
  })
  const error = vi.fn()
  const ended = vi.fn()
  engine.on("error", error)
  engine.on("end", ended)
  engine.speak()
  await vi.waitFor(() => expect(error).toHaveBeenCalledOnce())
  expect(ended).not.toHaveBeenCalled()
  expect(audio).toHaveLength(0)
  expect(engine.getState()).toBe("idle")
  await engine.destroy()
})
