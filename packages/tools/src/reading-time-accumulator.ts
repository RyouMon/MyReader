export const READING_HEARTBEAT_MS = 30_000
export const MIN_READING_INTERVAL_MS = 5_000
export const MAX_READING_POSITION_MS = 120_000

export type TimedReadingInterval = {
  startedAt: number
  durationMs: number
}

export class ReadingTimeAccumulator {
  private active = false
  private lastMeasuredAt = 0
  private remainingPositionMs = MAX_READING_POSITION_MS

  resume(now: number): void {
    this.active = true
    this.lastMeasuredAt = now
    this.remainingPositionMs = MAX_READING_POSITION_MS
  }

  pause(now: number): TimedReadingInterval | null {
    const interval = this.collect(now)
    this.active = false
    return interval
  }

  pulse(now: number): TimedReadingInterval | null {
    return this.collect(now)
  }

  locationChanged(now: number): TimedReadingInterval | null {
    const interval = this.collect(now)
    this.lastMeasuredAt = now
    this.remainingPositionMs = MAX_READING_POSITION_MS
    return interval
  }

  private collect(now: number): TimedReadingInterval | null {
    if (!this.active) return null
    if (now <= this.lastMeasuredAt) {
      this.lastMeasuredAt = now
      return null
    }

    const startedAt = this.lastMeasuredAt
    const elapsedMs = now - startedAt
    const durationMs = Math.min(elapsedMs, this.remainingPositionMs)
    this.lastMeasuredAt = now
    this.remainingPositionMs -= durationMs

    if (durationMs < MIN_READING_INTERVAL_MS) return null
    return { startedAt, durationMs }
  }
}

export type LocalDayInterval = {
  localDay: string
  startedAt: number
  durationSeconds: number
}

export function splitReadingIntervalByLocalDay(
  interval: TimedReadingInterval,
): LocalDayInterval[] {
  const endAt = interval.startedAt + interval.durationMs
  const totalSeconds = Math.floor(interval.durationMs / 1000)
  if (totalSeconds <= 0) return []

  const pieces: {
    localDay: string
    startedAt: number
    durationMs: number
  }[] = []
  let cursor = interval.startedAt
  while (cursor < endAt) {
    const date = new Date(cursor)
    const nextMidnight = new Date(
      date.getFullYear(),
      date.getMonth(),
      date.getDate() + 1,
    ).getTime()
    const pieceEnd = Math.min(endAt, nextMidnight)
    pieces.push({
      localDay: `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`,
      startedAt: cursor,
      durationMs: pieceEnd - cursor,
    })
    cursor = pieceEnd
  }

  let assignedSeconds = 0
  return pieces.flatMap((piece, index) => {
    const isLast = index === pieces.length - 1
    const durationSeconds = isLast
      ? totalSeconds - assignedSeconds
      : Math.min(
          totalSeconds - assignedSeconds,
          Math.round(piece.durationMs / 1000),
        )
    assignedSeconds += durationSeconds
    return durationSeconds > 0
      ? [
          {
            localDay: piece.localDay,
            startedAt: piece.startedAt,
            durationSeconds,
          },
        ]
      : []
  })
}
