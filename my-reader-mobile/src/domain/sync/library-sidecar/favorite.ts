import type { Library } from "@my-reader/tools/types/library"

import { commitLibrarySidecarMutation } from "./database-store"
import { librarySidecarFavoriteProjections } from "./document-contract"
import { ensureLibrarySidecarIdentity } from "./identity"

export async function writeLocalFavorite(
  library: Library,
  bookId: number,
  isFavorite: boolean,
  nowMs = Date.now(),
): Promise<void> {
  if (!Number.isSafeInteger(bookId) || bookId < 1) {
    throw new Error("Invalid favorite book ID")
  }
  const identity = await ensureLibrarySidecarIdentity(library)
  let changed = false
  await commitLibrarySidecarMutation(library, identity, nowMs, (document) => {
    const current = librarySidecarFavoriteProjections(document).find(
      (item) => item.bookId === bookId,
    )
    if (current?.value.isFavorite === isFavorite || (!current && !isFavorite)) {
      return null
    }
    changed = true
    return {
      type: "setFavorite",
      bookId,
      value: {
        isFavorite,
        addedAt: isFavorite ? nowMs : (current?.value.addedAt ?? null),
        recordedAt: nowMs,
        replicaId: identity.replicaId,
      },
    }
  })
  if (changed) {
    console.info("[reading-sync] favorite:local-write", {
      libraryId: library.id,
      libraryUuid: identity.libraryUuid,
      replicaId: identity.replicaId,
      bookId,
      isFavorite,
    })
  }
}
