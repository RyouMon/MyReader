import type { Library } from "@my-reader/tools/types/library"
import {
  narrationGetSettings,
  narrationSaveSettings,
  narrationImport,
  narrationPrepare,
  type BookNarrationSettings,
  type CharacterImportRequest,
  type NarrationRequest,
  type NarrationVoice,
} from "my-reader-core"
import { librarySidecarRootUri } from "../fs/library-paths"
import { toNativeFilesystemPath } from "../fs/path"
import { appConfigPath } from "./app-config"
import { selectedLlmCredential } from "./llm"

function root(library: Library) {
  return toNativeFilesystemPath(librarySidecarRootUri(library))
}
export function getBookNarration(library: Library, bookId: number) {
  return narrationGetSettings(root(library), bookId)
}
export function saveBookNarration(
  library: Library,
  settings: BookNarrationSettings,
) {
  return narrationSaveSettings(root(library), settings)
}
export async function importBookCharacters(
  library: Library,
  request: CharacterImportRequest,
  signal?: AbortSignal,
) {
  return narrationImport(
    root(library),
    appConfigPath,
    request,
    await selectedLlmCredential(),
    signal ? { signal } : undefined,
  )
}
export async function prepareBookNarration(
  library: Library,
  request: NarrationRequest,
  defaultVoice: NarrationVoice,
  signal?: AbortSignal,
) {
  const settings = await getBookNarration(library, request.bookId)
  const credential = settings.enabled
    ? await selectedLlmCredential()
    : undefined
  if (signal?.aborted)
    throw Object.assign(new Error("Aborted"), { name: "AbortError" })
  return narrationPrepare(
    root(library),
    appConfigPath,
    request,
    defaultVoice,
    credential,
    signal ? { signal } : undefined,
  )
}
export type {
  BookNarrationSettings,
  BookCharacter,
  CharacterImportCandidate,
  NarrationVoice,
} from "my-reader-core"
