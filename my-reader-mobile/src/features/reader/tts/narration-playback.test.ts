import type { Library } from "@my-reader/tools/types/library"
import type { TtsSynthesisRequestEvent } from "@my-reader/readium"
import { publication as readiumPublication } from "@my-reader/readium"
import {
  getBookNarration,
  prepareBookNarration,
} from "@/src/services/core/narration"
import { synthesizeTts } from "@/src/services/core/tts"
import {
  loadNarrationContext,
  prepareNarrationPlayback,
  type NarrationBookContext,
} from "./narration-playback"

jest.mock("@/src/services/core/narration", () => ({
  getBookNarration: jest.fn(),
  prepareBookNarration: jest.fn(),
}))
jest.mock("@/src/services/core/tts", () => ({ synthesizeTts: jest.fn() }))
jest.mock("@my-reader/readium", () => ({
  publication: { getContent: jest.fn() },
}))

const book: NarrationBookContext = {
  library: { id: "library" } as Library,
  bookId: 42,
  contentVersion: "epub-sha",
  positions: [{ href: "one.xhtml", type: "application/xhtml+xml" }],
}
const voice = { engine: "system", voiceId: "system-zh" }
const request: TtsSynthesisRequestEvent = {
  sessionId: "session",
  requestId: "request",
  profileId: "narration",
  voiceId: "narration",
  text: "她说：你好😀",
  speed: 1.2,
  pitch: 1,
  language: "zh",
  locator: {
    href: "one.xhtml",
    type: "application/xhtml+xml",
    locations: { totalProgression: 0.2 },
    text: { before: "Before", after: "After" },
  },
}

beforeEach(() => jest.resetAllMocks())

it("prepares mixed system and provider voices with local ranges and fixed instructions", async () => {
  jest.mocked(prepareBookNarration).mockResolvedValue([
    { text: "她说：", startUtf16: 0, endUtf16: 3, voice, instructions: "" },
    {
      text: "你好😀",
      startUtf16: 3,
      endUtf16: 7,
      voice: { engine: "provider", profileId: "qwen", voiceId: "A" },
      instructions: "仿男声\n高兴",
    },
  ])
  jest.mocked(synthesizeTts).mockResolvedValue({
    path: "/cache/audio.wav",
    mimeType: "audio/wav",
    timings: [],
    playbackRate: 1,
  })
  const signal = new AbortController().signal
  const result = await prepareNarrationPlayback(
    book,
    voice,
    request,
    ["audio/wav"],
    signal,
  )
  expect(prepareBookNarration).toHaveBeenCalledWith(
    book.library,
    expect.objectContaining({
      contentVersion: "epub-sha",
      position: 0.2,
      text: request.text,
      before: "Before",
      after: "After",
    }),
    voice,
    signal,
  )
  expect(synthesizeTts).toHaveBeenCalledTimes(1)
  expect(synthesizeTts).toHaveBeenCalledWith(
    expect.objectContaining({
      profileId: "qwen",
      voiceId: "A",
      text: "你好😀",
      instructions: "仿男声\n高兴",
    }),
    { signal },
  )
  expect(result).toEqual([
    { text: "她说：", startUtf16: 0, endUtf16: 3, systemVoiceId: "system-zh" },
    {
      text: "你好😀",
      startUtf16: 3,
      endUtf16: 7,
      path: "/cache/audio.wav",
      timings: [],
      playbackRate: 1,
    },
  ])
})

it("uses narrator without persisting guessed positions when no exact locator is supplied", async () => {
  const result = await prepareNarrationPlayback(
    book,
    voice,
    { ...request, locator: undefined },
    [],
    new AbortController().signal,
  )
  expect(prepareBookNarration).not.toHaveBeenCalled()
  expect(result).toEqual([
    {
      text: request.text,
      startUtf16: 0,
      endUtf16: 7,
      systemVoiceId: "system-zh",
    },
  ])
})

it("does not synthesize a late analysis response after cancellation", async () => {
  const controller = new AbortController()
  jest.mocked(prepareBookNarration).mockImplementation(async () => {
    controller.abort()
    return [
      {
        text: request.text,
        startUtf16: 0,
        endUtf16: 7,
        voice: { engine: "provider", profileId: "p", voiceId: "v" },
        instructions: "",
      },
    ]
  })
  await expect(
    prepareNarrationPlayback(book, voice, request, [], controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" })
  expect(synthesizeTts).not.toHaveBeenCalled()
})

it("leaves disabled books on the existing playback path", async () => {
  jest.mocked(getBookNarration).mockResolvedValue({
    bookId: 42,
    enabled: false,
    revision: 0,
    scopeId: "book:fixture",
    mergeSources: [],
    identityRevision: 0,
    characters: [],
  })
  expect(await loadNarrationContext(book, { kind: "system" })).toBeNull()
  expect(await loadNarrationContext(undefined, { kind: "system" })).toBeNull()
  expect(getBookNarration).toHaveBeenCalledTimes(1)
  expect(readiumPublication.getContent).not.toHaveBeenCalled()
  jest.mocked(getBookNarration).mockResolvedValue({
    bookId: 42,
    enabled: true,
    revision: 1,
    scopeId: "book:fixture",
    mergeSources: [],
    identityRevision: 0,
    characters: [],
  })
  expect(
    await loadNarrationContext(book, { kind: "system", voiceId: "saved" }),
  ).toEqual({ book, defaultVoice: { engine: "system", voiceId: "saved" } })
})

it.each([
  "utterances",
  "content",
])("loads native %s once per narration session and uses neighboring text", async (key) => {
  jest
    .mocked(getBookNarration)
    .mockResolvedValue({ enabled: true } as Awaited<
      ReturnType<typeof getBookNarration>
    >)
  const utterances = [
    { text: request.text, locator: request.locator! },
    { text: "真昼向周打了招呼。", locator: request.locator! },
  ]
  jest
    .mocked(readiumPublication.getContent)
    .mockResolvedValue({ [key]: utterances } as unknown as Awaited<
      ReturnType<typeof readiumPublication.getContent>
    >)
  jest.mocked(prepareBookNarration).mockResolvedValue([])
  const context = await loadNarrationContext(
    { ...book, publicationId: "native-book" },
    { kind: "system" },
  )
  await prepareNarrationPlayback(
    context!.book,
    context!.defaultVoice,
    { ...request, locator: { ...request.locator!, text: { after: "\n" } } },
    [],
    new AbortController().signal,
  )
  expect(readiumPublication.getContent).toHaveBeenCalledTimes(1)
  expect(readiumPublication.getContent).toHaveBeenCalledWith("native-book")
  expect(prepareBookNarration).toHaveBeenCalledWith(
    book.library,
    expect.objectContaining({
      text: request.text,
      after: "\n真昼向周打了招呼。",
    }),
    expect.anything(),
    expect.anything(),
  )
})

it("surfaces content extraction failures before starting role playback", async () => {
  jest
    .mocked(getBookNarration)
    .mockResolvedValue({ enabled: true } as Awaited<
      ReturnType<typeof getBookNarration>
    >)
  jest
    .mocked(readiumPublication.getContent)
    .mockRejectedValue(new Error("Publication closed"))
  await expect(
    loadNarrationContext(
      { ...book, publicationId: "native-book" },
      { kind: "system" },
    ),
  ).rejects.toThrow("Publication closed")
  expect(prepareBookNarration).not.toHaveBeenCalled()
})
