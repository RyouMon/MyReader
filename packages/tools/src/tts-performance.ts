type Sample = {
  chars: number
  milliseconds: number
  audioSeconds: number
  playbackSeconds?: number
}

/** Online measurements belong to a synthesis configuration, not to a book or role. */
export class TtsPerformance {
  private samples: Sample[] = []
  private fast = 0
  private slow = 0
  private ceiling = 120

  record(sample: Sample) {
    if (
      ![sample.chars, sample.milliseconds, sample.audioSeconds].every(
        (value) => Number.isFinite(value) && value > 0,
      )
    )
      return
    this.samples.push(sample)
    this.samples = this.samples.slice(-32)
    const cost = sample.milliseconds / sample.chars
    this.fast = this.fast ? this.fast * 0.6 + cost * 0.4 : cost
    this.slow = this.slow ? this.slow * 0.9 + cost * 0.1 : cost
    if (
      sample.milliseconds <
      (sample.playbackSeconds ?? sample.audioSeconds) * 800
    )
      this.ceiling = Math.min(4096, Math.max(this.ceiling, sample.chars) + 40)
    else this.backoff()
  }

  backoff() {
    this.ceiling = Math.max(40, Math.floor(this.ceiling / 2))
  }

  get targetSeconds() {
    const times = this.samples.map((s) => s.milliseconds).sort((a, b) => a - b)
    const tail = times[Math.floor(times.length * 0.9)] ?? 3000
    return Math.min(45, Math.max(10, (tail / 1000) * 2.5 + 3))
  }

  audioSeconds(chars: number) {
    const totals = this.samples.reduce(
      (sum, s) => ({
        chars: sum.chars + s.chars,
        seconds: sum.seconds + s.audioSeconds,
      }),
      { chars: 0, seconds: 0 },
    )
    return chars * (totals.chars ? totals.seconds / totals.chars : 0.22)
  }

  private predict(chars: number) {
    // Retain request overhead: fitting a slope through zero overestimates long batches.
    const count = this.samples.length
    const x = this.samples.reduce((sum, s) => sum + s.chars, 0) / count
    const y = this.samples.reduce((sum, s) => sum + s.milliseconds, 0) / count
    const variance = this.samples.reduce(
      (sum, s) => sum + (s.chars - x) ** 2,
      0,
    )
    const covariance = this.samples.reduce(
      (sum, s) => sum + (s.chars - x) * (s.milliseconds - y),
      0,
    )
    const slope = variance > 0 ? Math.max(0, covariance / variance) : this.slow
    const affine = Math.max(0, y - slope * x) + slope * chars
    const recent = chars * Math.max(this.fast, this.slow)
    return Math.max(affine, recent) * 1.2 + 300
  }

  /** A cold start is one sentence. Exploration grows only behind playable audio. */
  take(
    text: string,
    maxChars: number,
    bufferedSeconds: number,
    language?: string,
  ) {
    const durationLimit = this.samples.length
      ? Math.floor((this.targetSeconds * 2) / this.audioSeconds(1))
      : 120
    const batchLimit = Math.max(
      1,
      Math.min(maxChars, this.ceiling, durationLimit),
    )
    const points = Array.from(text)
    const limit = points.slice(0, batchLimit).join("").length
    const sentences = sentenceEnds(text, language)
    // Small boundary slack avoids leaving a word or punctuation in its own request.
    const sentenceEnd = points
      .slice(0, Math.min(maxChars, Math.ceil(batchLimit * 1.25)))
      .join("").length
    const first =
      sentences[0]! <= sentenceEnd ? sentences[0]! : wordBoundary(text, limit)
    const boundaries = sentences.filter((end) => end <= limit)
    if (!this.samples.length || bufferedSeconds < 2) return first
    const budget = Math.min(15_000, (bufferedSeconds - 1.5) * 1000)
    let end = first
    for (const candidate of boundaries) {
      if (this.predict(Array.from(text.slice(0, candidate)).length) > budget)
        break
      end = candidate
    }
    return end
  }
}

function wordBoundary(text: string, end: number): number {
  const prefix = text.slice(0, end)
  const breaks = Array.from(prefix.matchAll(/[\s,;:，；：、]+/gu))
  const last = breaks[breaks.length - 1]
  return last && last.index > 0 ? last.index + last[0].length : end
}

function sentenceEnds(text: string, language?: string): number[] {
  const Segmenter = (
    Intl as typeof Intl & {
      Segmenter?: new (
        language?: string,
        options?: { granularity: "sentence" },
      ) => {
        segment(text: string): Iterable<{ index: number; segment: string }>
      }
    }
  ).Segmenter
  if (Segmenter) {
    try {
      return Array.from(
        new Segmenter(language || undefined, {
          granularity: "sentence",
        }).segment(text),
        (part) => part.index + part.segment.length,
      )
    } catch {
      /* Unrecognized language tags use the punctuation fallback. */
    }
  }
  const ends = Array.from(
    text.matchAll(/[。！？.!?]+[”’」』"']*\s*/gu),
    (match) => match.index + match[0].length,
  )
  if (ends[ends.length - 1] !== text.length) ends.push(text.length)
  return ends
}

export class TtsPerformanceRegistry {
  private entries = new Map<
    string,
    { value: TtsPerformance; touched: number }
  >()
  constructor(private readonly now = () => Date.now()) {}
  get(key: string) {
    const previous = this.entries.get(key)
    const value =
      previous && this.now() - previous.touched < 30 * 60_000
        ? previous.value
        : new TtsPerformance()
    this.entries.delete(key)
    this.entries.set(key, { value, touched: this.now() })
    if (this.entries.size > 64)
      this.entries.delete(this.entries.keys().next().value!)
    return value
  }
}

export const ttsPerformance = new TtsPerformanceRegistry()
