import type { ImageChapterData } from "../../types"
import { LruResourceCache } from "../../reader-core/ResourceCache"
import type { FixedPageResource, FixedViewportState } from "./types"

export interface FixedLayoutEngineOptions {
  /** Max decoded pages to retain; older entries are revoked (blob URLs) on eviction. */
  maxCachedPages?: number
  /** Pages ahead/behind current index to eagerly load. */
  neighborPrefetchRadius?: number
}

/**
 * Fixed-layout engine: LRU page cache, neighbor prefetch, release outside window.
 * Actual decode stays in {@link PdfParser} / {@link ComicParser}; this layer owns session caching policy.
 */
export class FixedLayoutEngine {
  private readonly loadPage: (index: number) => Promise<ImageChapterData>
  private readonly maxCachedPages: number
  private readonly neighborPrefetchRadius: number
  private readonly lru: LruResourceCache<number, ImageChapterData>
  private readonly inFlight = new Map<number, Promise<ImageChapterData>>()

  constructor(
    loadPage: (index: number) => Promise<ImageChapterData>,
    options?: FixedLayoutEngineOptions,
  ) {
    this.loadPage = loadPage
    this.maxCachedPages = Math.max(4, options?.maxCachedPages ?? 28)
    this.neighborPrefetchRadius = Math.max(0, options?.neighborPrefetchRadius ?? 3)
    this.lru = new LruResourceCache<number, ImageChapterData>(this.maxCachedPages, {
      onEvict: (_key, value) => {
        try {
          URL.revokeObjectURL(value.imageUrl)
        } catch {
          /* ignore */
        }
      },
    })
  }

  getViewportState(currentIndex: number, totalPages: number): FixedViewportState {
    const windowIndices = this.computeWindowIndices(
      currentIndex,
      totalPages,
      this.neighborPrefetchRadius,
    )
    return {
      currentIndex,
      totalPages,
      windowIndices,
    }
  }

  /**
   * Returns cached page or loads via parser; updates LRU order.
   */
  async getFixedPage(index: number): Promise<ImageChapterData> {
    const hit = this.lru.get(index)
    if (hit) return hit

    let pending = this.inFlight.get(index)
    if (!pending) {
      pending = this.loadPage(index).then((data) => {
        this.inFlight.delete(index)
        this.lru.set(index, data)
        return data
      })
      this.inFlight.set(index, pending)
    }
    return pending
  }

  /**
   * Fire-and-forget loads for neighbors; does not block current navigation.
   */
  prefetchFixedPagesAround(centerIndex: number, totalPages: number): void {
    const indices = this.computeWindowIndices(
      centerIndex,
      totalPages,
      this.neighborPrefetchRadius,
    )
    for (const i of indices) {
      if (this.lru.has(i)) continue
      if (this.inFlight.has(i)) continue
      void this.getFixedPage(i).catch(() => {
        /* ignore */
      })
    }
  }

  /**
   * Prefetch explicit indices (e.g. virtualizer visible range).
   */
  prefetchFixedPages(indexes: readonly number[], totalPages: number): void {
    for (const i of indexes) {
      if (i < 0 || i >= totalPages) continue
      if (this.lru.has(i)) continue
      if (this.inFlight.has(i)) continue
      void this.getFixedPage(i).catch(() => {})
    }
  }

  /**
   * Drop cached pages not in `keep`; revokes blob URLs via LRU onEvict.
   */
  releaseFixedPagesExcept(keep: ReadonlySet<number>): void {
    this.lru.releaseExcept(keep)
    for (const [idx, p] of this.inFlight) {
      if (!keep.has(idx)) {
        void p.catch(() => {})
        this.inFlight.delete(idx)
      }
    }
  }

  clear(): void {
    this.lru.clear()
    this.inFlight.clear()
  }

  toFixedPageResource(data: ImageChapterData): FixedPageResource {
    return {
      index: data.index,
      uri: data.imageUrl,
    }
  }

  private computeWindowIndices(
    center: number,
    totalPages: number,
    radius: number,
  ): number[] {
    if (totalPages <= 0) return []
    const lo = Math.max(0, center - radius)
    const hi = Math.min(totalPages - 1, center + radius)
    const out: number[] = []
    for (let i = lo; i <= hi; i++) out.push(i)
    return out
  }
}
