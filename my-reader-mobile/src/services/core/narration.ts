import type { Library } from "@my-reader/tools/types/library"
import {
  narrationResolveSettings,
  narrationSaveSettings,
  narrationImport,
  narrationPrepare,
  narrationAnalyzeBatch,
  narrationReadingPlan,
  narrationClearReadingPlan,
  narrationPreviewMerge,
  narrationMergeSettings,
  narrationSearchSources,
  narrationDraftCharacters,
  CharacterDraftInput as NativeDraftInput,
  type CharacterSource,
  type CharacterPassage,
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
    appConfigPath,
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
  NarrationPlanEntry,
  BookNarrationSettings,
  BookCharacter,
  NarrationVoice,
  NarrationMergePlan,
  CharacterSource,
  CharacterPassage,
} from "my-reader-core"

export async function analyzeBookNarration(
  library: Library,
  requests: NarrationRequest[],
  signal?: AbortSignal,
  onProgress?: (kind: string, delta: string) => void,
) {
  if (!requests.length) return
  await getBookNarration(library, requests[0]!.bookId)
  const credential = await selectedLlmCredential()
  if (signal) assertActive(signal)
  let active = true
  try {
    return await narrationAnalyzeBatch(
      root(library),
      appConfigPath,
      requests,
      credential,
      {
        onProgress: (kind, delta) => {
          if (active && !signal?.aborted) onProgress?.(kind, delta)
        },
      },
      signal ? { signal } : undefined,
    )
  } finally {
    active = false
  }
}

export function getBookReadingPlan(
  library: Library,
  bookId: number,
  contentVersion: string,
  defaultVoice: NarrationVoice,
) {
  return narrationReadingPlan(
    root(library),
    appConfigPath,
    bookId,
    contentVersion,
    defaultVoice,
  )
}

export function clearBookReadingPlan(
  library: Library,
  bookId: number,
  contentVersion: string,
  ids: string[],
) {
  return narrationClearReadingPlan(root(library), bookId, contentVersion, ids)
}

export type CharacterDraftInput =
  | { kind: "encyclopedia"; source: CharacterSource }
  | { kind: "book"; passages: CharacterPassage[] }
  | { kind: "prompt"; prompt: string }

export async function searchBookCharacterSources(
  library: Library,
  request: CharacterImportRequest,
  signal: AbortSignal,
) {
  await getBookNarration(library, request.bookId)
  assertActive(signal)
  return narrationSearchSources(root(library), request, { signal })
}

export async function draftBookCharacters(
  library: Library,
  book: CharacterImportRequest,
  input: CharacterDraftInput,
  onProgress: (kind: string, delta: string) => void,
  signal: AbortSignal,
) {
  await getBookNarration(library, book.bookId)
  assertActive(signal)
  const credential = await selectedLlmCredential()
  assertActive(signal)
  const nativeInput =
    input.kind === "encyclopedia"
      ? new NativeDraftInput.Encyclopedia({ source: input.source })
      : input.kind === "book"
        ? new NativeDraftInput.Book({ passages: input.passages })
        : new NativeDraftInput.Prompt({ prompt: input.prompt })
  return narrationDraftCharacters(
    root(library),
    appConfigPath,
    book,
    nativeInput,
    credential,
    { onProgress },
    { signal },
  )
}

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

function assertActive(signal: AbortSignal) {
  if (signal.aborted)
    throw Object.assign(new Error("Aborted"), { name: "AbortError" })
}
