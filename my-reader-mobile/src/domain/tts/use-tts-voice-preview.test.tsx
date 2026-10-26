import { act, renderHook, waitFor } from "@testing-library/react-native"
import { previewTtsProvider } from "@/src/services/core/tts"
import { newTtsDraft, previewInput } from "./tts-provider-draft"
import { useTtsVoicePreview } from "./use-tts-voice-preview"

const mockPlayer = { play: jest.fn(), setPlaybackRate: jest.fn() }
const mockStatus = { isLoaded: true, didJustFinish: false }
jest.mock("expo-audio", () => ({
  useAudioPlayer: () => mockPlayer,
  useAudioPlayerStatus: () => mockStatus,
}))
jest.mock("@/src/services/core/tts", () => ({ previewTtsProvider: jest.fn() }))
jest.mock("@/src/i18n/error-message", () => ({
  errorMessage: (error: Error) => error.message,
}))

const input = previewInput(newTtsDraft())
const artifact = {
  path: "/cache/voice.wav",
  mimeType: "audio/wav",
  timings: [],
}

beforeEach(() => jest.clearAllMocks())

it("cancels a pending preview when its draft changes and ignores its result", async () => {
  let resolve!: (value: typeof artifact) => void
  jest.mocked(previewTtsProvider).mockReturnValue(
    new Promise((done) => {
      resolve = done
    }),
  )
  const { result, rerender } = renderHook<
    ReturnType<typeof useTtsVoicePreview>,
    { identity: string }
  >(({ identity }) => useTtsVoicePreview(identity), {
    initialProps: { identity: "before" },
  })
  act(() => {
    void result.current.play(0, input, "Hello")
  })
  const signal = jest.mocked(previewTtsProvider).mock.calls[0]![2]!
  rerender({ identity: "after" })
  expect(signal.aborted).toBe(true)
  await act(async () => {
    resolve(artifact)
  })
  expect(result.current.state).toBe("idle")
  expect(mockPlayer.play).not.toHaveBeenCalled()
})

it("stops the previous voice when another editor starts a preview", async () => {
  jest.mocked(previewTtsProvider).mockResolvedValue(artifact)
  const first = renderHook(() => useTtsVoicePreview("first"))
  const second = renderHook(() => useTtsVoicePreview("second"))
  await act(async () => {
    await first.result.current.play(0, input, "First")
  })
  await waitFor(() => expect(first.result.current.state).toBe("playing"))
  await act(async () => {
    await second.result.current.play(1, input, "Second")
  })
  await waitFor(() => expect(second.result.current.state).toBe("playing"))
  expect(first.result.current.state).toBe("idle")
  expect(second.result.current.active).toBe(1)
})

it("aborts a request on unmount", () => {
  jest.mocked(previewTtsProvider).mockReturnValue(new Promise(() => {}))
  const { result, unmount } = renderHook(() => useTtsVoicePreview("preview"))
  act(() => {
    void result.current.play(0, input, "Hello")
  })
  const signal = jest.mocked(previewTtsProvider).mock.calls[0]![2]!
  unmount()
  expect(signal.aborted).toBe(true)
})
