import { describe, expect, it } from "vitest"
import {
  createReaderTtsSessionMachine,
  READER_TTS_NO_READABLE_CONTENT_ERROR,
  READER_TTS_UNKNOWN_ERROR,
} from "../src/reader-tts-session"

describe("reader TTS session machine", () => {
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

    expect(ended.snapshot.status).toBe("error")
    expect(ended.effect).toEqual({
      type: "report-error",
      error: READER_TTS_NO_READABLE_CONTENT_ERROR,
    })
    expect(late.accepted).toBe(false)
    expect(machine.snapshot).toEqual(ended.snapshot)
  })

  it("reports a playback error once and ignores later terminal events", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    const started = machine.send({ type: "begin" })
    const sessionId = started.snapshot.sessionId!

    const failed = machine.send({
      type: "playback",
      sessionId,
      status: "error",
    })
    const ended = machine.send({
      type: "playback",
      sessionId,
      status: "ended",
    })

    expect(failed.snapshot.status).toBe("error")
    expect(failed.effect).toEqual({
      type: "report-error",
      error: READER_TTS_UNKNOWN_ERROR,
    })
    expect(ended.accepted).toBe(false)
  })

  it("invalidates the active session when narration stops", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    const started = machine.send({ type: "begin" })
    const sessionId = started.snapshot.sessionId!

    const stopped = machine.send({ type: "stop" })
    const late = machine.send({
      type: "playback",
      sessionId,
      status: "playing",
    })

    expect(stopped.snapshot).toMatchObject({
      sessionId: null,
      generation: started.snapshot.generation + 1,
      status: "idle",
    })
    expect(late.accepted).toBe(false)
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

  it("keeps a completed narration terminal after playback has started", () => {
    const machine = createReaderTtsSessionMachine("book-a")
    const started = machine.send({ type: "begin" })
    const sessionId = started.snapshot.sessionId!
    machine.send({ type: "playback", sessionId, status: "playing" })

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
