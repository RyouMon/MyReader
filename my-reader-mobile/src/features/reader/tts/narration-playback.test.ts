import { ReaderAudioBuffer } from "./reader-audio-buffer"
import type { NarrationSpeech } from "my-reader-core"
import type { Library } from "@my-reader/tools/types/library"
import type { TtsSynthesisRequestEvent } from "@my-reader/readium"
import { publication as readiumPublication } from "@my-reader/readium"
import {
  getBookNarration,
  prepareBookNarration,
  analyzeBookNarration,
} from "@/src/services/core/narration"
import { synthesizeTts } from "@/src/services/core/tts"
import {
  loadNarrationContext,
  type NarrationBookContext,
} from "./narration-playback"

jest.mock("@/src/services/core/narration", () => ({
  getBookNarration: jest.fn(),
  prepareBookNarration: jest.fn(),
  analyzeBookNarration: jest.fn(),
}))
jest.mock("@/src/services/core/tts", () => ({ synthesizeTts: jest.fn() }))
jest.mock("@my-reader/readium", () => ({
  publication: { getContent: jest.fn(), getTtsContent: jest.fn() },
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

beforeEach(() => {
  jest.resetAllMocks()
  jest
    .mocked(readiumPublication.getTtsContent)
    .mockResolvedValue({ utterances: [] })
  jest.mocked(analyzeBookNarration).mockResolvedValue(undefined)
})

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
    { signal: expect.any(AbortSignal) },
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

it("loads only the current chapter once and uses neighboring text", async () => {
  jest
    .mocked(getBookNarration)
    .mockResolvedValue({ enabled: true } as Awaited<
      ReturnType<typeof getBookNarration>
    >)
  jest.mocked(readiumPublication.getTtsContent).mockResolvedValue({
    utterances: [
      { text: request.text, locator: request.locator! },
      {
        text: "真昼向周打了招呼。",
        locator: { ...request.locator!, locations: { totalProgression: 0.3 } },
      },
    ],
  })
  jest.mocked(prepareBookNarration).mockResolvedValue([])
  const context = await loadNarrationContext(
    { ...book, publicationId: "native-book" },
    { kind: "system" },
  )
  for (let i = 0; i < 2; i++)
    await prepareNarrationPlayback(
      context!.book,
      context!.defaultVoice,
      { ...request, locator: { ...request.locator!, text: { after: "\n" } } },
      [],
      new AbortController().signal,
    )
  expect(readiumPublication.getContent).not.toHaveBeenCalled()
  expect(readiumPublication.getTtsContent).toHaveBeenCalledTimes(1)
  expect(analyzeBookNarration).toHaveBeenCalledTimes(1)
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

it("does not analyze or synthesize after the publication closes", async () => {
  jest
    .mocked(readiumPublication.getTtsContent)
    .mockRejectedValue(new Error("Publication closed"))
  await expect(
    prepareNarrationPlayback(
      { ...book, publicationId: "native-book" },
      voice,
      request,
      [],
      new AbortController().signal,
    ),
  ).rejects.toThrow("Publication closed")
  expect(prepareBookNarration).not.toHaveBeenCalled()
  expect(synthesizeTts).not.toHaveBeenCalled()
})

it("plays a selected cached entry without invoking analysis or prefetch", async () => {
  const speech = {
    text: "你好😀",
    startUtf16: 0,
    endUtf16: 4,
    voice,
    instructions: "温柔",
  }
  const result = await prepareNarrationSpeech(
    [speech],
    { ...request, text: "你好😀后面的段落。" },
    [],
    new AbortController().signal,
  )
  expect(result).toEqual([
    {
      text: speech.text,
      startUtf16: 0,
      endUtf16: 4,
      systemVoiceId: "system-zh",
    },
  ])
  expect(prepareBookNarration).not.toHaveBeenCalled()
  expect(analyzeBookNarration).not.toHaveBeenCalled()
  expect(synthesizeTts).not.toHaveBeenCalled()
})

it("delivers the first chunk before the next synthesis completes and cancels the remainder", async () => {
  let requested!: () => void
  const nextRequested = new Promise<void>((resolve) => {
    requested = resolve
  })
  let finish!: (audio: Awaited<ReturnType<typeof synthesizeTts>>) => void
  const pending = new Promise<Awaited<ReturnType<typeof synthesizeTts>>>(
    (resolve) => {
      finish = resolve
    },
  )
  const audio = {
    path: "/cache/audio.wav",
    mimeType: "audio/wav",
    timings: [],
    durationMs: 5000,
    synthesisMs: 200,
  }
  jest
    .mocked(synthesizeTts)
    .mockResolvedValueOnce(audio)
    .mockImplementationOnce(() => {
      requested()
      return pending
    })
  const buffer = new ReaderAudioBuffer()
  const controller = new AbortController()
  const stream = buffer.stream(
    {
      ...request,
      text: "第一句。第二句。",
      profileId: "incremental",
      locator: undefined,
    },
    [],
    controller.signal,
  )
  try {
    expect((await stream.next()).value).toMatchObject({
      isFinal: false,
      segments: [{ text: "第一句。" }],
    })
    await nextRequested
    const next = stream.next()
    controller.abort()
    await expect(next).rejects.toMatchObject({ name: "AbortError" })
    expect(jest.mocked(synthesizeTts).mock.calls[1]![1]!.signal!.aborted).toBe(
      true,
    )
    finish(audio)
    jest.mocked(synthesizeTts).mockResolvedValue(audio)
    const retry = buffer.stream(
      {
        ...request,
        text: "重试。",
        profileId: "incremental",
        locator: undefined,
      },
      [],
      new AbortController().signal,
    )
    expect((await retry.next()).value).toMatchObject({
      isFinal: true,
      segments: [{ text: "重试。" }],
    })
    await retry.return(undefined)
  } finally {
    buffer.dispose()
  }
})

it("reuses prefetched source audio without rerunning analysis for ordinary reading", async () => {
  const units = ["第一段。", "第二段。", "第三段。"].map((text, index) => ({
    text,
    locator: {
      ...request.locator!,
      locations: { totalProgression: index / 3, cssSelector: `#p${index}` },
    },
  }))
  jest
    .mocked(readiumPublication.getTtsContent)
    .mockResolvedValue({ utterances: units })
  jest.mocked(synthesizeTts).mockResolvedValue({
    path: "/cache/source.wav",
    mimeType: "audio/wav",
    timings: [],
    durationMs: 5000,
  })
  const buffer = new ReaderAudioBuffer({ ...book, publicationId: "native" })
  try {
    for (const unit of units) {
      for await (const completion of buffer.stream(
        {
          ...request,
          ...unit,
          profileId: "prefetch",
          locator: {
            ...unit.locator,
            title: "Chapter",
            locations: {
              ...unit.locator.locations,
              position: 1,
              domRange: {
                start: { cssSelector: "#p0", charOffset: 0, textNodeIndex: 0 },
              },
            },
          },
        },
        [],
        new AbortController().signal,
      ))
        expect(completion.segments[0]!.text).toBe(unit.text)
    }
    expect(synthesizeTts).toHaveBeenCalledTimes(3)
    expect(prepareBookNarration).not.toHaveBeenCalled()
    expect(analyzeBookNarration).not.toHaveBeenCalled()
    expect(readiumPublication.getTtsContent).toHaveBeenCalledTimes(1)
  } finally {
    buffer.dispose()
  }
})

async function prepareNarrationPlayback(
  book: NarrationBookContext,
  defaultVoice: { engine: string; voiceId: string },
  request: TtsSynthesisRequestEvent,
  mimeTypes: string[],
  signal: AbortSignal,
) {
  const buffer = new ReaderAudioBuffer(book, { book, defaultVoice })
  try {
    let segments: import("@my-reader/readium").TtsPlaybackSegment[] = []
    for await (const completion of buffer.stream(request, mimeTypes, signal))
      segments = completion.segments
    return segments
  } finally {
    buffer.dispose()
  }
}
async function prepareNarrationSpeech(
  speech: NarrationSpeech[],
  request: TtsSynthesisRequestEvent,
  mimeTypes: string[],
  signal: AbortSignal,
) {
  const buffer = new ReaderAudioBuffer(book, {
    book,
    defaultVoice: voice,
    speech,
  })
  try {
    let segments: import("@my-reader/readium").TtsPlaybackSegment[] = []
    for await (const completion of buffer.stream(request, mimeTypes, signal))
      segments = completion.segments
    return segments
  } finally {
    buffer.dispose()
  }
}
