import { publication, type Locator } from "@my-reader/readium"
import { analyzeBookNarration } from "@/src/services/core/narration"
import type { NarrationBookContext } from "./narration-playback"
import {
  analyzeNarrationChapter,
  matchNarrationRequest,
  narrationRequest,
  subscribeNarrationAnalysis,
} from "./narration-chapter"

jest.mock("@my-reader/readium", () => ({
  publication: { getTtsContent: jest.fn() },
}))
jest.mock("@/src/services/core/narration", () => ({
  analyzeBookNarration: jest.fn(),
}))
const locator: Locator = {
  href: "one.xhtml",
  type: "application/xhtml+xml",
  locations: { cssSelector: "#p1", progression: 0.2 },
  text: { highlight: "你好" },
}
const book = {
  bookId: 1,
  contentVersion: "v1",
  library: { id: "library" },
  positions: [locator],
  publicationId: "book",
} as NarrationBookContext
beforeEach(() => jest.resetAllMocks())

it("publishes playback analysis output with book identity and stops after cancellation", async () => {
  jest
    .mocked(publication.getTtsContent)
    .mockResolvedValue({ utterances: [{ locator, text: "你好" }] })
  const abort = new AbortController()
  const listener = jest.fn()
  const unsubscribe = subscribeNarrationAnalysis(listener)
  jest
    .mocked(analyzeBookNarration)
    .mockImplementationOnce(async (_library, _requests, _signal, progress) => {
      progress!("started", "")
      progress!("text", "旁白")
      abort.abort()
      progress!("text", "late")
    })
  try {
    await analyzeNarrationChapter(book, locator, abort.signal)
    expect(
      listener.mock.calls.map(([event]) => [event.kind, event.delta]),
    ).toEqual([
      ["started", ""],
      ["text", "旁白"],
      ["finished", ""],
    ])
    expect(listener.mock.calls[1]![0]).toMatchObject({
      book,
      signal: abort.signal,
    })
  } finally {
    unsubscribe()
  }
})

it("identifies repeated text by source position rather than text alone", () => {
  const first = narrationRequest(book, locator, "你好")
  const other = {
    ...locator,
    locations: { cssSelector: "#p2", progression: 0.3 },
  }
  const second = narrationRequest(book, other, "你好")
  expect(
    matchNarrationRequest(
      [first, second],
      { ...other, locations: { ...other.locations, totalProgression: 0.4 } },
      "你好",
    ),
  ).toBe(second)
  expect(
    matchNarrationRequest(
      [first, second],
      { ...locator, locations: {} },
      "你好",
    ),
  ).toBeUndefined()
  expect(
    matchNarrationRequest([first], { ...locator, href: "two.xhtml" }, "你好"),
  ).toBeUndefined()
})

it("retries cancelled analysis while reusing loaded chapter content", async () => {
  jest
    .mocked(publication.getTtsContent)
    .mockResolvedValue({ utterances: [{ locator, text: "你好" }] })
  jest
    .mocked(analyzeBookNarration)
    .mockRejectedValueOnce(new Error("Cancelled"))
    .mockResolvedValueOnce(undefined)
  const cached = { ...book, chapters: new Map(), analysis: new Map() }
  await expect(
    analyzeNarrationChapter(cached, locator, new AbortController().signal),
  ).rejects.toThrow("Cancelled")
  await analyzeNarrationChapter(cached, locator, new AbortController().signal)
  expect(publication.getTtsContent).toHaveBeenCalledTimes(1)
  expect(analyzeBookNarration).toHaveBeenCalledTimes(2)
})

it("does not submit chapter analysis after cancellation", async () => {
  jest
    .mocked(publication.getTtsContent)
    .mockResolvedValue({ utterances: [{ locator, text: "你好" }] })
  const controller = new AbortController()
  controller.abort()
  await expect(
    analyzeNarrationChapter(book, locator, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" })
  expect(analyzeBookNarration).not.toHaveBeenCalled()
})
