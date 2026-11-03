import { afterEach, describe, expect, it, vi } from "vitest"
import { TtsBuffer } from "../src/tts-buffer"
import { TtsPerformance, TtsPerformanceRegistry } from "../src/tts-performance"

afterEach(() => vi.useRealTimers())

describe("adaptive synthesis", () => {
  it("starts with a sentence, grows behind playable audio, and retreats after slow requests", () => {
    const policy = new TtsPerformance()
    const text = "这是一句完整的话。".repeat(40)
    const first = policy.take(text, 600, 30, "zh")
    expect(text.slice(0, first)).toBe("这是一句完整的话。")
    for (let i = 0; i < 8; i++)
      policy.record({ chars: 50, milliseconds: 300, audioSeconds: 12 })
    const grown = policy.take(text, 600, 20, "zh")
    expect(grown).toBeGreaterThan(first)
    expect(policy.take(text, 600, 0, "zh")).toBe(first)
    policy.record({ chars: 50, milliseconds: 18000, audioSeconds: 12 })
    expect(policy.take(text, 600, 8, "zh")).toBeLessThan(grown)
  })

  it("respects input limits and UTF-16 ranges without dropping punctuation or whitespace", () => {
    const policy = new TtsPerformance()
    const original = "😀你好。  这是第二句话！\n".repeat(10)
    let rest = original
    const chunks: string[] = []
    while (rest) {
      const end = policy.take(rest, 7, 0, "zh")
      chunks.push(rest.slice(0, end))
      rest = rest.slice(end)
    }
    expect(chunks.join("")).toBe(original)
    expect(chunks.every((text) => Array.from(text).length <= 7)).toBe(true)
    expect(
      chunks.every((text) => !/^[\uDC00-\uDFFF]|[\uD800-\uDBFF]$/u.test(text)),
    ).toBe(true)
  })

  it("allows sentence boundary slack and uses word boundaries for oversized sentences", () => {
    const policy = new TtsPerformance()
    const sentence =
      "This is a complete sentence just over the learned size limit. "
    policy.backoff()
    expect(policy.take(sentence.repeat(2), 600, 0, "en")).toBe(sentence.length)
    const end = policy.take(sentence, 45, 0, "en")
    expect(end).toBeLessThanOrEqual(45)
    expect(sentence[end - 1]).toBe(" ")
  })

  it("reduces request overhead without exhausting playback in a deterministic fast-provider simulation", () => {
    const policy = new TtsPerformance()
    const sentence = "这是一句用于衡量生成速度和缓冲余量的话。"
    let rest = sentence.repeat(100)
    let buffer = 0
    let requests = 0
    let underruns = 0
    while (rest) {
      buffer = Math.min(buffer, policy.targetSeconds)
      const length = policy.take(rest, 600, buffer, "zh")
      const text = rest.slice(0, length)
      if (!requests) expect(text).toBe(sentence)
      const seconds = text.length * 0.2
      const milliseconds = 700 + text.length * 20
      if (requests && milliseconds > buffer * 1000) underruns++
      buffer = Math.max(0, buffer - milliseconds / 1000) + seconds
      policy.record({ chars: text.length, milliseconds, audioSeconds: seconds })
      rest = rest.slice(length)
      requests++
    }
    expect(requests).toBeLessThan(50)
    expect(underruns).toBe(0)
  })

  it("recalculates the remaining playback time when speed changes", async () => {
    let now = 0
    let rate = 1
    const queue = new TtsBuffer({
      count: 1,
      rate: () => rate,
      now: () => now,
      load: async () => [
        { text: "一句话。", context: 1, key: "rate", startUtf16: 0 },
      ],
      synthesize: async () => ({ durationMs: 10_000 }),
    })
    await queue.read(0, 0)
    queue.setPlaying(true)
    now = 2000
    expect(queue.bufferedSeconds).toBe(8)
    rate = 2
    queue.changeRate(1, rate)
    expect(queue.bufferedSeconds).toBe(4)
    now = 3000
    expect(queue.bufferedSeconds).toBe(3)
    queue.dispose()
  })

  it("expires stale performance estimates and separates configurations", () => {
    let now = 0
    const registry = new TtsPerformanceRegistry(() => now)
    const first = registry.get("a")
    expect(registry.get("a")).toBe(first)
    expect(registry.get("b")).not.toBe(first)
    now = 31 * 60_000
    expect(registry.get("a")).not.toBe(first)
  })

  it("returns the first audio before later synthesis finishes, then reuses prefetched sources", async () => {
    let release!: () => void
    const pending = new Promise<void>((resolve) => {
      release = resolve
    })
    const synthesize = vi.fn(async (_run, text: string) => {
      if (text === "下一段。") await pending
      return { durationMs: 5000, synthesisMs: 500, path: text }
    })
    const queue = new TtsBuffer({
      count: 2,
      performance: new TtsPerformanceRegistry(),
      load: async (index) => [
        {
          text: index ? "下一段。" : "第一句。",
          context: index,
          key: "a",
          startUtf16: 0,
        },
      ],
      synthesize,
    })
    queue.activate(0)
    expect((await queue.read(0, 0))?.audio?.path).toBe("第一句。")
    release()
    expect((await queue.read(1, 0))?.audio?.path).toBe("下一段。")
    queue.activate(1)
    expect((await queue.read(1, 0))?.audio?.path).toBe("下一段。")
    expect(synthesize).toHaveBeenCalledTimes(2)
    queue.dispose()
  })

  it("bounds buffering while paused and refills as actual playback consumes audio", async () => {
    vi.useFakeTimers()
    const synthesize = vi.fn(async () => ({
      durationMs: 5000,
      synthesisMs: 500,
    }))
    const queue = new TtsBuffer({
      count: 100,
      now: () => Date.now(),
      performance: new TtsPerformanceRegistry(),
      load: async (index) => [
        { text: "一句话。", context: index, key: "a", startUtf16: 0 },
      ],
      synthesize,
    })
    queue.activate(0)
    await vi.advanceTimersByTimeAsync(1)
    expect(synthesize).toHaveBeenCalledTimes(2)
    queue.setPlaying(true)
    await vi.advanceTimersByTimeAsync(4000)
    expect(synthesize.mock.calls.length).toBeGreaterThan(2)
    queue.setPlaying(false)
    const count = synthesize.mock.calls.length
    await vi.advanceTimersByTimeAsync(60_000)
    expect(synthesize).toHaveBeenCalledTimes(count)
    queue.dispose()
  })

  it("does not learn provider speed from cached files", async () => {
    const registry = new TtsPerformanceRegistry()
    const sample = vi.spyOn(registry.get("a"), "record")
    const queue = new TtsBuffer({
      count: 1,
      performance: registry,
      load: async () => [
        { text: "缓存。", context: 1, key: "a", startUtf16: 0 },
      ],
      synthesize: async () => ({ durationMs: 6000 }),
    })
    await queue.read(0, 0)
    expect(sample).not.toHaveBeenCalled()
    queue.dispose()
  })

  it("cancels pending work and rejects readers without accepting late audio", async () => {
    let complete!: (value: { durationMs: number }) => void
    let signal!: AbortSignal
    const queue = new TtsBuffer({
      count: 1,
      load: async () => [
        { text: "你好。", context: 1, key: "a", startUtf16: 0 },
      ],
      synthesize: async (_run, _text, value) => {
        signal = value
        return new Promise<{ durationMs: number }>((resolve) => {
          complete = resolve
        })
      },
    })
    const pending = queue.read(0, 0)
    await Promise.resolve()
    queue.dispose()
    await expect(pending).rejects.toMatchObject({ name: "AbortError" })
    expect(signal.aborted).toBe(true)
    complete({ durationMs: 5000 })
    await expect(queue.read(0, 0)).rejects.toMatchObject({ name: "AbortError" })
  })

  it("preserves role boundaries and propagates synthesis failures", async () => {
    const failure = new Error("provider unavailable")
    const queue = new TtsBuffer({
      count: 1,
      load: async () => [
        { text: "旁白。", context: "narrator", key: "a", startUtf16: 0 },
        { text: "角色。", context: "character", key: "b", startUtf16: 3 },
      ],
      synthesize: async (run) => {
        if (run.context === "character") throw failure
        return { durationMs: 3000 }
      },
    })
    expect(await queue.read(0, 0)).toMatchObject({
      text: "旁白。",
      context: "narrator",
      startUtf16: 0,
      endUtf16: 3,
    })
    await expect(queue.read(0, 1)).rejects.toBe(failure)
    queue.dispose()
  })
})
