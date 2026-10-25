import { act, renderHook, waitFor } from "@testing-library/react"
import { beforeEach, afterEach, expect, it, vi } from "vitest"
import { useTtsProviderTest } from "../useTtsProviderTest"
import type { UpsertTtsProviderInput } from "@/lib/tauri-specta"

const mocks = vi.hoisted(() => ({
  testTtsProvider: vi.fn(),
  cancelTtsSynthesis: vi.fn(),
}))
vi.mock("@/lib/tauri-api", () => ({ api: mocks }))
vi.mock("@/lib/error-presentation", () => ({ errorMessage: String }))
vi.mock("@tauri-apps/api/core", () => ({
  isTauri: () => true,
  convertFileSrc: (path: string) => `asset:${path}`,
}))
class PreviewAudio {
  static instances: PreviewAudio[] = []
  onended: (() => void) | null = null
  onerror: (() => void) | null = null
  play = vi.fn().mockResolvedValue(undefined)
  pause = vi.fn()
  constructor(readonly src: string) {
    PreviewAudio.instances.push(this)
  }
}
const input: UpsertTtsProviderInput = {
  profile: {
    id: "saved",
    name: "Local",
    kind: "openAiCompatible",
    enabled: true,
    endpoint: "http://localhost/v1",
    model: "draft-model",
    options: {
      kind: "openAiCompatible",
      voices: ["draft-voice"],
      defaultVoice: "draft-voice",
      responseFormat: "mp3",
      instructions: "Softly",
    },
  },
  credential: "draft-key",
  clearCredential: false,
}
beforeEach(() => {
  vi.clearAllMocks()
  PreviewAudio.instances = []
  vi.stubGlobal("Audio", PreviewAudio)
  mocks.cancelTtsSynthesis.mockResolvedValue(undefined)
  mocks.testTtsProvider.mockResolvedValue({ path: "/tmp/preview.mp3" })
})
afterEach(() => vi.unstubAllGlobals())

it("plays the returned draft audio, reports completion and stops playback on edit", async () => {
  const { result, rerender } = renderHook(
    ({ value }) => useTtsProviderTest(value),
    { initialProps: { value: input } },
  )
  await act(() => result.current.test("Preview"))
  expect(mocks.testTtsProvider).toHaveBeenCalledWith(
    expect.any(String),
    input,
    "Preview",
  )
  expect(PreviewAudio.instances[0].src).toBe("asset:/tmp/preview.mp3")
  expect(result.current.state).toBe("playing")
  act(() => PreviewAudio.instances[0].onended?.())
  expect(result.current.state).toBe("success")
  await act(() => result.current.test("Again"))
  rerender({ value: { ...input, credential: "changed" } })
  expect(PreviewAudio.instances[1].pause).toHaveBeenCalled()
  expect(result.current.state).toBe("idle")
})

it("cancels a superseded request and ignores its late result", async () => {
  let resolve!: (value: { path: string }) => void
  mocks.testTtsProvider.mockReturnValueOnce(
    new Promise((done) => {
      resolve = done
    }),
  )
  const first = renderHook(() => useTtsProviderTest(input))
  const second = renderHook(() => useTtsProviderTest(input))
  let pending!: Promise<void>
  act(() => {
    pending = first.result.current.test("First")
  })
  const requestId = mocks.testTtsProvider.mock.calls[0][0]
  await act(() => second.result.current.test("Second"))
  expect(mocks.cancelTtsSynthesis).toHaveBeenCalledWith(requestId)
  await act(async () => {
    resolve({ path: "/tmp/stale.mp3" })
    await pending
  })
  expect(PreviewAudio.instances).toHaveLength(1)
  expect(first.result.current.state).toBe("idle")
  second.unmount()
  expect(PreviewAudio.instances[0].pause).toHaveBeenCalled()
})

it("cancels a pending request on close and exposes synthesis failures", async () => {
  mocks.testTtsProvider.mockRejectedValueOnce(new Error("Rejected voice"))
  const hook = renderHook(() => useTtsProviderTest(input))
  await act(() => hook.result.current.test("Test"))
  expect(hook.result.current.error).toContain("Rejected voice")
  expect(hook.result.current.state).toBe("idle")
  expect(PreviewAudio.instances).toHaveLength(0)
  expect(mocks.testTtsProvider).toHaveBeenCalledTimes(1)
  mocks.testTtsProvider.mockReturnValueOnce(new Promise(() => {}))
  act(() => {
    void hook.result.current.test("Pending")
  })
  await waitFor(() => expect(hook.result.current.state).toBe("testing"))
  hook.unmount()
  expect(mocks.cancelTtsSynthesis).toHaveBeenLastCalledWith(
    mocks.testTtsProvider.mock.calls[1][0],
  )
})
