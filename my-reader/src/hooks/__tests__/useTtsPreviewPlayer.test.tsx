import { act, renderHook } from "@testing-library/react"
import { afterEach, beforeEach, expect, it, vi } from "vitest"
import { useTtsPreviewPlayer } from "../useTtsPreviewPlayer"
import type { TtsConfigDto } from "@/lib/tauri-specta"

const mocks = vi.hoisted(() => ({
  synthesizeTtsRequest: vi.fn(),
  cancelTtsSynthesis: vi.fn(),
}))
vi.mock("@/lib/tauri-api", () => ({ api: mocks }))
vi.mock("@/lib/error-presentation", () => ({ errorMessage: String }))
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  convertFileSrc: (path: string) => `asset:${path}`,
}))
vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

class PreviewAudio {
  static instances: PreviewAudio[] = []
  playbackRate = 1
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  constructor(readonly src: string) {
    PreviewAudio.instances.push(this)
  }
}

const config: TtsConfigDto = {
  schemaVersion: 2,
  providers: [],
  defaultEngine: { kind: "provider", profileId: "provider" },
  voiceByLanguage: {},
  playback: {
    speed: 1.2,
    pitch: 0.9,
    skipPageBreaks: false,
    skipFootnotes: false,
    announceContext: false,
  },
  profiles: [
    {
      id: "provider",
      name: "Provider",
      kind: "openAiCompatible",
      endpoint: "https://example.com/v1",
      model: "tts",
      hasCredential: true,
      revision: 1,
      options: {
        kind: "openAiCompatible",
        responseFormat: "mp3",
        voices: ["voice"],
        defaultVoice: "voice",
      },
    },
  ],
}
const input = {
  config,
  engineId: "provider",
  voiceId: "voice",
  instructions: "Softly",
  systemVoices: [],
  language: "zh-CN",
  onError: vi.fn(),
}

beforeEach(() => {
  vi.clearAllMocks()
  PreviewAudio.instances = []
  vi.stubGlobal("Audio", PreviewAudio)
  mocks.synthesizeTtsRequest.mockResolvedValue({
    path: "/tmp/preview.mp3",
    playbackRate: 1.1,
  })
  mocks.cancelTtsSynthesis.mockResolvedValue(undefined)
})
afterEach(() => vi.unstubAllGlobals())

it("previews a candidate without changing the configured voice and replaces previous playback", async () => {
  const { result } = renderHook(() => useTtsPreviewPlayer(input))
  await act(() => result.current.preview("candidate"))
  expect(mocks.synthesizeTtsRequest).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ voiceId: "candidate", instructions: "Softly" }),
  )
  expect(result.current.previewVoiceId).toBe("candidate")
  await act(() => result.current.preview())
  expect(PreviewAudio.instances[0].pause).toHaveBeenCalledOnce()
  expect(mocks.synthesizeTtsRequest).toHaveBeenLastCalledWith(
    expect.any(String),
    expect.objectContaining({ voiceId: "voice" }),
  )
  act(() => result.current.stopPreview())
  expect(result.current.previewVoiceId).toBeNull()
})

it("cancels the previous candidate request and ignores its late result", async () => {
  let resolve!: (value: { path: string }) => void
  mocks.synthesizeTtsRequest.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const { result } = renderHook(() => useTtsPreviewPlayer(input))
  let pending!: Promise<void>
  act(() => {
    pending = result.current.preview("first")
  })
  const requestId = mocks.synthesizeTtsRequest.mock.calls[0][0]
  await act(() => result.current.preview("second"))
  expect(mocks.cancelTtsSynthesis).toHaveBeenCalledWith(requestId)
  await act(async () => {
    resolve({ path: "/tmp/old.mp3" })
    await pending
  })
  expect(PreviewAudio.instances).toHaveLength(1)
  expect(result.current.previewVoiceId).toBe("second")
})

