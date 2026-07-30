import type { Library } from "@my-reader/tools/types/library"

import MyReaderRustComponents, {
  type NativeSyncOutboxEntry,
  type NativeSyncRemoteObject,
  type NativeSyncTaskProgress,
} from "@/modules/myreader-rust-components"
import { getLibraryDatabase } from "@/src/services/db/library-db"
import {
  librarySidecarDocumentFromNativeResult,
  type LibrarySidecarDocument,
  type LibrarySidecarDocumentCommand,
} from "./automerge-document"
import type { LibrarySidecarReplicaIdentity } from "./replica-identity"
import type { NativeSidecarStorageConfig } from "../resolve"

export type LibrarySidecarSyncProgress = NativeSyncTaskProgress & {
  libraryId: string
}

const progressListeners = new Set<
  (progress: LibrarySidecarSyncProgress) => void
>()
let nextTaskSequence = 0

export function subscribeLibrarySidecarSyncProgress(
  listener: (progress: LibrarySidecarSyncProgress) => void,
): () => void {
  progressListeners.add(listener)
  return () => progressListeners.delete(listener)
}

export function createLibrarySidecarSyncTaskId(libraryId: string): string {
  nextTaskSequence += 1
  return `${libraryId}:${Date.now()}:${nextTaskSequence}`
}

export function cancelLibrarySidecarSyncTask(taskId: string): boolean {
  return MyReaderRustComponents.cancelSyncTask(taskId)
}

function emitProgress(
  libraryId: string,
  progress: NativeSyncTaskProgress,
  listener?: (progress: LibrarySidecarSyncProgress) => void,
): void {
  const event = { ...progress, libraryId }
  listener?.(event)
  for (const subscribed of progressListeners) subscribed(event)
}

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

export async function syncLibrarySidecarDatabase(
  library: Library,
  identity: LibrarySidecarReplicaIdentity,
  nowMs: number,
  mode: "push_only" | "full",
  storage: NativeSidecarStorageConfig,
  task?: {
    taskId?: string
    onProgress?: (progress: LibrarySidecarSyncProgress) => void
  },
): Promise<{ pushed: number; pulled: number }> {
  const taskId = task?.taskId ?? createLibrarySidecarSyncTaskId(library.id)
  let previousProgress = ""
  const publishProgress = () => {
    const progress = MyReaderRustComponents.readSyncTaskProgress(taskId)
    const serialized = progress ? JSON.stringify(progress) : ""
    if (progress && serialized !== previousProgress) {
      previousProgress = serialized
      emitProgress(library.id, progress, task?.onProgress)
    }
  }
  const sync = MyReaderRustComponents.syncLibrarySidecar(
    taskId,
    await databasePath(library),
    identity.libraryUuid,
    identity.replicaId,
    String(nowMs),
    mode,
    JSON.stringify(storage),
  )
  const progressTimer = setInterval(publishProgress, 100)
  try {
    return await sync
  } finally {
    clearInterval(progressTimer)
    publishProgress()
    MyReaderRustComponents.releaseSyncTask(taskId)
  }
}
