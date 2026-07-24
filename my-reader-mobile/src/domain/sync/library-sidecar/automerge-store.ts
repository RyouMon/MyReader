import type { Library } from "@my-reader/tools/types/library"

import {
  hasLibrarySidecarAutomergeReceipt,
  insertLibrarySidecarAutomergeChange,
  insertLibrarySidecarAutomergeOutbox,
  insertLibrarySidecarAutomergeReceipt,
  listPendingLibrarySidecarAutomergeOutbox,
  markLibrarySidecarAutomergeOutboxPublished,
  readLibrarySidecarAutomergeDiagnostics,
  readLibrarySidecarAutomergeProjectionMeta,
  readLibrarySidecarAutomergeState,
  writeLibrarySidecarAutomergeProjectionMeta,
  writeLibrarySidecarAutomergeState,
} from "@/src/repos/library-sidecar-automerge"
import {
  withLibrarySidecarSyncTransaction,
  type LibrarySidecarSyncTransaction,
} from "@/src/repos/library-sidecar-sync"
import type { SyncBackend } from "../resolve"
import { hashLibrarySidecarAutomergeBytes } from "./automerge-binary"
import {
  applyLibrarySidecarIncremental,
  assertLibrarySidecarIdentity,
  createLibrarySidecarDocument,
  librarySidecarChangesSince,
  librarySidecarDocumentHeads,
  librarySidecarMissingDependencies,
  loadLibrarySidecarDocument,
  saveLibrarySidecarDocument,
  saveLibrarySidecarIncremental,
  setLibrarySidecarIdentity,
  type LibrarySidecarDocument,
} from "./automerge-document"
import type { LibrarySidecarReplicaIdentity } from "./replica-identity"
import type { Doc } from "@automerge/automerge/slim"

const REMOTE_CHANGES_ROOT = ".myreader/automerge/changes"
const PROJECTION_VERSION = 1
const MAX_REMOTE_OBJECT_BYTES = 4 * 1024 * 1024
const MAX_REMOTE_OBJECTS_PER_SYNC = 10_000
const ACTOR_PATTERN = /^[0-9a-f]{32}$/
const CHANGE_FILE_PATTERN = /^([0-9]{20})-([0-9a-f]{64})\.am$/

type ProjectionWriter = (
  tx: LibrarySidecarSyncTransaction,
  document: Doc<LibrarySidecarDocument>,
  headsJson: string,
) => Promise<void>

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

function outboxPath(change: {
  actorId: string
  sequence: string
  hash: string
}): string {
  const sequence = change.sequence.padStart(20, "0")
  if (sequence.length !== 20) {
    throw new Error("Automerge actor sequence exceeds the supported range")
  }
  return `${REMOTE_CHANGES_ROOT}/${change.actorId}/${sequence}-${change.hash}.am`
}

async function writeDocumentState(
  tx: LibrarySidecarSyncTransaction,
  document: Doc<LibrarySidecarDocument>,
  nowMs: number,
): Promise<string> {
  const headsJson = JSON.stringify(librarySidecarDocumentHeads(document))
  await writeLibrarySidecarAutomergeState(tx, {
    schemaVersion: document.schema,
    snapshotBytes: saveLibrarySidecarDocument(document),
    headsJson,
    updatedAt: nowMs,
  })
  return headsJson
}

async function writeChanges(
  tx: LibrarySidecarSyncTransaction,
  changes: ReturnType<typeof librarySidecarChangesSince>,
  origin: "local" | "remote",
  nowMs: number,
): Promise<void> {
  for (const change of changes) {
    await insertLibrarySidecarAutomergeChange(tx, {
      changeHash: change.hash,
      actorId: change.actorId,
      actorSequence: change.sequence,
      bytes: change.bytes,
      origin,
      createdAt: nowMs,
    })
  }
}

async function initializeDocument(
  library: Library,
  identity: LibrarySidecarReplicaIdentity,
  nowMs: number,
): Promise<Doc<LibrarySidecarDocument>> {
  const genesis = await createLibrarySidecarDocument(identity.replicaId)
  const genesisHeads = librarySidecarDocumentHeads(genesis)
  const initialized = setLibrarySidecarIdentity(
    genesis,
    identity.libraryUuid,
    nowMs,
  )
  const changes = librarySidecarChangesSince(initialized, genesisHeads)
  const incremental = saveLibrarySidecarIncremental(initialized, genesisHeads)
  const lastChange = changes.at(-1)
  if (!lastChange) {
    throw new Error("Automerge library initialization produced no change")
  }
  const sha256 = await hashLibrarySidecarAutomergeBytes(incremental)
  await withLibrarySidecarSyncTransaction(library, async (tx) => {
    const existing = await readLibrarySidecarAutomergeState(tx)
    if (existing) return
    const headsJson = await writeDocumentState(tx, initialized, nowMs)
    await writeChanges(tx, changes, "local", nowMs)
    await insertLibrarySidecarAutomergeOutbox(tx, {
      objectPath: outboxPath(lastChange),
      bytes: incremental,
      sha256,
      changeHashesJson: JSON.stringify(changes.map((change) => change.hash)),
      publishedAt: null,
    })
    await writeLibrarySidecarAutomergeProjectionMeta(tx, {
      projectionVersion: PROJECTION_VERSION,
      headsJson,
      rebuiltAt: nowMs,
    })
  })
  return initialized
}

