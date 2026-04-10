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