it("synthesizes the selected voice and draft instructions and plays the returned audio", async () => {
  const { result } = renderHook(() => useTtsPreviewPlayer(input))
  await act(() => result.current.preview())
  expect(mocks.synthesizeTtsRequest).toHaveBeenCalledWith(
    expect.any(String),
    expect.objectContaining({
      profileId: "provider",
      voiceId: "voice",
      instructions: "Softly",
      language: "zh-CN",
      text: "settings.speech.previewText",
      speed: 1.2,
      pitch: 0.9,
      cachePolicy: "bypass",
    }),
  )
  const audio = PreviewAudio.instances[0]
  expect(audio.src).toBe("asset:/tmp/preview.mp3")
  expect(audio.playbackRate).toBe(1.1)
  expect(audio.play).toHaveBeenCalledOnce()
  expect(result.current.previewing).toBe(true)
  act(() => audio.onended?.())
  expect(result.current.previewing).toBe(false)
})

it("stops playback when changing a voice or closing the editor", async () => {
  const { result, rerender, unmount } = renderHook(
    (props) => useTtsPreviewPlayer(props),
    { initialProps: input },
  )
  await act(() => result.current.preview())
  rerender({ ...input, voiceId: "new-voice" })
  expect(PreviewAudio.instances[0].pause).toHaveBeenCalledOnce()
  expect(result.current.previewing).toBe(false)
  await act(() => result.current.preview())
  unmount()
  expect(PreviewAudio.instances[1].pause).toHaveBeenCalledOnce()
})

it("cancels pending synthesis on instruction changes and ignores the late response", async () => {
  let resolve!: (value: { path: string }) => void
  mocks.synthesizeTtsRequest.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const { result, rerender } = renderHook(
    (props) => useTtsPreviewPlayer(props),
    { initialProps: input },
  )
  let pending!: Promise<void>
  act(() => {
    pending = result.current.preview()
  })
  const requestId = mocks.synthesizeTtsRequest.mock.calls[0][0]
  rerender({ ...input, instructions: "Cheerfully" })
  expect(mocks.cancelTtsSynthesis).toHaveBeenCalledWith(requestId)
  await act(async () => {
    resolve({ path: "/tmp/stale.mp3" })
    await pending
  })
  expect(PreviewAudio.instances).toHaveLength(0)
  expect(result.current.previewing).toBe(false)
})

it("reports synthesis and playback failures without remaining in the playing state", async () => {
  mocks.synthesizeTtsRequest.mockRejectedValueOnce(new Error("Rejected voice"))
  const { result } = renderHook(() => useTtsPreviewPlayer(input))
  await act(() => result.current.preview())
  expect(input.onError).toHaveBeenLastCalledWith("Error: Rejected voice")
  expect(result.current.previewing).toBe(false)
  await act(() => result.current.preview())
  act(() => PreviewAudio.instances[0].onerror?.())
  expect(input.onError).toHaveBeenLastCalledWith(
    "providerEditor.playbackFailed",
  )
  expect(result.current.previewing).toBe(false)
})

it("uses the selected system voice and cancels system speech when stopped", async () => {
  const voice = {
    voiceURI: "system-voice",
    name: "System Voice",
    lang: "zh-CN",
  } as SpeechSynthesisVoice
  const speechSynthesis = { speak: vi.fn(), cancel: vi.fn() }
  vi.stubGlobal("speechSynthesis", speechSynthesis)
  vi.stubGlobal(
    "SpeechSynthesisUtterance",
    class {
      constructor(readonly text: string) {}
    },
  )
  const { result } = renderHook(() =>
    useTtsPreviewPlayer({
      ...input,
      engineId: "system",
      voiceId: "system-voice",
      systemVoices: [voice],
    }),
  )
  await act(() => result.current.preview())
  expect(speechSynthesis.speak).toHaveBeenCalledWith(
    expect.objectContaining({
      voice,
      text: "settings.speech.previewText",
      rate: 1.2,
      pitch: 0.9,
    }),
  )
  expect(mocks.synthesizeTtsRequest).not.toHaveBeenCalled()
  act(() => result.current.stopPreview())
  expect(speechSynthesis.cancel).toHaveBeenCalledOnce()
  expect(result.current.previewing).toBe(false)
})
