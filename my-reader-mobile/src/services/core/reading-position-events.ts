import type { SyncedReadingPosition } from "my-reader-core"

type ReceivedPositions = {
  libraryId: string
  positions: SyncedReadingPosition[]
}
const listeners = new Set<(event: ReceivedPositions) => void>()

export function announceReadingPositions(
  libraryId: string,
  positions: SyncedReadingPosition[],
) {
  for (const listener of listeners) listener({ libraryId, positions })
}

export function subscribeReadingPositions(
  listener: (event: ReceivedPositions) => void,
) {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
