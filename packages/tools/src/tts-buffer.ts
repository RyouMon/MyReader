import { ttsPerformance, type TtsPerformanceRegistry } from "./tts-performance"

export type TtsMeasuredAudio = {
  durationMs?: number | null
  synthesisMs?: number | null
  playbackRate?: number | null
}

export type TtsRun<C> = {
  text: string
  startUtf16: number
  context: C
  key: string
  language?: string
  maxChars?: number
  system?: boolean
}

export type TtsChunk<C, A> = {
  text: string
  startUtf16: number
  endUtf16: number
  context: C
  audio?: A
  seconds: number
  last: boolean
}

type Source<C, A> = {
  runs?: TtsRun<C>[]
  run: number
  offset: number
  chunks: TtsChunk<C, A>[]
  complete: boolean
  error?: unknown
}

type Options<C, A> = {
  split?: boolean
  count: number
  load: (index: number, signal: AbortSignal) => Promise<TtsRun<C>[]>
  synthesize: (run: TtsRun<C>, text: string, signal: AbortSignal) => Promise<A>
  rate?: () => number
  now?: () => number
  performance?: TtsPerformanceRegistry
}

/** One producer, bounded in playable seconds. Sources retain their Readium identity. */
export class TtsBuffer<C, A extends TtsMeasuredAudio> {
  private readonly controller = new AbortController()
  private readonly sources = new Map<number, Source<C, A>>()
  private readonly listeners = new Set<() => void>()
  private readonly now: () => number
  private readonly performance: TtsPerformanceRegistry
  private active = 0
  private cursor = 0
  private elapsed = 0
  private started: number | null = null
  private target = 10
  private running = false
  private timer: ReturnType<typeof setTimeout> | undefined

  constructor(private readonly options: Options<C, A>) {
    this.now = options.now ?? (() => performance.now())
    this.performance = options.performance ?? ttsPerformance
  }

  activate(index: number) {
    if (index !== this.active) {
      this.active = index
      this.elapsed = 0
      this.started = null
      for (const key of this.sources.keys())
        if (key < index) this.sources.delete(key)
    }
    this.cursor = Math.max(this.cursor, index)
    this.wake()
  }

  setPlaying(playing: boolean) {
    if (this.started !== null)
      this.elapsed += (this.now() - this.started) / 1000
    this.started = playing ? this.now() : null
    this.wake()
  }

  /** Desktop changes playback speed without regenerating the buffered files. */
  changeRate(previous: number, next: number) {
    const ratio = previous / next
    this.elapsed =
      (this.elapsed +
        (this.started === null ? 0 : (this.now() - this.started) / 1000)) *
      ratio
    if (this.started !== null) this.started = this.now()
    for (const source of this.sources.values())
      for (const chunk of source.chunks) chunk.seconds *= ratio
    this.wake()
  }

  /** Resynchronize with the actual audio boundary rather than accumulating clock drift. */
  startedChunk(index: number) {
    const chunks = this.sources.get(this.active)?.chunks ?? []
    this.elapsed = chunks.slice(0, index).reduce((sum, c) => sum + c.seconds, 0)
    this.started = this.now()
    this.wake()
  }

  get bufferedSeconds() {
    let seconds = 0
    for (let index = this.active; index < this.options.count; index++) {
      const source = this.sources.get(index)
      if (!source) break
      seconds += source.chunks.reduce((sum, c) => sum + c.seconds, 0)
      if (!source.complete) break
    }
    const elapsed =
      this.elapsed +
      (this.started === null ? 0 : (this.now() - this.started) / 1000)
    return Math.max(0, seconds - elapsed)
  }

  async read(
    sourceIndex: number,
    chunkIndex: number,
  ): Promise<TtsChunk<C, A> | undefined> {
    for (;;) {
      if (this.controller.signal.aborted)
        throw Object.assign(new Error("Aborted"), { name: "AbortError" })
      const source = this.sources.get(sourceIndex)
      if (source?.chunks[chunkIndex]) return source.chunks[chunkIndex]
      if (source?.error) throw source.error
      if (source?.complete) return undefined
      await new Promise<void>((resolve) => {
        this.listeners.add(resolve)
        this.wake()
      })
    }
  }

  dispose() {
    this.controller.abort()
    clearTimeout(this.timer)
    this.notify()
  }

  private notify() {
    const listeners = [...this.listeners]
    this.listeners.clear()
    listeners.forEach((listener) => listener())
  }

  private wake() {
    clearTimeout(this.timer)
    if (this.running || this.controller.signal.aborted) return
    this.running = true
    void this.fill().finally(() => {
      this.running = false
      if (
        !this.controller.signal.aborted &&
        this.started !== null &&
        this.cursor < this.options.count &&
        !this.sources.get(this.cursor)?.error
      )
        this.timer = setTimeout(() => this.wake(), 500)
    })
  }

  private async fill() {
    const signal = this.controller.signal
    while (
      !signal.aborted &&
      this.cursor < this.options.count &&
      this.bufferedSeconds < this.target
    ) {
      const index = this.cursor
      let source = this.sources.get(index)
      if (!source) {
        source = { run: 0, offset: 0, chunks: [], complete: false }
        this.sources.set(index, source)
      }
      if (source.error) return
      try {
        source.runs ??= (await this.options.load(index, signal)).filter(
          (run) => run.text.length > 0,
        )
        if (signal.aborted) return
        const run = source.runs[source.run]
        if (!run) {
          source.complete = true
          this.cursor++
          this.notify()
          continue
        }
        await this.append(source, run, signal)
        if (signal.aborted) return
        if (source.complete) this.cursor++
        this.notify()
      } catch (error) {
        source.error = error
        this.notify()
        return
      }
    }
  }
  private async append(
    source: Source<C, A>,
    run: TtsRun<C>,
    signal: AbortSignal,
  ) {
    const policy = this.performance.get(run.key)
    this.target = policy.targetSeconds
    const rest = run.text.slice(source.offset)
    const length =
      run.system || this.options.split === false
        ? rest.length
        : policy.take(
            rest,
            run.maxChars ?? 600,
            this.bufferedSeconds,
            run.language,
          )
    const text = rest.slice(0, length)
    const started = this.now()
    let audio: A | undefined
    try {
      audio = run.system
        ? undefined
        : await this.options.synthesize(run, text, signal)
    } catch (error) {
      if (!signal.aborted) policy.backoff()
      throw error
    }
    if (signal.aborted) return
    const chars = Array.from(text).length
    const rate = audio?.playbackRate ?? this.options.rate?.() ?? 1
    const seconds =
      audio?.durationMs && audio.durationMs > 0
        ? audio.durationMs / 1000 / rate
        : policy.audioSeconds(chars) / rate
    if (
      audio?.synthesisMs != null &&
      audio.durationMs &&
      audio.durationMs > 0
    ) {
      policy.record({
        chars,
        milliseconds: Math.max(audio.synthesisMs, this.now() - started),
        audioSeconds: audio.durationMs / 1000,
        playbackSeconds: seconds,
      })
      this.target = policy.targetSeconds
    }
    const startUtf16 = run.startUtf16 + source.offset
    source.offset += text.length
    if (source.offset === run.text.length) {
      source.offset = 0
      source.run++
    }
    source.complete = source.run === source.runs!.length
    source.chunks.push({
      text,
      startUtf16,
      endUtf16: startUtf16 + text.length,
      context: run.context,
      audio,
      seconds,
      last: source.complete,
    })
  }
}
