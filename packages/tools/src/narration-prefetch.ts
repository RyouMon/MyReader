/** A bounded, locator-keyed window. Configuration changes dispose the entire window. */
export class NarrationPrefetchWindow {
  private entries = new Map<string, AbortController>()
  set(jobs: { key: string; run: (signal: AbortSignal) => Promise<unknown> }[]) {
    const window = jobs.slice(0, 2)
    const keys = new Set(window.map((job) => job.key))
    for (const [key, controller] of this.entries) {
      if (!keys.has(key)) {
        controller.abort()
        this.entries.delete(key)
      }
    }
    for (const job of window) {
      if (this.entries.has(job.key)) continue
      const controller = new AbortController()
      this.entries.set(job.key, controller)
      void job.run(controller.signal).catch(() => {
        if (this.entries.get(job.key) === controller)
          this.entries.delete(job.key)
      })
    }
  }
  clear() {
    this.entries.forEach((controller) => controller.abort())
    this.entries.clear()
  }
}