async function loadCommittedDocument(
  library: Library,
  identity: LibrarySidecarReplicaIdentity,
): Promise<Doc<LibrarySidecarDocument> | null> {
  const state = await withLibrarySidecarSyncTransaction(
    library,
    readLibrarySidecarAutomergeState,
  )
  if (!state) return null
  const document = await loadLibrarySidecarDocument(
    state.snapshotBytes,
    identity.replicaId,
  )
  assertLibrarySidecarIdentity(document, identity.libraryUuid)
  if (
    JSON.stringify(librarySidecarDocumentHeads(document)) !== state.headsJson
  ) {
    throw new Error("Persisted Automerge heads do not match its snapshot")
  }
  return document
}

export async function ensureLibrarySidecarAutomergeState(
  library: Library,
  identity: LibrarySidecarReplicaIdentity,
  nowMs: number,
): Promise<Doc<LibrarySidecarDocument>> {
  return withLibraryWriter(library.id, async () => {
    const existing = await loadCommittedDocument(library, identity)
    if (existing) return existing
    await initializeDocument(library, identity, nowMs)
    const committed = await loadCommittedDocument(library, identity)
    if (!committed) {
      throw new Error("Automerge state initialization did not commit")
    }
    return committed
  })
}

export async function commitLibrarySidecarAutomergeMutation(
  library: Library,
  identity: LibrarySidecarReplicaIdentity,
  nowMs: number,
  mutate: (
    document: Doc<LibrarySidecarDocument>,
  ) => Doc<LibrarySidecarDocument>,
  project?: ProjectionWriter,
): Promise<Doc<LibrarySidecarDocument>> {
  await ensureLibrarySidecarAutomergeState(library, identity, nowMs)
  return withLibraryWriter(library.id, async () => {
    const committed = await loadCommittedDocument(library, identity)
    if (!committed) throw new Error("Automerge state is not initialized")
    const beforeHeads = librarySidecarDocumentHeads(committed)
    const next = mutate(committed)
    assertLibrarySidecarIdentity(next, identity.libraryUuid)
    const changes = librarySidecarChangesSince(next, beforeHeads)
    if (changes.length === 0) return committed
    const incremental = saveLibrarySidecarIncremental(next, beforeHeads)
    const lastChange = changes.at(-1)
    if (!lastChange) throw new Error("Automerge mutation produced no change")
    const sha256 = await hashLibrarySidecarAutomergeBytes(incremental)
    await withLibrarySidecarSyncTransaction(library, async (tx) => {
      const headsJson = await writeDocumentState(tx, next, nowMs)
      await writeChanges(tx, changes, "local", nowMs)
      await insertLibrarySidecarAutomergeOutbox(tx, {
        objectPath: outboxPath(lastChange),
        bytes: incremental,
        sha256,
        changeHashesJson: JSON.stringify(changes.map((change) => change.hash)),
        publishedAt: null,
      })
      await project?.(tx, next, headsJson)
      await writeLibrarySidecarAutomergeProjectionMeta(tx, {
        projectionVersion: PROJECTION_VERSION,
        headsJson,
        rebuiltAt: null,
      })
    })
    return next
  })
}

async function rebuildProjectionIfNeeded(
  library: Library,
  identity: LibrarySidecarReplicaIdentity,
  nowMs: number,
  project?: ProjectionWriter,
): Promise<void> {
  if (!project) return
  await withLibraryWriter(library.id, async () => {
    const state = await withLibrarySidecarSyncTransaction(
      library,
      readLibrarySidecarAutomergeState,
    )
    if (!state) throw new Error("Automerge state is not initialized")
    const meta = await withLibrarySidecarSyncTransaction(
      library,
      readLibrarySidecarAutomergeProjectionMeta,
    )
    if (
      meta?.projectionVersion === PROJECTION_VERSION &&
      meta.headsJson === state.headsJson
    ) {
      return
    }
    const document = await loadLibrarySidecarDocument(
      state.snapshotBytes,
      identity.replicaId,
    )
    assertLibrarySidecarIdentity(document, identity.libraryUuid)
    await withLibrarySidecarSyncTransaction(library, async (tx) => {
      await project(tx, document, state.headsJson)
      await writeLibrarySidecarAutomergeProjectionMeta(tx, {
        projectionVersion: PROJECTION_VERSION,
        headsJson: state.headsJson,
        rebuiltAt: nowMs,
      })
    })
  })
}

