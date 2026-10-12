import { canonicalizeReaderLocatorForStorage } from "./reader-bookmarks"
import type { ReaderLocator } from "./reader-toc"

function locationKey(locator: ReaderLocator) {
  const { href, type, locations, text, target } =
    canonicalizeReaderLocatorForStorage(locator)
  return JSON.stringify({ href, type, locations, text, target }, (_, value) =>
    value && typeof value === "object" && !Array.isArray(value)
      ? Object.fromEntries(
          Object.keys(value)
            .sort()
            .map((key) => [key, value[key]]),
        )
      : value,
  )
}

function sameLocation(left: ReaderLocator, right: ReaderLocator) {
  return locationKey(left) === locationKey(right)
}

export type NavigationDirection = -1 | 1
export type ReaderNavigationSnapshot = {
  entries: readonly ReaderLocator[]
  index: number
  remoteHint: boolean
}

/** One open book owns one history. Nothing here is persisted. */
export class ReaderNavigationHistory {
  private snapshot: ReaderNavigationSnapshot = {
    entries: [],
    index: -1,
    remoteHint: false,
  }
  private listeners = new Set<() => void>()
  private seenRemoteOperations = new Set<string>()
  private pendingRemote = new Map<string, ReaderLocator>()

  getSnapshot = () => this.snapshot
  subscribe = (listener: () => void) => {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  private publish(snapshot: ReaderNavigationSnapshot) {
    this.snapshot = snapshot
    for (const listener of this.listeners) listener()
  }

  update(locator: ReaderLocator) {
    const { entries, index } = this.snapshot
    if (index < 0) {
      this.publish({ ...this.snapshot, entries: [locator], index: 0 })
      for (const [operationId, remote] of this.pendingRemote)
        this.receiveRemote(operationId, remote)
      this.pendingRemote.clear()
    } else if (!sameLocation(entries[index]!, locator)) {
      const next = [...entries]
      next[index] = locator
      this.publish({ ...this.snapshot, entries: next })
    }
  }

  jump(locator: ReaderLocator) {
    const { entries, index } = this.snapshot
    if (index >= 0 && sameLocation(entries[index]!, locator)) return
    const next = [...entries.slice(0, index + 1), locator]
    this.publish({ entries: next, index: next.length - 1, remoteHint: false })
  }

  move(direction: NavigationDirection): ReaderLocator | null {
    const index = this.snapshot.index + direction
    const target = this.snapshot.entries[index]
    if (!target) return null
    this.publish({ ...this.snapshot, index, remoteHint: false })
    return target
  }

  receiveRemote(operationId: string, locator: ReaderLocator) {
    if (this.seenRemoteOperations.has(operationId)) return
    const { entries, index } = this.snapshot
    if (index < 0) {
      this.pendingRemote.set(operationId, locator)
      return
    }
    this.seenRemoteOperations.add(operationId)
    if (sameLocation(entries[index]!, locator)) return
    const next = entries[index + 1]
    if (next && sameLocation(next, locator)) {
      this.publish({ ...this.snapshot, remoteHint: true })
      return
    }
    this.publish({
      entries: [
        ...entries.slice(0, index + 1),
        locator,
        ...entries.slice(index + 1),
      ],
      index,
      remoteHint: true,
    })
  }

  dismissRemoteHint() {
    if (this.snapshot.remoteHint)
      this.publish({ ...this.snapshot, remoteHint: false })
  }
}
