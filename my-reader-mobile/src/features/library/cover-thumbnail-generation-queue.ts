import { COVER_THUMBNAIL_IDLE_TIMEOUT_MS } from "@/src/config/library-list-performance"
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
  private activeKey: string | null = null
  private cancelScheduledIdle: (() => void) | null = null
  private listeners = new Set<CoverThumbnailGenerationListener>()
  private paused = true
  private pending = new Map<string, CoverThumbnailGenerationRequest>()

  enqueue(requests: CoverThumbnailGenerationRequest[]): void {
    for (const request of requests) {
      const key = requestKey(request)
      if (this.activeKey === key || this.pending.has(key)) {
        continue
      }
      this.pending.set(key, request)
    }
    this.schedule()
  }

  setPaused(paused: boolean): void {
    this.paused = paused
    if (paused) {
      // Native ImageManipulator work cannot be aborted once it starts. Keep at
      // most the active job alive, and drop queued offscreen jobs; the hook will
      // enqueue the current viewability window again when scrolling is quiet.
      this.pending.clear()
      this.cancelScheduledIdle?.()
      this.cancelScheduledIdle = null
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
    this.activeKey = null
    this.cancelScheduledIdle?.()
    this.cancelScheduledIdle = null
    this.listeners.clear()
    this.paused = true
    this.pending.clear()
  }

  private schedule(): void {
    if (this.paused || this.activeKey || this.cancelScheduledIdle) {
      return
    }
    if (this.pending.size === 0) {
      return
    }

    this.cancelScheduledIdle = requestThumbnailIdleCallback(() => {
      this.cancelScheduledIdle = null
      void this.runNext()
    })
  }

  private async runNext(): Promise<void> {
    if (this.paused || this.activeKey) {
      this.schedule()
      return
    }

    const next = this.pending.entries().next()
    if (next.done) {
      return
    }

    const [key, request] = next.value
    this.pending.delete(key)
    this.activeKey = key

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
      if (this.activeKey === key) {
        this.activeKey = null
      }
      this.schedule()
    }
  }
}

export const coverThumbnailGenerationQueue = new CoverThumbnailGenerationQueue()

export function resetCoverThumbnailGenerationQueueForTests(): void {
  coverThumbnailGenerationQueue.resetForTests()
}
