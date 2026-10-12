import { describe, expect, it } from "vitest"
import { ReaderNavigationHistory } from "../src/reader-navigation-history"
import type { ReaderLocator } from "../src/reader-toc"

const page = (position: number): ReaderLocator => ({
  href: "publication.pdf",
  type: "application/pdf",
  locations: { position, progression: 0 },
})

describe("reader navigation history", () => {
  it("returns through explicit jumps while normal reading updates only the current stop", () => {
    const history = new ReaderNavigationHistory()
    history.update(page(80))
    history.jump(page(20))
    history.update(page(21))
    history.jump(page(50))
    expect(history.move(-1)).toEqual(page(21))
    expect(history.move(-1)).toEqual(page(80))
    expect(history.move(1)).toEqual(page(21))
    history.jump(page(60))
    expect(history.move(1)).toBeNull()
    expect(history.move(-1)).toEqual(page(21))
    expect(history.move(-1)).toEqual(page(80))
  })
  it("offers a new remote stop without moving the viewport or discarding the forward path", () => {
    const history = new ReaderNavigationHistory()
    history.update(page(80))
    history.jump(page(20))
    history.move(-1)
    history.receiveRemote("remote-1", page(10))
    expect(history.getSnapshot().entries[history.getSnapshot().index]).toEqual(
      page(80),
    )
    expect(history.getSnapshot().remoteHint).toBe(true)
    expect(history.getSnapshot().index).toBe(0)
    history.dismissRemoteHint()
    expect(history.getSnapshot().remoteHint).toBe(false)
    history.receiveRemote("remote-1", page(10))
    expect(history.getSnapshot().remoteHint).toBe(false)
    expect(history.move(1)).toEqual(page(10))
    expect(history.move(1)).toEqual(page(20))
    expect(history.move(-1)).toEqual(page(10))
    expect(history.move(-1)).toEqual(page(80))
  })

  it("starts with an empty stack for a new reading session", () => {
    const previous = new ReaderNavigationHistory()
    previous.update(page(1))
    previous.jump(page(10))
    const reopened = new ReaderNavigationHistory()
    reopened.update(page(10))
    expect(reopened.move(-1)).toBeNull()
    expect(reopened.move(1)).toBeNull()
  })

  it("preserves different viewport locations within the same sampled position", () => {
    const history = new ReaderNavigationHistory()
    const locator = (progression: number): ReaderLocator => ({
      href: "chapter.xhtml",
      type: "application/xhtml+xml",
      locations: { position: 1, progression },
    })
    history.update(locator(0.1))
    history.update(locator(0.2))
    history.jump(locator(0.8))
    expect(history.move(-1)).toEqual(locator(0.2))
    history.receiveRemote("remote", locator(0.6))
    expect(history.move(1)).toEqual(locator(0.6))
  })
})
