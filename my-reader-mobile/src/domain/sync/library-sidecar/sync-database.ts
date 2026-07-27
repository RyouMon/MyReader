import type { Library } from "@my-reader/tools/types/library"

import MyReaderRustComponents, {
  type NativeSyncOutboxEntry,
  type NativeSyncRemoteObject,
} from "@/modules/myreader-rust-components"
import { getLibraryDatabase } from "@/src/services/db/library-db"
import {
  librarySidecarDocumentFromNativeResult,
  type LibrarySidecarDocument,
  type LibrarySidecarDocumentCommand,
} from "./automerge-document"
import type { LibrarySidecarReplicaIdentity } from "./replica-identity"

async function databasePath(library: Library): Promise<string> {
  return (await getLibraryDatabase(library)).path
}

export async function ensureSyncDatabaseDocument(
  library: Library,
  identity: LibrarySidecarReplicaIdentity,
  nowMs: number,
): Promise<LibrarySidecarDocument> {
  const result = await MyReaderRustComponents.ensureSyncDatabaseDocument(
    await databasePath(library),
    identity.libraryUuid,
    identity.replicaId,
    String(nowMs),
  )
  return librarySidecarDocumentFromNativeResult(result, identity.replicaId)
}

export async function executeSyncDatabaseCommand(
  library: Library,
  identity: LibrarySidecarReplicaIdentity,
  nowMs: number,
  command: LibrarySidecarDocumentCommand,
): Promise<LibrarySidecarDocument> {
  const result = await MyReaderRustComponents.executeSyncDatabaseCommand(
    await databasePath(library),
    identity.libraryUuid,
    identity.replicaId,
    String(nowMs),
    JSON.stringify({ command }),
  )
  return librarySidecarDocumentFromNativeResult(result, identity.replicaId)
}

export async function listSyncDatabaseOutbox(
  library: Library,
): Promise<NativeSyncOutboxEntry[]> {
  return MyReaderRustComponents.listSyncDatabaseOutbox(
    await databasePath(library),
  )
}

export async function markSyncDatabaseOutboxPublished(
  library: Library,
  objectPath: string,
  publishedAt: number,
): Promise<void> {
  await MyReaderRustComponents.markSyncDatabaseOutboxPublished(
    await databasePath(library),
    objectPath,
    String(publishedAt),
  )
}

export async function hasSyncDatabaseReceipt(
  library: Library,
  objectPath: string,
): Promise<boolean> {
  return MyReaderRustComponents.hasSyncDatabaseReceipt(
    await databasePath(library),
    objectPath,
  )
}

export async function applySyncDatabaseRemoteObjects(
  library: Library,
  identity: LibrarySidecarReplicaIdentity,
  nowMs: number,
  objects: NativeSyncRemoteObject[],
): Promise<number> {
  const result = await MyReaderRustComponents.applySyncDatabaseRemoteObjects(
    await databasePath(library),
    identity.libraryUuid,
    identity.replicaId,
    String(nowMs),
    objects,
  )
  librarySidecarDocumentFromNativeResult(result.document, identity.replicaId)
  return result.appliedObjects
}

export async function readSyncDatabaseDiagnostics(library: Library) {
  return MyReaderRustComponents.readSyncDatabaseDiagnostics(
    await databasePath(library),
  )
}
