import { act, renderHook } from "@testing-library/react-native"
import type { AudioStatus } from "expo-audio"
import { usePreviewAudioPlayer } from "./use-preview-audio-player"

let statusListener: ((status: Partial<AudioStatus>) => void) | undefined
const mockSetAudioModeAsync = jest.fn().mockResolvedValue(undefined)
const mockPlayer = {
  addListener: jest.fn(
    (event: string, listener: (status: Partial<AudioStatus>) => void) => {
      if (event === "playbackStatusUpdate") statusListener = listener
      return {
        remove: jest.fn(() => {
          if (statusListener === listener) statusListener = undefined
        }),
      }
    },
  ),
  pause: jest.fn(),
  play: jest.fn(),
  replace: jest.fn(),
  setPlaybackRate: jest.fn(),
}

jest.mock("expo-audio", () => ({
  setAudioModeAsync: (mode: unknown) => mockSetAudioModeAsync(mode),
  useAudioPlayer: () => mockPlayer,
}))

beforeEach(() => {
  jest.clearAllMocks()
  jest.useRealTimers()
  statusListener = undefined
})

it("subscribes before replacing the source, enables silent-mode playback, and ignores ended state during load", async () => {
  const onPlaying = jest.fn()
  const onFinish = jest.fn()
  const onError = jest.fn()

  const { result } = renderHook(() =>
    usePreviewAudioPlayer({ onPlaying, onFinish, onError }),
  )
  expect(mockPlayer.addListener).toHaveBeenCalledWith(
    "playbackStatusUpdate",
    expect.any(Function),
  )

  await act(async () => {
    await result.current.loadAndPlay("file:///cache/preview.mp3", 1.25)
  })
  expect(mockSetAudioModeAsync).toHaveBeenCalledWith({
    playsInSilentMode: true,
    interruptionMode: "doNotMix",
  })
  expect(mockPlayer.replace).toHaveBeenCalledWith("file:///cache/preview.mp3")
  expect(mockPlayer.play).not.toHaveBeenCalled()

  // Android ExoPlayer may report STATE_ENDED (isLoaded=true) from a prior item before prepare completes.
  act(() => {
    statusListener?.({ isLoaded: true, playbackState: "ended" })
  })
  expect(mockPlayer.play).not.toHaveBeenCalled()

  act(() => {
    statusListener?.({ isLoaded: true, playbackState: "ready" })
  })
  expect(mockPlayer.setPlaybackRate).toHaveBeenCalledWith(1.25)
  expect(mockPlayer.play).toHaveBeenCalledTimes(1)
  expect(onPlaying).toHaveBeenCalledTimes(1)

  act(() => {
    statusListener?.({ didJustFinish: true })
  })
  expect(onFinish).toHaveBeenCalledTimes(1)
  expect(onError).not.toHaveBeenCalled()
})

it("times out cleanly instead of hanging indefinitely if the audio item never loads", async () => {
  jest.useFakeTimers()
  const onPlaying = jest.fn()
  const onFinish = jest.fn()
  const onError = jest.fn()

  const { result } = renderHook(() =>
    usePreviewAudioPlayer({ onPlaying, onFinish, onError }),
  )
  await act(async () => {
    await result.current.loadAndPlay("file:///cache/stalled.mp3")
  })
  expect(onError).not.toHaveBeenCalled()

  act(() => {
    jest.advanceTimersByTime(10_000)
  })
  expect(mockPlayer.pause).toHaveBeenCalledTimes(1)
  expect(onError).toHaveBeenCalledWith(
    expect.objectContaining({ message: "TTS_AUDIO_LOAD_TIMEOUT" }),
  )
})

it("surfaces native load errors and pauses active playback on stop", async () => {
  const onPlaying = jest.fn()
  const onFinish = jest.fn()
  const onError = jest.fn()

  const { result } = renderHook(() =>
    usePreviewAudioPlayer({ onPlaying, onFinish, onError }),
  )
  await act(async () => {
    await result.current.loadAndPlay("file:///cache/bad.mp3")
  })
  act(() => {
    statusListener?.({ error: "Cannot Decode" })
  })
  expect(onError).toHaveBeenCalledWith("Cannot Decode")

  await act(async () => {
    await result.current.loadAndPlay("file:///cache/good.mp3")
  })
  act(() => {
    statusListener?.({ isLoaded: true })
  })
  expect(onPlaying).toHaveBeenCalledTimes(1)

  act(() => {
    result.current.stop()
  })
  expect(mockPlayer.pause).toHaveBeenCalled()
  act(() => {
    statusListener?.({ didJustFinish: true })
  })
  expect(onFinish).not.toHaveBeenCalled()
})
