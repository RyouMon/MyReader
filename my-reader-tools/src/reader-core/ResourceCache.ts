export class ResourceCache<TKey, TValue> {
  private readonly store = new Map<TKey, TValue>()

  get(key: TKey): TValue | undefined {
    return this.store.get(key)
  }

  set(key: TKey, value: TValue): void {
    this.store.set(key, value)
  }

  has(key: TKey): boolean {
    return this.store.has(key)
  }

  delete(key: TKey): void {
    this.store.delete(key)
  }

  clear(): void {
    this.store.clear()
  }

  releaseExcept(keysToKeep: Iterable<TKey>): void {
    const keep = new Set(keysToKeep)
    for (const key of this.store.keys()) {
      if (!keep.has(key)) {
        this.store.delete(key)
      }
    }
  }
}

export interface LruResourceCacheOptions<TKey, TValue> {
  onEvict?: (key: TKey, value: TValue) => void
}

/**
 * LRU cache with a max size; oldest entries are evicted with optional `onEvict` (e.g. revoke blob URLs).
 */
export class LruResourceCache<TKey, TValue> {
  private readonly map = new Map<TKey, TValue>()
  private readonly onEvict?: (key: TKey, value: TValue) => void

  constructor(
    private readonly maxSize: number,
    options?: LruResourceCacheOptions<TKey, TValue>,
  ) {
    this.onEvict = options?.onEvict
  }

  has(key: TKey): boolean {
    return this.map.has(key)
  }

  get(key: TKey): TValue | undefined {
    const v = this.map.get(key)
    if (v === undefined) return undefined
    this.map.delete(key)
    this.map.set(key, v)
    return v
  }

  set(key: TKey, value: TValue): void {
    if (this.map.has(key)) {
      const old = this.map.get(key)!
      this.map.delete(key)
      this.onEvict?.(key, old)
    }
    this.map.set(key, value)
    while (this.map.size > this.maxSize) {
      const first = this.map.keys().next().value as TKey
      const ev = this.map.get(first)
      this.map.delete(first)
      if (ev !== undefined) this.onEvict?.(first, ev)
    }
  }

  clear(): void {
    if (this.onEvict) {
      for (const [k, v] of this.map) {
        this.onEvict(k, v)
      }
    }
    this.map.clear()
  }

  releaseExcept(keysToKeep: Iterable<TKey>): void {
    const keep = new Set(keysToKeep)
    for (const key of [...this.map.keys()]) {
      if (!keep.has(key)) {
        const v = this.map.get(key as TKey)
        this.map.delete(key as TKey)
        if (v !== undefined) this.onEvict?.(key as TKey, v)
      }
    }
  }
}
