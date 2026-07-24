import { randomUUID } from "expo-crypto"

import type { Library } from "@my-reader/tools/types/library"
import {
  insertLibrarySidecarLocalMeta,
  readLibrarySidecarLocalMeta,
  withLibrarySidecarSyncTransaction,
} from "@/src/repos/library-sidecar-sync"
import { librarySidecarActorId } from "./automerge-identity"

export const LIBRARY_SIDECAR_PROTOCOL = "library-sidecar-automerge"

export type LibrarySidecarReplicaIdentity = {
  libraryUuid: string
  replicaId: string
}

function validateLibraryUuid(libraryUuid: string): void {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(
      libraryUuid,
    )
  ) {
    throw new Error("Library identity must be a lowercase UUID")
  }
}

export async function ensureLibrarySidecarReplicaIdentity(
  library: Library,
  libraryUuid: string,
): Promise<LibrarySidecarReplicaIdentity> {
  validateLibraryUuid(libraryUuid)
  return withLibrarySidecarSyncTransaction(library, async (tx) => {
    const existing = await readLibrarySidecarLocalMeta(tx)
    if (existing) {
      if (
        existing.protocol !== LIBRARY_SIDECAR_PROTOCOL ||
        existing.libraryUuid !== libraryUuid
      ) {
        throw new Error("Local sidecar identity does not match this library")
      }
      librarySidecarActorId(existing.replicaId)
      return {
        libraryUuid: existing.libraryUuid,
        replicaId: existing.replicaId,
      }
    }

    const replicaId = randomUUID()
    librarySidecarActorId(replicaId)
    await insertLibrarySidecarLocalMeta(tx, {
      protocol: LIBRARY_SIDECAR_PROTOCOL,
      libraryUuid,
      replicaId,
    })
    return { libraryUuid, replicaId }
  })
}
