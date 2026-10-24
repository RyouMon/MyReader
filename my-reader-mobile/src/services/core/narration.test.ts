import * as core from "my-reader-core"
import { selectedLlmCredential } from "./llm"
import {
  getBookNarration,
  saveBookNarration,
  importBookCharacters,
  prepareBookNarration,
} from "./narration"
import type { Library } from "@my-reader/tools/types/library"

jest.mock("./app-config", () => ({ appConfigPath: "/config.json" }))
jest.mock("./llm", () => ({
  selectedLlmCredential: jest.fn().mockResolvedValue("secret"),
}))
jest.mock("../fs/library-paths", () => ({
  librarySidecarRootUri: (library: Library) => `file:///sidecars/${library.id}`,
}))
jest.mock("../fs/path", () => ({
  toNativeFilesystemPath: (uri: string) => uri.replace("file://", ""),
}))
jest.mock("my-reader-core", () => ({
  narrationGetSettings: jest.fn(),
  narrationSaveSettings: jest.fn(),
  narrationImport: jest.fn(),
  narrationPrepare: jest.fn(),
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
  identityRevision: 0,
  characters: [],
}
beforeEach(() => {
  jest.clearAllMocks()
  jest.mocked(core.narrationGetSettings).mockResolvedValue(settings)
})
it("routes book settings and import to the library sidecar and passes cancellation to FFI", async () => {
  await getBookNarration(library, 1)
  expect(core.narrationGetSettings).toHaveBeenCalledWith("/sidecars/library", 1)
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
    "secret",
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
    .mocked(core.narrationGetSettings)
    .mockResolvedValue({ ...settings, enabled: true })
  const controller = new AbortController()
  await prepareBookNarration(library, request, voice, controller.signal)
  expect(core.narrationPrepare).toHaveBeenLastCalledWith(
    "/sidecars/library",
    "/config.json",
    request,
    voice,
    "secret",
    { signal: controller.signal },
  )
  controller.abort()
  await expect(
    prepareBookNarration(library, request, voice, controller.signal),
  ).rejects.toMatchObject({ name: "AbortError" })
  expect(core.narrationPrepare).toHaveBeenCalledTimes(2)
})
