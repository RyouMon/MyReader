import type { ReaderLocator } from "@my-reader/tools/reader-toc"
import type { Library } from "@my-reader/tools/types/library"

import {
  commitLibrarySidecarMutation,
  ensureLibrarySidecarState,
} from "./database-store"
import {
  librarySidecarReadingPositionCandidates,
  type LibrarySidecarReadingPositionCandidate,
} from "./document-contract"
import { ensureLibrarySidecarIdentity } from "./identity"

export type ReadingPositionInput = {
  bookId: number
  format: string
  locator: ReaderLocator
  displayProgression: number | null
}

type ReadingFormat = "EPUB" | "PDF" | "CBZ"

function validateReadingPositionInput(
  input: ReadingPositionInput,
): ReadingFormat {
  if (
    !Number.isSafeInteger(input.bookId) ||
    input.bookId < 1 ||
    input.locator.href.length === 0 ||
    input.locator.type.length === 0 ||
    (input.displayProgression !== null &&
      (!Number.isFinite(input.displayProgression) ||
        input.displayProgression < 0 ||
        input.displayProgression > 1))
  ) {
    throw new Error("Invalid reading position")
  }
  const format = input.format.trim().toUpperCase()
  if (!["EPUB", "PDF", "CBZ"].includes(format)) {
    throw new Error("Unsupported reading position format")
  }
  return format as ReadingFormat
}

export async function writeLocalReadingPosition(
  library: Library,
  input: ReadingPositionInput,
  nowMs = Date.now(),
): Promise<void> {
  const identity = await ensureLibrarySidecarIdentity(library)
  const format = validateReadingPositionInput(input)
  const value = {
    format,
    locatorJson: JSON.stringify(input.locator),
    displayProgressionPpm:
      input.displayProgression === null
        ? null
        : Math.round(input.displayProgression * 1_000_000),
    recordedAt: nowMs,
    replicaId: identity.replicaId,
  }
  await commitLibrarySidecarMutation(library, identity, nowMs, () => ({
    type: "setReadingPosition",
    bookId: input.bookId,
    value,
  }))
  console.info("[reading-sync] progress:local-write", {
    libraryId: library.id,
    libraryUuid: identity.libraryUuid,
    replicaId: identity.replicaId,
    bookId: input.bookId,
    format,
    href: input.locator.href,
    position: input.locator.locations?.position ?? null,
    totalProgression: input.locator.locations?.totalProgression ?? null,
    displayProgression: input.displayProgression,
  })
}

export async function getReadingPositionCandidates(
  library: Library,
  bookId: number,
  format: string,
): Promise<LibrarySidecarReadingPositionCandidate[]> {
  const identity = await ensureLibrarySidecarIdentity(library)
  const normalizedFormat = validateReadingPositionInput({
    bookId,
    format,
    locator: { href: "_", type: "_" },
    displayProgression: null,
  })
  const document = await ensureLibrarySidecarState(
    library,
    identity,
    Date.now(),
  )
  return librarySidecarReadingPositionCandidates(
    document,
    bookId,
    normalizedFormat,
  )
}

export async function selectReadingPositionCandidate(
  library: Library,
  bookId: number,
  format: string,
  operationId: string,
  nowMs = Date.now(),
): Promise<void> {
  const identity = await ensureLibrarySidecarIdentity(library)
  const normalizedFormat = validateReadingPositionInput({
    bookId,
    format,
    locator: { href: "_", type: "_" },
    displayProgression: null,
  })
  await commitLibrarySidecarMutation(library, identity, nowMs, () => ({
    type: "resolveReadingPosition",
    bookId,
    format: normalizedFormat,
    operationId,
    recordedAt: nowMs,
  }))
}
