import type { Library } from "@my-reader/tools/types/library"

import { announceLibrarySidecarWork } from "../sidecar-work"
import type {
  LibrarySidecarDocument,
  LibrarySidecarDocumentCommand,
} from "./document-contract"
import type { LibrarySidecarReplicaIdentity } from "./replica-identity"
import {
  ensureSyncDatabaseDocument,
  executeSyncDatabaseCommand,
  hasSyncDatabasePendingWork,
  readSyncDatabaseDiagnostics,
} from "./sync-database"

const writers = new Map<string, Promise<void>>()

async function withLibraryWriter<T>(
  libraryId: string,
  operation: () => Promise<T>,
): Promise<T> {
  const previous = writers.get(libraryId) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const tail = previous.then(() => current)
  writers.set(libraryId, tail)
  await previous
  try {
    return await operation()
  } finally {
    release()
    if (writers.get(libraryId) === tail) writers.delete(libraryId)
  }
}

export async function ensureLibrarySidecarState(
  library: Library,
  identity: LibrarySidecarReplicaIdentity,
  nowMs: number,
): Promise<LibrarySidecarDocument> {
  return withLibraryWriter(library.id, () =>
    ensureSyncDatabaseDocument(library, identity, nowMs),
  )
}

export async function commitLibrarySidecarMutation(
  library: Library,
  identity: LibrarySidecarReplicaIdentity,
  nowMs: number,
  selectCommand: (
    document: LibrarySidecarDocument,
  ) => LibrarySidecarDocumentCommand | null,
): Promise<LibrarySidecarDocument> {
  return withLibraryWriter(library.id, async () => {
    const committed = await ensureSyncDatabaseDocument(library, identity, nowMs)
    const command = selectCommand(committed)
    if (!command) return committed
    const next = await executeSyncDatabaseCommand(
      library,
      identity,
      nowMs,
      command,
    )
    if (next.heads.join(",") === committed.heads.join(",")) return committed
    announceLibrarySidecarWork({
      libraryId: library.id,
      reason: "local_change",
    })
    return next
  })
}

export async function hasPendingLibrarySidecarChanges(
  library: Library,
): Promise<boolean> {
  return hasSyncDatabasePendingWork(library)
}

export type LibrarySidecarAutomergeDiagnosticSnapshot = {
  schemaVersion: number | null
  heads: string[]
  changes: number
  pendingOutbox: number
  receipts: number
  projectionVersion: number | null
}

export async function readLibrarySidecarAutomergeDiagnosticSnapshot(
  library: Library,
): Promise<LibrarySidecarAutomergeDiagnosticSnapshot> {
  const diagnostics = await readSyncDatabaseDiagnostics(library)
  return {
    ...diagnostics,
    heads: diagnostics.heads,
  }
}
