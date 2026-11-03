import * as core from "my-reader-core"
import { selectedLlmCredential } from "./llm"
import {
  getBookNarration,
  saveBookNarration,
  importBookCharacters,
  prepareBookNarration,
  analyzeBookNarration,
  draftBookCharacters,
  searchBookCharacterSources,
  type CharacterDraftInput,
} from "./narration"
import type { Library } from "@my-reader/tools/types/library"

jest.mock("./app-config", () => ({ appConfigPath: "/config.json" }))
jest.mock("./llm", () => ({
  selectedLlmCredential: jest
    .fn()
    .mockResolvedValue({ profileId: "p", profileRevision: 1, value: "secret" }),
}))
jest.mock("../fs/library-paths", () => ({
  libraryRootUri: (library: Library) => `file:///content/${library.id}`,
  librarySidecarRootUri: (library: Library) => `file:///sidecars/${library.id}`,
}))
jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))
jest.mock("my-reader-core", () => ({
  narrationResolveSettings: jest.fn(),
  narrationSaveSettings: jest.fn(),
  narrationImport: jest.fn(),
  narrationPrepare: jest.fn(),
  narrationAnalyzeBatch: jest.fn(),
  narrationSearchSources: jest.fn(),
  narrationDraftCharacters: jest.fn(),
  CharacterDraftInput: {
    Encyclopedia: jest.fn((value: unknown) => ({ value })),
    Book: jest.fn((value: unknown) => ({ value })),
    Prompt: jest.fn((value: unknown) => ({ value })),
  },
}))
const library = { id: "library" } as Library
const request = {
  bookId: 1,
  contentVersion: "v",
  sourceKey: "locator",
  position: 0.2,
  text: "Hello",
  before: "",
  after: "",
}
const voice = { engine: "system", voiceId: "" }
const settings = {
  bookId: 1,
  enabled: false,
  revision: 0,
  scopeId: "book:fixture",
  mergeSources: [],
  identityRevision: 0,
  characters: [],
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(core.narrationResolveSettings).mockResolvedValue(settings)
})
it("forwards chapter output only while the analysis request is active", async () => {
  const abort = new AbortController()
  const progress = jest.fn()
  jest
    .mocked(core.narrationAnalyzeBatch)
    .mockImplementationOnce(async (...args) => {
      expect(args[2]).toEqual([request])
      expect(args[5]?.signal).toBe(abort.signal)
      args[4].onProgress("reasoning", "分析当前章节")
      abort.abort()
      args[4].onProgress("text", "cancelled output")
    })
  await analyzeBookNarration(library, [request], abort.signal, progress)
  const callback = jest.mocked(core.narrationAnalyzeBatch).mock.calls[0]![4]
  callback.onProgress("text", "late output")
  expect(progress.mock.calls).toEqual([["reasoning", "分析当前章节"]])
  await expect(
    analyzeBookNarration(library, [request], abort.signal, progress),
  ).rejects.toMatchObject({ name: "AbortError" })
  expect(core.narrationAnalyzeBatch).toHaveBeenCalledTimes(1)
})
it("routes book settings and import to the library sidecar and passes cancellation to FFI", async () => {
  await getBookNarration(library, 1)
  expect(core.narrationResolveSettings).toHaveBeenCalledWith(
    "/sidecars/library",
    "/content/library",
    "calibre",
    1,
    "/config.json",
  )
  await saveBookNarration(library, settings)
  expect(core.narrationSaveSettings).toHaveBeenCalledWith(
    "/sidecars/library",
    settings,
  )
  const source = { bookId: 1, title: "Novel", authors: [], language: "en" }
  const signal = new AbortController().signal
  await importBookCharacters(library, source, signal)
  expect(core.narrationImport).toHaveBeenCalledWith(
    "/sidecars/library",
    "/config.json",
    source,
    { profileId: "p", profileRevision: 1, value: "secret" },
    { signal },
  )
})
it("reads LLM credentials only for enabled books and rejects canceled analysis before FFI", async () => {
  await prepareBookNarration(library, request, voice)
  expect(selectedLlmCredential).not.toHaveBeenCalled()
  expect(core.narrationPrepare).toHaveBeenLastCalledWith(
    "/sidecars/library",
    "/config.json",
    request,
    voice,
    undefined,
    undefined,
  )
  jest
    .mocked(core.narrationResolveSettings)
    .mockResolvedValue({ ...settings, enabled: true })
  const controller = new AbortController()
  await prepareBookNarration(library, request, voice, controller.signal)
  expect(core.narrationPrepare).toHaveBeenLastCalledWith(
    "/sidecars/library",
    "/config.json",
    request,
    voice,
    { profileId: "p", profileRevision: 1, value: "secret" },
    { signal: controller.signal },
  )
  controller.abort()
  await expect(
    prepareBookNarration(library, request, voice, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" })
  expect(core.narrationPrepare).toHaveBeenCalledTimes(2)
})

it.each<CharacterDraftInput>([
  {
    kind: "encyclopedia",
    source: { title: "Cast", url: "https://en.wikipedia.org/wiki/Novel" },
  },
  { kind: "book", passages: [{ title: "人物介绍", text: "Alice: teacher" }] },
  { kind: "prompt", prompt: "Alice: teacher" },
])("forwards $kind drafting input, progress callback and cancellation to Core", async (input) => {
  const book = { bookId: 1, title: "Novel", authors: [], language: "en" }
  const signal = new AbortController().signal
  const progress = jest.fn()
  await searchBookCharacterSources(library, book, signal)
  expect(core.narrationSearchSources).toHaveBeenCalledWith(
    "/sidecars/library",
    book,
    { signal },
  )
  await draftBookCharacters(library, book, input, progress, signal)
  const { kind: _kind, ...value } = input
  expect(core.narrationDraftCharacters).toHaveBeenCalledWith(
    "/sidecars/library",
    "/config.json",
    book,
    { value },
    { profileId: "p", profileRevision: 1, value: "secret" },
    { onProgress: progress },
    { signal },
  )
  const callback = jest.mocked(core.narrationDraftCharacters).mock.calls[0]![5]
  callback.onProgress("text", "Alice")
  expect(progress).toHaveBeenCalledWith("text", "Alice")
})

it("does not start native work when canceled during settings or credential loading", async () => {
  const book = { bookId: 1, title: "Novel", authors: [], language: "en" }
  const controller = new AbortController()
  controller.abort()
  await expect(
    searchBookCharacterSources(library, book, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" })
  await expect(
    draftBookCharacters(
      library,
      book,
      { kind: "prompt", prompt: "Alice" },
      jest.fn(),
      controller.signal,
    ),
  ).rejects.toMatchObject({ name: "AbortError" })
  expect(selectedLlmCredential).not.toHaveBeenCalled()
  expect(core.narrationSearchSources).not.toHaveBeenCalled()
  expect(core.narrationDraftCharacters).not.toHaveBeenCalled()
})
