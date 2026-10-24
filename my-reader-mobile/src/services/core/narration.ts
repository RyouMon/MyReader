import type { Library } from "@my-reader/tools/types/library"
import {
  narrationResolveSettings,
  narrationSaveSettings,
  narrationImport,
  narrationPrepare,
  narrationPreviewMerge,
  narrationMergeSettings,
  type BookNarrationSettings,
  type CharacterImportRequest,
  type NarrationRequest,
  type NarrationVoice,
  type NarrationMergePlan,
} from "my-reader-core"
import { librarySidecarRootUri, libraryRootUri } from "../fs/library-paths"
import { toNativeFilesystemPath } from "../fs/path"
import { appConfigPath } from "./app-config"
import { selectedLlmCredential } from "./llm"

function root(library: Library) {
  return toNativeFilesystemPath(librarySidecarRootUri(library))
}
export function getBookNarration(library: Library, bookId: number) {
  return narrationResolveSettings(
    root(library),
    toNativeFilesystemPath(libraryRootUri(library)),
    library.libraryType ?? "calibre",
    bookId,
  )
}
export async function saveBookNarration(
  library: Library,
  settings: BookNarrationSettings,
) {
  await getBookNarration(library, settings.bookId)
  return narrationSaveSettings(root(library), settings)
}
export async function importBookCharacters(
  library: Library,
  request: CharacterImportRequest,
  signal?: AbortSignal,
) {
  await getBookNarration(library, request.bookId)
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
  NarrationMergePlan,
} from "my-reader-core"

export async function previewBookNarrationMerge(
  library: Library,
  bookId: number,
  automatic: boolean,
) {
  await getBookNarration(library, bookId)
  return narrationPreviewMerge(
    root(library),
    appConfigPath,
    bookId,
    automatic,
    automatic ? await selectedLlmCredential() : undefined,
  )
}

export async function mergeBookNarration(
  library: Library,
  bookId: number,
  plan: NarrationMergePlan,
) {
  await getBookNarration(library, bookId)
  return narrationMergeSettings(root(library), bookId, plan)
}
