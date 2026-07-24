import type { Library } from "@my-reader/tools/types/library"

import type {
  ReadingCompletionInsert,
  ReadingSessionInterval,
} from "@/src/repos/reading-statistics"
import {
  addLibrarySidecarReadingCompletion,
  addLibrarySidecarReadingSessionDuration,
  librarySidecarReadingCompletionRecords,
} from "./automerge-document"
import { projectLibrarySidecarAutomergeDocument } from "./automerge-projection"
import { commitLibrarySidecarAutomergeMutation } from "./automerge-store"
import { ensureLibrarySidecarIdentity } from "./identity"

function normalizedFormat(format: string): "EPUB" | "PDF" | "CBZ" {
  const value = format.toUpperCase()
  if (!["EPUB", "PDF", "CBZ"].includes(value)) {
    throw new Error("Unsupported reading statistics format")
  }
  return value as "EPUB" | "PDF" | "CBZ"
}

export async function addLocalReadingSessionInterval(
  library: Library,
  interval: ReadingSessionInterval,
): Promise<void> {
  const identity = await ensureLibrarySidecarIdentity(library)
  await commitLibrarySidecarAutomergeMutation(
    library,
    identity,
    interval.updatedAt,
    (document) =>
      addLibrarySidecarReadingSessionDuration(document, {
        ...interval,
        format: normalizedFormat(interval.format),
        originReplicaId: identity.replicaId,
      }),
    projectLibrarySidecarAutomergeDocument,
  )
}

export async function addLocalReadingCompletion(
  library: Library,
  completion: ReadingCompletionInsert,
): Promise<boolean> {
  const identity = await ensureLibrarySidecarIdentity(library)
  let changed = false
  await commitLibrarySidecarAutomergeMutation(
    library,
    identity,
    completion.updatedAt,
    (document) => {
      const earliest = librarySidecarReadingCompletionRecords(document).find(
        (item) => item.bookId === completion.bookId,
      )
      if (
        earliest &&
        (earliest.completedAt < completion.completedAt ||
          (earliest.completedAt === completion.completedAt &&
            earliest.id <= completion.id))
      ) {
        return document
      }
      changed = true
      return addLibrarySidecarReadingCompletion(document, {
        ...completion,
        format: normalizedFormat(completion.format),
        replicaId: identity.replicaId,
      })
    },
    projectLibrarySidecarAutomergeDocument,
  )
  return changed
}
