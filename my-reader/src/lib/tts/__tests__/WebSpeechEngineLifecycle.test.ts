import { afterEach, describe, expect, it, vi } from "vitest"

class FakeSpeechSynthesisUtterance {
  voice: SpeechSynthesisVoice | null = null
  lang = ""
  rate = 1
  pitch = 1
  volume = 1
  onstart: (() => void) | null = null
  onend: (() => void) | null = null
  onerror: ((event: { error: string }) => void) | null = null
  onpause: (() => void) | null = null
  onresume: (() => void) | null = null
  onboundary: (() => void) | null = null
  onmark: (() => void) | null = null

  constructor(readonly text: string) {}
}

class FakeSpeechSynthesis {
  speaking = false
  paused = false
  pending = false
  current: FakeSpeechSynthesisUtterance | null = null
  readonly startedTexts: string[] = []
  private cancelledActiveSpeechThisTask = false

  constructor(
    private readonly cancelDelivery: "synchronous" | "delayed",
    private readonly endSpeakAfterActiveCancel = false,
    private readonly startDelivery: "synchronous" | "manual" = "synchronous",
    private readonly preservePauseOnCancel = false,
    private readonly cancellationSettleMs = 0,
  ) {}

  getVoices() {
    return [
      {
        default: true,
        lang: "en-US",
        localService: true,
        name: "Test Voice",
        voiceURI: "test-voice",
      },
    ]
  }

  addEventListener() {}

  removeEventListener() {}

  cancel() {
    const cancelled = this.current
    this.current = null
    this.speaking = false
    if (!this.preservePauseOnCancel) this.paused = false
    this.cancelledActiveSpeechThisTask = Boolean(cancelled)
    window.setTimeout(() => {
      this.cancelledActiveSpeechThisTask = false
    }, this.cancellationSettleMs)
    if (cancelled) {
      if (this.cancelDelivery === "synchronous") {
        cancelled.onerror?.({ error: "canceled" })
      } else {
        window.setTimeout(() => cancelled.onerror?.({ error: "canceled" }), 0)
      }
    }
  }

  speak(utterance: FakeSpeechSynthesisUtterance) {
    this.current = utterance
    if (this.preservePauseOnCancel && this.paused) {
      this.current = null
      utterance.onend?.()
      return
    }
    if (this.endSpeakAfterActiveCancel && this.cancelledActiveSpeechThisTask) {
      this.speaking = false
      utterance.onend?.()
      return
    }
    this.speaking = true
    this.paused = false
    if (this.startDelivery === "synchronous") {
      this.startCurrent()
    }
  }

  startCurrent() {
    const current = this.current
    if (!current) return

    this.startedTexts.push(current.text)
    current.onstart?.()
  }

  finishCurrent() {
    const current = this.current
    if (!current) return

    this.current = null
    this.speaking = false
    current.onend?.()
  }

  pause() {
    this.paused = true
    this.current?.onpause?.()
  }

  resume() {
    this.paused = false
    this.current?.onresume?.()
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.resetModules()
})

