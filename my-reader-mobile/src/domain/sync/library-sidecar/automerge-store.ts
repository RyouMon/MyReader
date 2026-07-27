import type { Library } from "@my-reader/tools/types/library"
import type { RemoteBackend } from "@/src/services/remote/backend"
import { uploadLibrarySidecarObject } from "../background-sidecar-upload"
import type { SyncBackend } from "../resolve"
import { announceLibrarySidecarWork } from "../sidecar-work"
import { hashLibrarySidecarAutomergeBytes } from "./automerge-binary"
import {
  type LibrarySidecarDocument,
  type LibrarySidecarDocumentCommand,
} from "./automerge-document"
import type { LibrarySidecarReplicaIdentity } from "./replica-identity"
import {
  applySyncDatabaseRemoteObjects,
  ensureSyncDatabaseDocument,
  executeSyncDatabaseCommand,
  hasSyncDatabaseReceipt,
  listSyncDatabaseOutbox,
  markSyncDatabaseOutboxPublished,
  readSyncDatabaseDiagnostics,
} from "./sync-database"

const REMOTE_CHANGES_ROOT = ".myreader/automerge/changes"
const MAX_REMOTE_OBJECT_BYTES = 4 * 1024 * 1024
const MAX_REMOTE_OBJECTS_PER_SYNC = 10_000
const ACTOR_PATTERN = /^[0-9a-f]{32}$/
const CHANGE_FILE_PATTERN = /^([0-9]{20})-([0-9a-f]{64})\.am$/

type RemoteObject = {
  path: string
  head: string
  bytes: Uint8Array
  sha256: string
}

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

function actorId(replicaId: string): string {
  return replicaId.replaceAll("-", "")
}

export async function ensureLibrarySidecarAutomergeState(
  library: Library,
  identity: LibrarySidecarReplicaIdentity,
  nowMs: number,
): Promise<LibrarySidecarDocument> {
  return withLibraryWriter(library.id, () =>
    ensureSyncDatabaseDocument(library, identity, nowMs),
  )
}

export async function commitLibrarySidecarAutomergeMutation(
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

async function remoteObjectExists(
  backend: SyncBackend,
  objectPath: string,
): Promise<boolean> {
  const separator = objectPath.lastIndexOf("/")
  const directory = objectPath.slice(0, separator + 1)
  const name = objectPath.slice(separator + 1)
  return (await listRemoteEntries(backend, directory, "publish")).includes(name)
}

async function listRemoteEntries(
  backend: SyncBackend,
  prefix: string,
  stage: "publish" | "pull_actors" | "pull_objects",
): Promise<string[]> {
  const startedAt = Date.now()
  try {
    const entries = await backend.listRemote(prefix)
    console.info("[reading-sync] remote:list", {
      backend: backend.kind,
      prefix,
      stage,
      entries: entries.length,
      durationMs: Date.now() - startedAt,
    })
    return entries
  } catch (error) {
    console.warn("[reading-sync] remote:list-failed", {
      backend: backend.kind,
      prefix,
      stage,
      durationMs: Date.now() - startedAt,
      error,
    })
    throw error
  }
}

export async function publishLibrarySidecarAutomergeChanges(
  library: Library,
  backend: SyncBackend,
  nowMs: number,
): Promise<number> {
  const pending = await listSyncDatabaseOutbox(library)
  let pushed = 0
  for (const row of pending) {
    if (await remoteObjectExists(backend, row.objectPath)) {
      const existing = await backend.readBytes(row.objectPath)
      if ((await hashLibrarySidecarAutomergeBytes(existing)) !== row.sha256) {
        throw new Error(`Remote Automerge object changed: ${row.objectPath}`)
      }
    } else {
      if (backend.kind === "onedrive" || backend.kind === "webdav") {
        await uploadLibrarySidecarObject(
          backend as RemoteBackend,
          row.objectPath,
          row.bytes,
        )
      } else {
        await backend.writeBytes(row.objectPath, row.bytes)
      }
    }
    await markSyncDatabaseOutboxPublished(library, row.objectPath, nowMs)
    const changeHashes = JSON.parse(row.changeHashesJson) as unknown
    if (
      !Array.isArray(changeHashes) ||
      changeHashes.some((hash) => typeof hash !== "string")
    ) {
      throw new Error("Automerge outbox change hashes are invalid")
    }
    pushed += changeHashes.length
  }
  return pushed
}

export async function hasPendingLibrarySidecarAutomergeChanges(
  library: Library,
): Promise<boolean> {
  const pending = await listSyncDatabaseOutbox(library)
  return pending.length > 0
}

async function listRemoteObjects(
  library: Library,
  backend: SyncBackend,
  identity: LibrarySidecarReplicaIdentity,
): Promise<RemoteObject[]> {
  const actorEntries = await listRemoteEntries(
    backend,
    `${REMOTE_CHANGES_ROOT}/`,
    "pull_actors",
  )
  const objects: RemoteObject[] = []
  for (const entry of actorEntries) {
    const remoteActor = entry.replace(/\/$/, "")
    if (
      !ACTOR_PATTERN.test(remoteActor) ||
      remoteActor === actorId(identity.replicaId)
    ) {
      continue
    }
    const directory = `${REMOTE_CHANGES_ROOT}/${remoteActor}/`
    const names = await listRemoteEntries(backend, directory, "pull_objects")
    for (const name of names) {
      const match = CHANGE_FILE_PATTERN.exec(name)
      if (!match) continue
      const path = `${directory}${name}`
      const received = await hasSyncDatabaseReceipt(library, path)
      if (received) continue
      const bytes = await backend.readBytes(path)
      if (bytes.byteLength > MAX_REMOTE_OBJECT_BYTES) {
        throw new Error(
          `Remote Automerge object exceeds ${MAX_REMOTE_OBJECT_BYTES} bytes`,
        )
      }
      objects.push({
        path,
        head: match[2]!,
        bytes,
        sha256: await hashLibrarySidecarAutomergeBytes(bytes),
      })
      if (objects.length > MAX_REMOTE_OBJECTS_PER_SYNC) {
        throw new Error(
          `Remote Automerge object count exceeds ${MAX_REMOTE_OBJECTS_PER_SYNC}`,
        )
      }
    }
  }
  return objects.sort((left, right) => left.path.localeCompare(right.path))
}

export async function pullLibrarySidecarAutomergeChanges(
  library: Library,
  backend: SyncBackend,
  identity: LibrarySidecarReplicaIdentity,
  nowMs: number,
): Promise<number> {
  await ensureLibrarySidecarAutomergeState(library, identity, nowMs)
  const remoteObjects = await listRemoteObjects(library, backend, identity)
  if (remoteObjects.length === 0) return 0
  return withLibraryWriter(library.id, () =>
    applySyncDatabaseRemoteObjects(
      library,
      identity,
      nowMs,
      remoteObjects.map((object) => ({
        objectPath: object.path,
        head: object.head,
        bytes: object.bytes,
        sha256: object.sha256,
      })),
    ),
  )
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
