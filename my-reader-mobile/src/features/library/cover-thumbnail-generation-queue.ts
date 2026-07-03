import {
  COVER_THUMBNAIL_GENERATION_CONCURRENCY,
  COVER_THUMBNAIL_IDLE_TIMEOUT_MS,
  clampCoverThumbnailGenerationConcurrency,
} from "@/src/config/library-list-performance"
import {
  ensureCoverThumbnailFileAsync,
  type CoverThumbnailCacheFile,
  type CoverThumbnailCacheInput,
} from "@/src/services/fs/cover-thumbnail-cache"

type RequestIdleCallback = (
  callback: () => void,
  options?: { timeout?: number },
) => number
type CancelIdleCallback = (handle: number) => void

export type CoverThumbnailGenerationRequest = {
  scopeKey: string
  bookId: string
  identity: string
  input: CoverThumbnailCacheInput
}

export type CoverThumbnailGenerationResult = CoverThumbnailGenerationRequest & {
  file: CoverThumbnailCacheFile
}

type CoverThumbnailGenerationListener = (
  result: CoverThumbnailGenerationResult,
) => void

function requestThumbnailIdleCallback(callback: () => void): () => void {
  const idleApi = globalThis as typeof globalThis & {
    cancelIdleCallback?: CancelIdleCallback
    requestIdleCallback?: RequestIdleCallback
  }

  if (typeof idleApi.requestIdleCallback === "function") {
    const handle = idleApi.requestIdleCallback(callback, {
      timeout: COVER_THUMBNAIL_IDLE_TIMEOUT_MS,
    })
    return () => idleApi.cancelIdleCallback?.(handle)
  }

  const timeout = setTimeout(callback, 0)
  return () => clearTimeout(timeout)
}

function requestKey(request: CoverThumbnailGenerationRequest): string {
  return `${request.scopeKey}:${request.identity}`
}

class CoverThumbnailGenerationQueue {
  private activeKeys = new Set<string>()
  private cancelScheduledIdleCallbacks = new Set<() => void>()
  private maxConcurrency = COVER_THUMBNAIL_GENERATION_CONCURRENCY
  private listeners = new Set<CoverThumbnailGenerationListener>()
  private paused = true
  private pending = new Map<string, CoverThumbnailGenerationRequest>()

  enqueue(requests: CoverThumbnailGenerationRequest[]): void {
    for (const request of requests) {
      const key = requestKey(request)
      if (this.activeKeys.has(key) || this.pending.has(key)) {
        continue
      }
      this.pending.set(key, request)
    }
    this.schedule()
  }

  setConcurrency(concurrency: number): void {
    this.maxConcurrency = clampCoverThumbnailGenerationConcurrency(concurrency)
    this.schedule()
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) {
      // Native ImageManipulator work cannot be aborted once it starts. Keep
      // active jobs alive, and drop queued offscreen jobs; the hook will enqueue
      // the current viewability window again when scrolling is quiet.
      this.pending.clear()
      for (const cancelScheduledIdle of this.cancelScheduledIdleCallbacks) {
        cancelScheduledIdle()
      }
      this.cancelScheduledIdleCallbacks.clear()
      return
    }
    this.schedule()
  }

  subscribe(listener: CoverThumbnailGenerationListener): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  resetForTests(): void {
    this.activeKeys.clear()
    for (const cancelScheduledIdle of this.cancelScheduledIdleCallbacks) {
      cancelScheduledIdle()
    }
    this.cancelScheduledIdleCallbacks.clear()
    this.maxConcurrency = COVER_THUMBNAIL_GENERATION_CONCURRENCY
    this.listeners.clear()
    this.paused = true
    this.pending.clear()
  }

  private concurrency(): number {
    return this.maxConcurrency
  }

  private schedule(): void {
    if (this.paused) {
      return
    }

    while (
      this.pending.size > 0 &&
      this.activeKeys.size + this.cancelScheduledIdleCallbacks.size <
        this.concurrency()
    ) {
      let cancelScheduledIdle: () => void
      cancelScheduledIdle = requestThumbnailIdleCallback(() => {
        this.cancelScheduledIdleCallbacks.delete(cancelScheduledIdle)
        void this.runNext()
      })
      this.cancelScheduledIdleCallbacks.add(cancelScheduledIdle)
    }
  }

  private async runNext(): Promise<void> {
    if (this.paused || this.activeKeys.size >= this.concurrency()) {
      this.schedule()
      return
    }

    const next = this.pending.entries().next()
    if (next.done) {
      return
    }

    const [key, request] = next.value
    this.pending.delete(key)
    this.activeKeys.add(key)

    try {
      const file = await ensureCoverThumbnailFileAsync(request.input)
      for (const listener of this.listeners) {
        listener({ ...request, file })
      }
    } catch (error) {
      if (__DEV__) {
        console.warn("[cover-thumbnail-cache] failed to build thumbnail", {
          bookId: request.bookId,
          error,
        })
      }
    } finally {
      this.activeKeys.delete(key)
      this.schedule()
    }
  }
}

export const coverThumbnailGenerationQueue = new CoverThumbnailGenerationQueue()

export function resetCoverThumbnailGenerationQueueForTests(): void {
  coverThumbnailGenerationQueue.resetForTests()
}
