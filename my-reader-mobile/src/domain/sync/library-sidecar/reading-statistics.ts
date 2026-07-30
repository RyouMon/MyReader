import type { Library } from "@my-reader/tools/types/library"

import type {
  ReadingCompletionInsert,
  ReadingSessionInterval,
} from "@/src/repos/reading-statistics"
import { librarySidecarReadingCompletionRecords } from "./document-contract"
import { commitLibrarySidecarMutation } from "./database-store"
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
  await commitLibrarySidecarMutation(
    library,
    identity,
    interval.updatedAt,
    () => ({
      type: "addReadingSessionDuration",
      value: {
        ...interval,
        format: normalizedFormat(interval.format),
        originReplicaId: identity.replicaId,
      },
    }),
  )
}

export async function addLocalReadingCompletion(
  library: Library,
  completion: ReadingCompletionInsert,
): Promise<boolean> {
  const identity = await ensureLibrarySidecarIdentity(library)
  let changed = false
  await commitLibrarySidecarMutation(
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
        return null
      }
      changed = true
      return {
        type: "addReadingCompletion",
        value: {
          ...completion,
          format: normalizedFormat(completion.format),
          replicaId: identity.replicaId,
        },
      }
    },
  )
  return changed
}
