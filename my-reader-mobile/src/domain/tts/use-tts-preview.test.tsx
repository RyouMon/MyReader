import { act, renderHook, waitFor } from "@testing-library/react-native"
import * as Speech from "expo-speech"
import { synthesizeTts, type MobileTtsConfig } from "@/src/services/core/tts"
import { useTtsPreview } from "./use-tts-preview"

const mockPlayer = { play: jest.fn(), setPlaybackRate: jest.fn() }
const mockSource = jest.fn()
jest.mock("expo-audio", () => ({
  useAudioPlayer: (source: string | null) => {
    mockSource(source)
    return mockPlayer
  },
  useAudioPlayerStatus: () => ({ isLoaded: true, didJustFinish: false }),
}))
jest.mock("expo-speech", () => ({ speak: jest.fn(), stop: jest.fn() }))
jest.mock("@/src/services/core/tts", () => ({ synthesizeTts: jest.fn() }))

const config: MobileTtsConfig = {
  schemaVersion: 2,
  providers: [],
  voices: [],
  defaultEngine: { kind: "provider", profileId: "provider" },
  profiles: [
    {
      id: "provider",
      name: "Provider",
      model: "tts",
      kind: "openAiCompatible",
      endpoint: "https://example.com/v1",
      revision: 1,
      hasCredential: true,
      voices: ["one", "two"],
      defaultVoice: "one",
      responseFormat: "mp3",
    },
  ],
  playback: {
    speed: 1,
    pitch: 1,
    skipFootnotes: false,
    skipPageBreaks: false,
    announceContext: false,
  },
}
const options = {
  config,
  voiceId: "one",
  text: "Hello",
  language: "en",
  instructions: "Softly",
  onError: jest.fn(),
}
const artifact = {
  path: "/cache/voice.wav",
  mimeType: "audio/wav",
  timings: [],
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(synthesizeTts).mockResolvedValue(artifact)
})

it("previews candidates with the current model and instructions without replacing the selected voice", async () => {
  const { result } = renderHook(() => useTtsPreview(options))
  await act(() => result.current.start("two"))
  await waitFor(() => expect(result.current.state).toBe("playing"))
  expect(synthesizeTts).toHaveBeenLastCalledWith(
    expect.objectContaining({
      voiceId: "two",
      profileId: "provider",
      instructions: "Softly",
    }),
    expect.any(Object),
  )
  expect(result.current.previewVoiceId).toBe("two")
  await act(() => result.current.start())
  expect(synthesizeTts).toHaveBeenLastCalledWith(
    expect.objectContaining({ voiceId: "one" }),
    expect.any(Object),
  )
  act(() => result.current.stop())
  expect(result.current.previewVoiceId).toBeNull()
})

it("aborts superseded requests and never plays their late results", async () => {
  let resolve!: (value: typeof artifact) => void
  jest.mocked(synthesizeTts).mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const { result, unmount } = renderHook(() => useTtsPreview(options))
  let pending!: Promise<void>
  act(() => {
    pending = result.current.start("first")
  })
  const signal = jest.mocked(synthesizeTts).mock.calls[0]![1]!.signal!
  await act(() => result.current.start("two"))
  expect(signal.aborted).toBe(true)
  await act(async () => {
    resolve({ ...artifact, path: "/cache/stale.wav" })
    await pending
  })
  expect(mockSource).not.toHaveBeenCalledWith("file:///cache/stale.wav")
  expect(result.current.previewVoiceId).toBe("two")
  unmount()
})

it("previews a system candidate in its language and stops speech on dismissal", async () => {
  const { result } = renderHook(() =>
    useTtsPreview({
      ...options,
      config: { ...config, defaultEngine: { kind: "system" } },
    }),
  )
  await act(() => result.current.start("two", "zh-CN"))
  expect(Speech.speak).toHaveBeenCalledWith(
    "Hello",
    expect.objectContaining({ voice: "two", language: "zh-CN" }),
  )
  act(() => result.current.stop())
  expect(Speech.stop).toHaveBeenCalledTimes(1)
  expect(result.current.state).toBe("idle")
})