describe("Web Speech playback lifecycle", () => {
  it("keeps an explicit page restart on its target while WebKit cancellation settles asynchronously", async () => {
    const synthesis = new FakeSpeechSynthesis(
      "delayed",
      true,
      "synchronous",
      false,
      50,
    )
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
    )
    vi.stubGlobal("speechSynthesis", synthesis)
    vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance)
    vi.resetModules()
    const { ReadiumSpeechNavigator, WebSpeechEngine } = await import(
      "@readium/speech"
    )
    const navigator = new ReadiumSpeechNavigator(new WebSpeechEngine(), {
      preferences: { pauseDuration: 0 },
    })
    const content = [
      { id: "opening", plain: "Book opening." },
      { id: "target", plain: "Visible target page sentence." },
      { id: "target-next", plain: "Visible target page next sentence." },
    ]
    navigator.loadContent(content)
    navigator.play()
    await vi.waitFor(() =>
      expect(synthesis.startedTexts).toEqual(["Book opening."]),
    )
    navigator.loadContent(content)
    navigator.jumpTo(1, true)

    await vi.waitFor(() =>
      expect(synthesis.startedTexts).toEqual([
        "Book opening.",
        "Visible target page sentence.",
      ]),
    )
    synthesis.finishCurrent()
    await vi.waitFor(() =>
      expect(synthesis.current?.text).toBe(
        "Visible target page next sentence.",
      ),
    )
    expect(navigator.getCurrentContent()?.id).toBe("target-next")
    await navigator.destroy()
  })

  it("starts an explicit page restart after cancelling paused native speech", async () => {
    const synthesis = new FakeSpeechSynthesis(
      "delayed",
      false,
      "synchronous",
      true,
    )
    vi.stubGlobal("speechSynthesis", synthesis)
    vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance)
    vi.resetModules()
    const { ReadiumSpeechNavigator, WebSpeechEngine } = await import(
      "@readium/speech"
    )
    const navigator = new ReadiumSpeechNavigator(new WebSpeechEngine())
    const content = [
      { id: "opening", plain: "Book opening." },
      { id: "target", plain: "Visible target page sentence." },
    ]
    navigator.loadContent(content)
    navigator.play()
    await vi.waitFor(() =>
      expect(synthesis.startedTexts).toEqual(["Book opening."]),
    )
    navigator.pause()
    navigator.loadContent(content)
    navigator.jumpTo(1, true)

    await vi.waitFor(() =>
      expect(synthesis.startedTexts).toEqual([
        "Book opening.",
        "Visible target page sentence.",
      ]),
    )
    expect(navigator.getCurrentContent()?.id).toBe("target")
    expect(navigator.getState()).toBe("playing")
    await navigator.destroy()
  })

  it("does not restart at book opening when a rebased sentence ends before native playback starts", async () => {
    const synthesis = new FakeSpeechSynthesis("delayed", false, "manual")
    vi.stubGlobal("speechSynthesis", synthesis)
    vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance)
    vi.resetModules()
    const { ReadiumSpeechNavigator, WebSpeechEngine } = await import(
      "@readium/speech"
    )
    const navigator = new ReadiumSpeechNavigator(new WebSpeechEngine(), {
      preferences: { pauseDuration: 0 },
    })
    const errors: string[] = []
    navigator.on("error", (event) => errors.push(event.detail?.message ?? ""))
    const content = [
      { id: "opening", plain: "Book opening." },
      { id: "opening-next", plain: "Book opening second sentence." },
      { id: "target", plain: "Visible target page sentence." },
      { id: "target-next", plain: "Visible target page next sentence." },
    ]
    navigator.loadContent(content)
    navigator.play()
    await vi.waitFor(() =>
      expect(synthesis.current?.text).toBe("Book opening."),
    )
    synthesis.startCurrent()

    navigator.loadContent(content)
    navigator.jumpTo(2, true)
    await vi.waitFor(() =>
      expect(synthesis.current?.text).toBe("Visible target page sentence."),
    )
    synthesis.finishCurrent()
    await new Promise((resolve) => window.setTimeout(resolve, 10))

    expect(synthesis.current).toBeNull()
    expect(errors).toHaveLength(1)
    expect(navigator.getState()).toBe("idle")
    expect(synthesis.startedTexts).toEqual(["Book opening."])
    await navigator.destroy()
  })

  it.each([
    "synchronous",
    "delayed",
  ] as const)("keeps the new utterance active when cancellation is %s", async (cancelDelivery) => {
    const synthesis = new FakeSpeechSynthesis(cancelDelivery)
    vi.stubGlobal("speechSynthesis", synthesis)
    vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance)
    vi.resetModules()
    const { ReadiumSpeechNavigator, WebSpeechEngine } = await import(
      "@readium/speech"
    )
    const navigator = new ReadiumSpeechNavigator(new WebSpeechEngine())
    const stopped = vi.fn()
    navigator.on("stop", stopped)
    navigator.loadContent([
      { id: "one", plain: "One." },
      { id: "two", plain: "Two." },
    ])

    navigator.play()
    await vi.waitFor(() => expect(synthesis.current?.text).toBe("One."))

    expect(navigator.next()).toBe(true)
    await vi.waitFor(() => expect(synthesis.current?.text).toBe("Two."))
    await new Promise((resolve) => window.setTimeout(resolve, 10))

    expect(synthesis.speaking).toBe(true)
    expect(navigator.getCurrentContent()?.id).toBe("two")
    expect(navigator.getState()).toBe("playing")
    expect(stopped).not.toHaveBeenCalled()

    expect(navigator.previous()).toBe(true)
    await vi.waitFor(() => expect(synthesis.current?.text).toBe("One."))
    await new Promise((resolve) => window.setTimeout(resolve, 10))

    expect(synthesis.speaking).toBe(true)
    expect(navigator.getCurrentContent()?.id).toBe("one")
    expect(navigator.getState()).toBe("playing")
    expect(stopped).not.toHaveBeenCalled()

    await navigator.destroy()
  })

  it("waits for WebKit cancellation to settle before speaking a skipped-to sentence", async () => {
    const synthesis = new FakeSpeechSynthesis("synchronous", true)
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
    )
    vi.stubGlobal("speechSynthesis", synthesis)
    vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance)
    vi.resetModules()
    const { ReadiumSpeechNavigator, WebSpeechEngine } = await import(
      "@readium/speech"
    )
    const navigator = new ReadiumSpeechNavigator(new WebSpeechEngine(), {
      preferences: { pauseDuration: 0 },
    })
    navigator.loadContent([
      { id: "one", plain: "One." },
      { id: "two", plain: "Two." },
      { id: "three", plain: "Three." },
    ])

    navigator.play()
    await vi.waitFor(() => expect(synthesis.startedTexts).toEqual(["One."]))

    expect(navigator.next()).toBe(true)
    await vi.waitFor(() =>
      expect(synthesis.startedTexts).toEqual(["One.", "Two."]),
    )
    await new Promise((resolve) => window.setTimeout(resolve, 10))

    expect(synthesis.current?.text).toBe("Two.")
    expect(navigator.getCurrentContent()?.id).toBe("two")
    expect(navigator.getState()).toBe("playing")

    expect(navigator.previous()).toBe(true)
    await vi.waitFor(() =>
      expect(synthesis.startedTexts).toEqual(["One.", "Two.", "One."]),
    )
    await new Promise((resolve) => window.setTimeout(resolve, 10))

    expect(synthesis.current?.text).toBe("One.")
    expect(navigator.getCurrentContent()?.id).toBe("one")
    expect(navigator.getState()).toBe("playing")

    await navigator.destroy()
  })

  it("does not skip a sentence that was queued but has not started speaking", async () => {
    const synthesis = new FakeSpeechSynthesis("synchronous", false, "manual")
    vi.spyOn(window.navigator, "userAgent", "get").mockReturnValue(
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko)",
    )
    vi.stubGlobal("speechSynthesis", synthesis)
    vi.stubGlobal("SpeechSynthesisUtterance", FakeSpeechSynthesisUtterance)
    vi.resetModules()
    const { ReadiumSpeechNavigator, WebSpeechEngine } = await import(
      "@readium/speech"
    )
    const navigator = new ReadiumSpeechNavigator(new WebSpeechEngine(), {
      preferences: { pauseDuration: 0 },
    })
    navigator.loadContent([
      { id: "one", plain: "One." },
      { id: "two", plain: "Two." },
      { id: "three", plain: "Three." },
    ])

    navigator.play()
    await vi.waitFor(() => expect(synthesis.current?.text).toBe("One."))
    synthesis.startCurrent()
    synthesis.finishCurrent()
    await vi.waitFor(() => expect(synthesis.current?.text).toBe("Two."))

    expect(navigator.next()).toBe(true)
    await vi.waitFor(() => expect(synthesis.current?.text).toBe("Two."))
    synthesis.startCurrent()

    expect(synthesis.startedTexts).toEqual(["One.", "Two."])
    expect(navigator.getCurrentContent()?.id).toBe("two")

    await navigator.destroy()
  })
})
