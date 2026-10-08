import { describe, expect, it } from "vitest"
import {
  createReaderTtsSessionMachine,
  READER_TTS_NO_READABLE_CONTENT_ERROR,
} from "../src/reader-tts-session"

describe("reader TTS session machine", () => {
  it("starts idle and accepts viewport movement only during a session", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    expect(machine.snapshot).toEqual({
      sessionId: null,
      generation: 0,
      status: "idle",
      viewportDetached: false,
    })
    expect(
      machine.send({ type: "viewport-moved", navigationId: "idle" }),
    ).toEqual({
      accepted: false,
      snapshot: machine.snapshot,
    })

    const first = machine.send({ type: "begin" })
    expect(first.accepted).toBe(true)
    expect(first.snapshot).toEqual({
      sessionId: expect.any(String),
      generation: 1,
      status: "loading",
      viewportDetached: false,
    })
    machine.send({ type: "viewport-moved", navigationId: "page-1" })
    const second = machine.send({ type: "begin" })
    expect(second.snapshot).toMatchObject({
      generation: 2,
      status: "loading",
      viewportDetached: false,
    })
    expect(second.snapshot.sessionId).not.toBe(first.snapshot.sessionId)
  })

  it("keeps narration running when the reader viewport moves", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    const started = machine.send({ type: "begin" })
    const sessionId = started.snapshot.sessionId!
    machine.send({ type: "playback", sessionId, status: "playing" })

    const moved = machine.send({
      type: "viewport-moved",
      navigationId: "navigation-1",
    })

    expect(moved.accepted).toBe(true)
    expect(moved.effect).toBeUndefined()
    expect(moved.snapshot).toMatchObject({
      sessionId,
      generation: started.snapshot.generation,
      status: "playing",
      viewportDetached: true,
    })
    const continuing = machine.send({
      type: "playback",
      sessionId,
      status: "playing",
    })
    expect(continuing.accepted).toBe(true)
    expect(continuing.snapshot).toEqual(moved.snapshot)
    expect(continuing.effect).toBeUndefined()
  })

  it("keeps narration paused when the reader viewport moves and returns", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    const started = machine.send({ type: "begin" })
    const sessionId = started.snapshot.sessionId!
    machine.send({ type: "playback", sessionId, status: "paused" })

    const moved = machine.send({
      type: "viewport-moved",
      navigationId: "navigation-1",
    })
    const returned = machine.send({
      type: "viewport-matched",
      sessionId,
    })

    expect(moved.snapshot).toMatchObject({
      sessionId,
      status: "paused",
      viewportDetached: true,
    })
    expect(returned.snapshot).toMatchObject({
      sessionId,
      status: "paused",
      viewportDetached: false,
    })
  })

  it("reattaches the viewport without replacing the narration session", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    const started = machine.send({ type: "begin" })
    const sessionId = started.snapshot.sessionId!
    machine.send({ type: "playback", sessionId, status: "playing" })
    machine.send({
      type: "viewport-moved",
      navigationId: "navigation-1",
    })

    const reattached = machine.send({
      type: "viewport-matched",
      sessionId,
    })

    expect(reattached.accepted).toBe(true)
    expect(reattached.snapshot).toMatchObject({
      sessionId,
      generation: started.snapshot.generation,
      status: "playing",
      viewportDetached: false,
    })
  })

  it("rejects a viewport match from an older narration session", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    const first = machine.send({ type: "begin" })
    const second = machine.send({ type: "begin" })
    machine.send({ type: "viewport-moved", navigationId: "navigation-1" })

    const staleMatch = machine.send({
      type: "viewport-matched",
      sessionId: first.snapshot.sessionId!,
    })

    expect(staleMatch.accepted).toBe(false)
    expect(staleMatch.snapshot).toEqual(machine.snapshot)
    expect(staleMatch.snapshot).toMatchObject({
      sessionId: second.snapshot.sessionId,
      viewportDetached: true,
    })
  })

  it("clears the detached viewport when narration finishes", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    const started = machine.send({ type: "begin" })
    const sessionId = started.snapshot.sessionId!
    machine.send({ type: "playback", sessionId, status: "playing" })
    machine.send({
      type: "viewport-moved",
      navigationId: "navigation-1",
    })

    const ended = machine.send({
      type: "playback",
      sessionId,
      status: "ended",
    })

    expect(ended.snapshot.viewportDetached).toBe(false)
  })

  it("rejects late playback events after a navigation starts a new session", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    const first = machine.send({ type: "begin" })
    const second = machine.send({
      type: "begin",
      navigationId: "navigation-1",
    })

    const late = machine.send({
      type: "playback",
      sessionId: first.snapshot.sessionId!,
      status: "playing",
    })

    expect(second.accepted).toBe(true)
    expect(second.snapshot.sessionId).not.toBe(first.snapshot.sessionId)
    expect(late.accepted).toBe(false)
    expect(machine.snapshot).toEqual(second.snapshot)
  })

  it("starts only one session for the same navigation transaction", () => {
    const machine = createReaderTtsSessionMachine("book-a")

    const first = machine.send({
      type: "begin",
      navigationId: "navigation-1",
    })
    const duplicate = machine.send({
      type: "begin",
      navigationId: "navigation-1",
    })

    expect(first.accepted).toBe(true)
    expect(duplicate.accepted).toBe(false)
    expect(duplicate.snapshot).toEqual(first.snapshot)
  })

  it("rejects an older navigation transaction after a newer one begins", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    machine.send({ type: "begin", navigationId: "navigation-1" })
    const latest = machine.send({
      type: "begin",
      navigationId: "navigation-2",
    })

    const delayed = machine.send({
      type: "begin",
      navigationId: "navigation-1",
    })

    expect(delayed.accepted).toBe(false)
    expect(machine.snapshot).toEqual(latest.snapshot)
  })

  it("preserves pause intent when a replacement session starts playing", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    const started = machine.send({
      type: "begin",
      pauseAfterStart: true,
    })

    const ready = machine.send({
      type: "playback",
      sessionId: started.snapshot.sessionId!,
      status: "ready",
    })
    expect(ready.accepted).toBe(true)
    expect(ready.snapshot.status).toBe("ready")
    expect(ready.effect).toBeUndefined()

    const playing = machine.send({
      type: "playback",
      sessionId: started.snapshot.sessionId!,
      status: "playing",
    })
    const repeated = machine.send({
      type: "playback",
      sessionId: started.snapshot.sessionId!,
      status: "playing",
    })

    expect(playing.accepted).toBe(true)
    expect(playing.snapshot.status).toBe("playing")
    expect(playing.effect).toEqual({ type: "pause" })
    expect(repeated.effect).toBeUndefined()
  })

  it("reports an empty narration attempt and keeps it terminal", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    const started = machine.send({ type: "begin" })
    const sessionId = started.snapshot.sessionId!
    machine.send({ type: "viewport-moved", navigationId: "page-1" })

    const ended = machine.send({
      type: "playback",
      sessionId,
      status: "ended",
    })
    const late = machine.send({
      type: "playback",
      sessionId,
      status: "playing",
    })

    expect(ended.accepted).toBe(true)
    expect(ended.snapshot).toEqual({
      sessionId: null,
      generation: started.snapshot.generation,
      status: "error",
      viewportDetached: false,
    })
    expect(ended.effect).toEqual({
      type: "report-error",
      error: "TTS_NO_READABLE_CONTENT_FROM_POSITION",
    })
    expect(late.accepted).toBe(false)
    expect(machine.snapshot).toEqual(ended.snapshot)
  })

  it.each([
    [undefined, "TTS_UNKNOWN_ERROR"],
    [" \n ", "TTS_UNKNOWN_ERROR"],
    ["  Provider unavailable  ", "Provider unavailable"],
  ])("reports error %j once and ignores later terminal events", (error, expected) => {
    const machine = createReaderTtsSessionMachine("book-a")
    const started = machine.send({ type: "begin" })
    const sessionId = started.snapshot.sessionId!
    machine.send({ type: "viewport-moved", navigationId: "page-1" })

    const failed = machine.send({
      type: "playback",
      sessionId,
      status: "error",
      error,
    })
    const ended = machine.send({
      type: "playback",
      sessionId,
      status: "ended",
    })

    expect(failed.accepted).toBe(true)
    expect(failed.snapshot).toEqual({
      sessionId: null,
      generation: started.snapshot.generation,
      status: "error",
      viewportDetached: false,
    })
    expect(failed.effect).toEqual({
      type: "report-error",
      error: expected,
    })
    expect(ended.accepted).toBe(false)
  })

  it("invalidates the active session when narration stops", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    const started = machine.send({ type: "begin" })
    const sessionId = started.snapshot.sessionId!
    machine.send({ type: "viewport-moved", navigationId: "page-1" })

    const stopped = machine.send({ type: "stop" })
    const late = machine.send({
      type: "playback",
      sessionId,
      status: "playing",
    })

    expect(stopped.accepted).toBe(true)
    expect(stopped.snapshot).toEqual({
      sessionId: null,
      generation: started.snapshot.generation + 1,
      status: "idle",
      viewportDetached: false,
    })
    expect(late.accepted).toBe(false)
  })

  it("handles a native stopped event without reporting an empty narration", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    const started = machine.send({ type: "begin" })
    const sessionId = started.snapshot.sessionId!
    machine.send({ type: "viewport-moved", navigationId: "page-1" })

    const stopped = machine.send({
      type: "playback",
      sessionId,
      status: "stopped",
    })
    expect(stopped.accepted).toBe(true)
    expect(stopped.effect).toBeUndefined()
    expect(stopped.snapshot).toEqual({
      sessionId: null,
      generation: started.snapshot.generation,
      status: "idle",
      viewportDetached: false,
    })
    expect(
      machine.send({ type: "playback", sessionId, status: "playing" }).accepted,
    ).toBe(false)
  })

  it.each([
    "stop",
    "error",
    "ended",
  ] as const)("starts a fresh attempt after %s without inheriting successful playback", (terminal) => {
    const machine = createReaderTtsSessionMachine("book-a")
    const first = machine.send({ type: "begin" })
    const sessionId = first.snapshot.sessionId!
    machine.send({ type: "playback", sessionId, status: "playing" })
    if (terminal === "stop") machine.send({ type: "stop" })
    else machine.send({ type: "playback", sessionId, status: terminal })
    const generation = machine.snapshot.generation

    const restarted = machine.send({ type: "begin" })
    expect(restarted.snapshot).toMatchObject({
      generation: generation + 1,
      status: "loading",
      viewportDetached: false,
    })
    expect(restarted.snapshot.sessionId).not.toBe(sessionId)
    const empty = machine.send({
      type: "playback",
      sessionId: restarted.snapshot.sessionId!,
      status: "ended",
    })
    expect(empty.effect).toEqual({
      type: "report-error",
      error: READER_TTS_NO_READABLE_CONTENT_ERROR,
    })
  })

  it("does not inherit pending pause intent when a loading session is replaced", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    machine.send({ type: "begin", pauseAfterStart: true })
    const replacement = machine.send({ type: "begin" })
    const playing = machine.send({
      type: "playback",
      sessionId: replacement.snapshot.sessionId!,
      status: "playing",
    })
    expect(playing.accepted).toBe(true)
    expect(playing.effect).toBeUndefined()
    expect(playing.snapshot.status).toBe("playing")
  })

  it("does not revive a stopped session from a delayed navigation callback", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    machine.send({ type: "begin", navigationId: "navigation-1" })
    const stopped = machine.send({ type: "stop" })

    const delayed = machine.send({
      type: "begin",
      navigationId: "navigation-1",
    })

    expect(delayed.accepted).toBe(false)
    expect(machine.snapshot).toEqual(stopped.snapshot)
  })

  it.each([
    "playing",
    "paused",
  ] as const)("keeps narration terminal after ending from %s", (status) => {
    const machine = createReaderTtsSessionMachine("book-a")
    const started = machine.send({ type: "begin" })
    const sessionId = started.snapshot.sessionId!
    machine.send({ type: "playback", sessionId, status })

    const ended = machine.send({
      type: "playback",
      sessionId,
      status: "ended",
    })
    const late = machine.send({
      type: "playback",
      sessionId,
      status: "playing",
    })

    expect(ended.snapshot).toMatchObject({
      sessionId: null,
      status: "ended",
    })
    expect(ended.effect).toBeUndefined()
    expect(late.accepted).toBe(false)
  })
})
