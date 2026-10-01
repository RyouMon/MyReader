import type { EpubNavigator } from "@readium/navigator"
import { describe, expect, it, vi } from "vitest"
import { patchEpubNavigatorNavigationQueue } from "@/lib/readium/epubNavigationQueue"

describe("patchEpubNavigatorNavigationQueue", () => {
  it("serializes TTS follow and user navigation across navigator methods", async () => {
    const pending: Array<(ok: boolean) => void> = []
    const go = vi.fn((_locator, _animated, callback) => {
      pending.push(callback)
    })
    const goForward = vi.fn((_animated, callback) => {
      pending.push(callback)
    })
    const navigator = {
      go,
      goForward,
      goBackward: vi.fn(),
      goLink: vi.fn(),
    } as unknown as EpubNavigator
    patchEpubNavigatorNavigationQueue(navigator)
    const firstCallback = vi.fn()
    const secondCallback = vi.fn()

    navigator.go({ href: "tts.xhtml" } as never, false, firstCallback)
    navigator.goForward(false, secondCallback)
    await Promise.resolve()

    expect(go).toHaveBeenCalledOnce()
    expect(goForward).not.toHaveBeenCalled()

    pending.shift()?.(true)

    expect(firstCallback).toHaveBeenCalledWith(true)
    await vi.waitFor(() => expect(goForward).toHaveBeenCalledOnce())

    pending.shift()?.(true)
    await Promise.resolve()

    expect(secondCallback).toHaveBeenCalledWith(true)
  })

  it("releases the queue when Readium drops a navigation callback", async () => {
    vi.useFakeTimers()
    const go = vi.fn()
    const goForward = vi.fn((_animated, callback) => callback(true))
    const navigator = {
      go,
      goForward,
      goBackward: vi.fn(),
      goLink: vi.fn(),
    } as unknown as EpubNavigator
    patchEpubNavigatorNavigationQueue(navigator)
    const firstCallback = vi.fn()
    const secondCallback = vi.fn()

    navigator.go({ href: "stalled.xhtml" } as never, false, firstCallback)
    navigator.goForward(false, secondCallback)
    await Promise.resolve()

    await vi.advanceTimersByTimeAsync(1_500)

    expect(firstCallback).toHaveBeenCalledWith(false)
    expect(goForward).toHaveBeenCalledOnce()
    expect(secondCallback).toHaveBeenCalledWith(true)
    vi.useRealTimers()
  })
})
