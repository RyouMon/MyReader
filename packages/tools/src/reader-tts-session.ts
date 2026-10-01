export type ReaderTtsSessionStatus =
  | "idle"
  | "loading"
  | "ready"
  | "playing"
  | "paused"
  | "ended"
  | "error"

export type ReaderTtsSessionSnapshot = {
  sessionId: string | null
  generation: number
  status: ReaderTtsSessionStatus
  viewportDetached: boolean
}

export type ReaderTtsSessionEvent =
  | {
      type: "begin"
      navigationId?: string
      pauseAfterStart?: boolean
    }
  | {
      type: "playback"
      sessionId: string
      status: Exclude<ReaderTtsSessionStatus, "idle"> | "stopped"
      error?: string
    }
  | { type: "viewport-moved"; navigationId: string }
  | { type: "viewport-matched"; sessionId: string }
  | { type: "stop" }

export type ReaderTtsSessionEffect =
  | { type: "pause" }
  | { type: "report-error"; error: string }

export type ReaderTtsSessionTransition = {
  accepted: boolean
  snapshot: ReaderTtsSessionSnapshot
  effect?: ReaderTtsSessionEffect
}

export const READER_TTS_NO_READABLE_CONTENT_ERROR =
  "TTS_NO_READABLE_CONTENT_FROM_POSITION"
export const READER_TTS_UNKNOWN_ERROR = "TTS_UNKNOWN_ERROR"

export type ReaderTtsSessionMachine = {
  readonly snapshot: ReaderTtsSessionSnapshot
  send: (event: ReaderTtsSessionEvent) => ReaderTtsSessionTransition
}

export function createReaderTtsSessionMachine(
  sessionPrefix: string,
): ReaderTtsSessionMachine {
  let nextSessionNumber = 0
  const handledNavigationIds = new Set<string>()
  let pauseAfterStart = false
  let playbackStarted = false
  let snapshot: ReaderTtsSessionSnapshot = {
    sessionId: null,
    generation: 0,
    status: "idle",
    viewportDetached: false,
  }

  const machine: ReaderTtsSessionMachine = {
    get snapshot() {
      return snapshot
    },
    send(event) {
      if (event.type === "begin") {
        if (
          event.navigationId &&
          handledNavigationIds.has(event.navigationId)
        ) {
          return { accepted: false, snapshot }
        }
        if (event.navigationId) handledNavigationIds.add(event.navigationId)
        pauseAfterStart = event.pauseAfterStart === true
        playbackStarted = false
        nextSessionNumber += 1
        snapshot = {
          sessionId: `${sessionPrefix}:${nextSessionNumber}`,
          generation: snapshot.generation + 1,
          status: "loading",
          viewportDetached: false,
        }
        return { accepted: true, snapshot }
      }

      if (event.type === "viewport-moved") {
        if (!snapshot.sessionId) return { accepted: false, snapshot }
        snapshot = { ...snapshot, viewportDetached: true }
        return { accepted: true, snapshot }
      }

      if (event.type === "viewport-matched") {
        if (
          event.sessionId !== snapshot.sessionId ||
          !snapshot.viewportDetached
        ) {
          return { accepted: false, snapshot }
        }
        snapshot = { ...snapshot, viewportDetached: false }
        return { accepted: true, snapshot }
      }

      if (event.type === "playback") {
        if (event.sessionId !== snapshot.sessionId) {
          return { accepted: false, snapshot }
        }
        if (event.status === "playing" || event.status === "paused") {
          playbackStarted = true
        }
        if (event.status === "error") {
          const error = event.error?.trim() || READER_TTS_UNKNOWN_ERROR
          snapshot = {
            ...snapshot,
            sessionId: null,
            status: "error",
            viewportDetached: false,
          }
          return {
            accepted: true,
            snapshot,
            effect: { type: "report-error", error },
          }
        }
        if (event.status === "ended" && !playbackStarted) {
          snapshot = {
            ...snapshot,
            sessionId: null,
            status: "error",
            viewportDetached: false,
          }
          return {
            accepted: true,
            snapshot,
            effect: {
              type: "report-error",
              error: READER_TTS_NO_READABLE_CONTENT_ERROR,
            },
          }
        }
        snapshot = {
          ...snapshot,
          sessionId:
            event.status === "ended" || event.status === "stopped"
              ? null
              : snapshot.sessionId,
          status: event.status === "stopped" ? "idle" : event.status,
          viewportDetached:
            event.status === "ended" || event.status === "stopped"
              ? false
              : snapshot.viewportDetached,
        }
        if (event.status === "playing" && pauseAfterStart) {
          pauseAfterStart = false
          return { accepted: true, snapshot, effect: { type: "pause" } }
        }
        return { accepted: true, snapshot }
      }

      if (event.type === "stop") {
        pauseAfterStart = false
        playbackStarted = false
        snapshot = {
          sessionId: null,
          generation: snapshot.generation + 1,
          status: "idle",
          viewportDetached: false,
        }
        return { accepted: true, snapshot }
      }

      return { accepted: false, snapshot }
    },
  }

  return machine
}
