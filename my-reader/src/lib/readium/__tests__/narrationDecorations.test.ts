import { describe, expect, it, vi } from "vitest"
import type { EpubNavigator } from "@readium/navigator"
import type { ReadingPlanEntry } from "@my-reader/tools/narration-plan"
import { applyNarrationDecorations } from "../narrationDecorations"

vi.mock("../epubAnnotations", async (original) => ({
  ...(await original<typeof import("../epubAnnotations")>()),
  textRangeForLocator: () => null,
}))

describe("narration decorations", () => {
  it("isolates role colors and clears only narration decorations", () => {
    const doc = document.implementation.createHTMLDocument()
    const base = doc.createElement("base")
    base.href = "https://book.local/chapter.xhtml"
    doc.head.append(base)
    const note = doc.createElement("div")
    note.id = "existing-note"
    doc.body.append(note)
    const send = vi.fn()
    const navigator = {
      _cframes: [{ iframe: { contentDocument: doc }, msg: { send } }],
    } as unknown as EpubNavigator
    const entries = ["narrator", "alice"].map((characterId, index) => ({
      id: String(index),
      characterId,
      characterName: characterId,
      position: index,
      sourceKey: JSON.stringify({
        href: "chapter.xhtml",
        type: "application/xhtml+xml",
        text: { highlight: "Hello" },
      }),
      speech: { text: "Hello", startUtf16: 0, endUtf16: 5, instructions: "" },
    })) satisfies ReadingPlanEntry[]

    applyNarrationDecorations(navigator, entries)
    const added = send.mock.calls
      .map(([, request]) => request)
      .filter((r) => r.action === "add")
    expect(added).toHaveLength(2)
    expect(new Set(added.map((r) => r.group)).size).toBe(2)
    expect(doc.getElementById("myreader-narration-labels")).not.toBeNull()

    send.mockClear()
    applyNarrationDecorations(navigator, [])
    expect(doc.getElementById("myreader-narration-labels")).toBeNull()
    expect(doc.getElementById("existing-note")).toBe(note)
    expect(send.mock.calls.length).toBeGreaterThan(0)
    for (const [, request] of send.mock.calls) {
      expect(request.action).toBe("clear")
      expect(request.group).toMatch(/^narration-plan-/)
    }
  })
})
