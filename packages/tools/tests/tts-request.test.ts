import { afterEach, describe, expect, it, vi } from "vitest"
import { runTtsRequest } from "../src/tts-request"

afterEach(() => vi.useRealTimers())

describe("TTS request deadline", () => {
  it("allows a cold provider to complete after thirty seconds without retrying", async () => {
    vi.useFakeTimers()
    let finish!: (value: string) => void
    let requestSignal!: AbortSignal
    const request = vi.fn((signal: AbortSignal) => {
      requestSignal = signal
      return new Promise<string>((resolve) => {
        finish = resolve
      })
    })
    const result = runTtsRequest(request).catch((error: unknown) => error)
    await vi.advanceTimersByTimeAsync(30_000)
    finish("audio")
    expect(await result).toBe("audio")
    expect(requestSignal.aborted).toBe(false)
    expect(request).toHaveBeenCalledTimes(1)
    expect(vi.getTimerCount()).toBe(0)
  })

  it("times out at two minutes and aborts a provider that never responds", async () => {
    vi.useFakeTimers()
    let requestSignal!: AbortSignal
    const result = runTtsRequest((signal) => {
      requestSignal = signal
      return new Promise(() => {})
    })
    const failure = expect(result).rejects.toThrow("TTS_REQUEST_TIMEOUT (120s)")
    await vi.advanceTimersByTimeAsync(119_999)
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
