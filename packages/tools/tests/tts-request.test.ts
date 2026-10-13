import { afterEach, describe, expect, it, vi } from "vitest"
import { runTtsRequest } from "../src/tts-request"

afterEach(() => vi.useRealTimers())

describe("TTS request deadline", () => {
  it("times out at 20 seconds and aborts a provider that never responds", async () => {
    vi.useFakeTimers()
    let requestSignal!: AbortSignal
    const result = runTtsRequest((signal) => {
      requestSignal = signal
      return new Promise(() => {})
    })
    const failure = expect(result).rejects.toThrow("TTS_REQUEST_TIMEOUT")
    await vi.advanceTimersByTimeAsync(19_999)
    expect(requestSignal.aborted).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await failure
    expect(requestSignal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("cancels immediately even if the request ignores cancellation", async () => {
    vi.useFakeTimers()
    const controller = new AbortController()
    let requestSignal!: AbortSignal
    const result = runTtsRequest((signal) => {
      requestSignal = signal
      return new Promise(() => {})
    }, controller.signal)
    const failure = expect(result).rejects.toMatchObject({ name: "AbortError" })
    controller.abort()
    await failure
    expect(requestSignal.aborted).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("does not dispatch an already cancelled request", async () => {
    const controller = new AbortController()
    controller.abort()
    const request = vi.fn()
    await expect(
      runTtsRequest(request, controller.signal),
    ).rejects.toMatchObject({ name: "AbortError" })
    expect(request).not.toHaveBeenCalled()
  })

  it("preserves provider errors and clears the deadline on completion", async () => {
    vi.useFakeTimers()
    const error = new Error("HTTP_401")
    await expect(
      runTtsRequest(async () => {
        throw error
      }),
    ).rejects.toBe(error)
    await expect(runTtsRequest(async () => "audio")).resolves.toBe("audio")
    expect(vi.getTimerCount()).toBe(0)
  })
})