async function remoteObjectExists(
  backend: SyncBackend,
  objectPath: string,
): Promise<boolean> {
  const separator = objectPath.lastIndexOf("/")
  const directory = objectPath.slice(0, separator + 1)
  const name = objectPath.slice(separator + 1)
  return (await backend.listRemote(directory)).includes(name)
}

export async function publishLibrarySidecarAutomergeChanges(
  library: Library,
  backend: SyncBackend,
  nowMs: number,
): Promise<number> {
  const pending = await withLibrarySidecarSyncTransaction(
    library,
    listPendingLibrarySidecarAutomergeOutbox,
  )
  let pushed = 0
  for (const row of pending) {
    if (await remoteObjectExists(backend, row.objectPath)) {
      const existing = await backend.readBytes(row.objectPath)
      if ((await hashLibrarySidecarAutomergeBytes(existing)) !== row.sha256) {
        throw new Error(`Remote Automerge object changed: ${row.objectPath}`)
      }
    } else {
      await backend.writeBytes(row.objectPath, row.bytes)
    }
    await withLibrarySidecarSyncTransaction(library, (tx) =>
      markLibrarySidecarAutomergeOutboxPublished(tx, row.objectPath, nowMs),
    )
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

async function listRemoteObjects(
  library: Library,
  backend: SyncBackend,
  identity: LibrarySidecarReplicaIdentity,
): Promise<RemoteObject[]> {
  const actorEntries = await backend.listRemote(`${REMOTE_CHANGES_ROOT}/`)
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
    const names = await backend.listRemote(directory)
    for (const name of names) {
      const match = CHANGE_FILE_PATTERN.exec(name)
      if (!match) continue
      const path = `${directory}${name}`
      const received = await withLibrarySidecarSyncTransaction(library, (tx) =>
        hasLibrarySidecarAutomergeReceipt(tx, path),
      )
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
  project?: ProjectionWriter,
): Promise<number> {
  await ensureLibrarySidecarAutomergeState(library, identity, nowMs)
  await rebuildProjectionIfNeeded(library, identity, nowMs, project)
  const remoteObjects = await listRemoteObjects(library, backend, identity)
  if (remoteObjects.length === 0) return 0
  return withLibraryWriter(library.id, async () => {
    const committed = await loadCommittedDocument(library, identity)
    if (!committed) throw new Error("Automerge state is not initialized")
    const beforeHeads = librarySidecarDocumentHeads(committed)
    let next = committed
    for (const object of remoteObjects) {
      next = applyLibrarySidecarIncremental(next, object.bytes)
    }
    assertLibrarySidecarIdentity(next, identity.libraryUuid)
    const accepted = remoteObjects.filter(
      (object) =>
        librarySidecarMissingDependencies(next, [object.head]).length === 0,
    )
    if (accepted.length !== remoteObjects.length) {
      throw new Error("Remote Automerge objects have missing dependencies")
    }
    const changes = librarySidecarChangesSince(next, beforeHeads)
    await withLibrarySidecarSyncTransaction(library, async (tx) => {
      const headsJson = await writeDocumentState(tx, next, nowMs)
      await writeChanges(tx, changes, "remote", nowMs)
      for (const object of accepted) {
        await insertLibrarySidecarAutomergeReceipt(tx, {
          objectPath: object.path,
          sha256: object.sha256,
          appliedAt: nowMs,
        })
      }
      await project?.(tx, next, headsJson)
      await writeLibrarySidecarAutomergeProjectionMeta(tx, {
        projectionVersion: PROJECTION_VERSION,
        headsJson,
        rebuiltAt: null,
      })
    })
    return accepted.length
  })
}

export async function syncLibrarySidecarAutomerge(
  library: Library,
  backend: SyncBackend,
  identity: LibrarySidecarReplicaIdentity,
  nowMs: number,
  project?: ProjectionWriter,
): Promise<{ pushed: number; pulled: number }> {
  await ensureLibrarySidecarAutomergeState(library, identity, nowMs)
  const pushed = await publishLibrarySidecarAutomergeChanges(
    library,
    backend,
    nowMs,
  )
  const pulled = await pullLibrarySidecarAutomergeChanges(
    library,
    backend,
    identity,
    nowMs,
    project,
  )
  const diagnostics = await withLibrarySidecarSyncTransaction(
    library,
    readLibrarySidecarAutomergeDiagnostics,
  )
  console.info("[reading-sync] automerge:complete", {
    libraryId: library.id,
    replicaId: identity.replicaId,
    pushed,
    pulled,
    ...diagnostics,
  })
  return { pushed, pulled }
}
