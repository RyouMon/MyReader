import { randomUUID } from "expo-crypto"

import type { Library } from "@my-reader/tools/types/library"
import {
  insertLibrarySidecarLocalMeta,
  insertLibrarySidecarPreparedSegment,
  insertLibrarySidecarSyncError,
  listUnassignedLibrarySidecarOutbox,
  markLibrarySidecarPreparedSegmentPublished,
  readLibrarySidecarCursor,
  readLibrarySidecarLocalMeta,
  readPendingLibrarySidecarPreparedSegment,
  withLibrarySidecarSyncTransaction,
  writeLibrarySidecarCursor,
  type LibrarySidecarPreparedSegmentRow,
  type LibrarySidecarSyncTransaction,
} from "@/src/repos/library-sidecar-sync"
import type { SyncBackend } from "../resolve"
import {
  LIBRARY_SIDECAR_PROTOCOL,
  type LibrarySidecarChange,
  type LibrarySidecarSegment,
} from "./contract"
import { formatLibrarySidecarHlc } from "./hlc"
import {
  assertLibrarySidecarLibraryUuid,
  decodeLibrarySidecarSegmentFile,
  hashLibrarySidecarSegmentBytes,
  LibrarySidecarSegmentError,
  parseLibrarySidecarSegmentFileName,
  prepareLibrarySidecarSegment,
} from "./segment"

const DEFAULT_SEGMENT_CHANGE_LIMIT = 100

export type LibrarySidecarReplicaIdentity = {
  libraryUuid: string
  replicaId: string
}

export type LibrarySidecarPlannedFile = {
  name: string
  sequence: string
  hashPrefix: string
}

export type ApplyLibrarySidecarSegment = (
  tx: LibrarySidecarSyncTransaction,
  segment: LibrarySidecarSegment,
) => Promise<void>

export type LibrarySidecarKernelReport = {
  pushed: number
  pulled: number
}

function validateReplicaId(replicaId: string): void {
  formatLibrarySidecarHlc({
    physicalMs: 0n,
    counter: 0n,
    replicaId,
  })
}

function nextSequence(sequence: string): string {
  const value = BigInt(sequence)
  if (value < 1n || value >= (1n << 64n) - 1n) {
    throw new LibrarySidecarSegmentError(
      "invalid_change",
      "local segment sequence is out of range",
    )
  }
  return (value + 1n).toString()
}

function preparedRow(
  prepared: Awaited<ReturnType<typeof prepareLibrarySidecarSegment>>,
): LibrarySidecarPreparedSegmentRow {
  return {
    sequence: prepared.sequence,
    path: prepared.path,
    bytes: prepared.bytes,
    sha256: prepared.sha256,
    changeIdsJson: JSON.stringify(prepared.changeIds),
    publishedAt: null,
  }
}

function parseChangeIds(row: LibrarySidecarPreparedSegmentRow): string[] {
  const value = JSON.parse(row.changeIdsJson) as unknown
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new LibrarySidecarSegmentError(
      "invalid_change",
      "prepared segment change IDs are invalid",
    )
  }
  return value
}

function errorCode(error: unknown): LibrarySidecarSegmentError["code"] {
  return error instanceof LibrarySidecarSegmentError
    ? error.code
    : "projection_failed"
}

async function recordSyncError(
  library: Library,
  error: unknown,
  context: {
    replicaId: string | null
    sequence: string | null
    fileHash: string | null
  },
  nowMs: number,
): Promise<void> {
  await withLibrarySidecarSyncTransaction(library, (tx) =>
    insertLibrarySidecarSyncError(tx, {
      id: randomUUID().replace(/-/g, ""),
      code: errorCode(error),
      replicaId: context.replicaId,
      sequence: context.sequence,
      domain: null,
      fileHash: context.fileHash,
      createdAt: nowMs,
    }),
  )
}

export async function ensureLibrarySidecarReplicaIdentity(
  library: Library,
  libraryUuid: string,
): Promise<LibrarySidecarReplicaIdentity> {
  assertLibrarySidecarLibraryUuid(libraryUuid)
  return withLibrarySidecarSyncTransaction(library, async (tx) => {
    const existing = await readLibrarySidecarLocalMeta(tx)
    if (existing) {
      if (
        existing.protocol !== LIBRARY_SIDECAR_PROTOCOL ||
        existing.libraryUuid !== libraryUuid
      ) {
        throw new LibrarySidecarSegmentError(
          "library_mismatch",
          "local sidecar identity does not match this library",
        )
      }
      validateReplicaId(existing.replicaId)
      return {
        libraryUuid: existing.libraryUuid,
        replicaId: existing.replicaId,
      }
    }

    const replicaId = randomUUID()
    validateReplicaId(replicaId)
    await insertLibrarySidecarLocalMeta(tx, {
      protocol: LIBRARY_SIDECAR_PROTOCOL,
      libraryUuid,
      replicaId,
      nextSequence: "1",
    })
    const inserted = await readLibrarySidecarLocalMeta(tx)
    if (!inserted) {
      throw new Error("Failed to initialize local sidecar identity")
    }
    return {
      libraryUuid: inserted.libraryUuid,
      replicaId: inserted.replicaId,
    }
  })
}

export async function prepareNextLibrarySidecarSegment(
  library: Library,
  nowMs: number,
  changeLimit = DEFAULT_SEGMENT_CHANGE_LIMIT,
): Promise<LibrarySidecarPreparedSegmentRow | null> {
  if (!Number.isInteger(changeLimit) || changeLimit < 1) {
    throw new Error("changeLimit must be a positive integer")
  }
  return withLibrarySidecarSyncTransaction(library, async (tx) => {
    const pending = await readPendingLibrarySidecarPreparedSegment(tx)
    if (pending) return pending

    const meta = await readLibrarySidecarLocalMeta(tx)
    if (!meta) {
      throw new Error("Library sidecar identity is not initialized")
    }
    const outbox = await listUnassignedLibrarySidecarOutbox(tx, changeLimit)
    if (outbox.length === 0) return null

    const changes: LibrarySidecarChange[] = outbox.map((row) => {
      const state = JSON.parse(row.stateJson) as LibrarySidecarChange["state"]
      if (state.domain !== row.domain) {
        throw new LibrarySidecarSegmentError(
          "invalid_change",
          "outbox domain does not match state JSON",
        )
      }
      return {
        changeId: row.changeId,
        clock: row.clock,
        state,
      }
    })
    const segment: LibrarySidecarSegment = {
      protocol: LIBRARY_SIDECAR_PROTOCOL,
      libraryUuid: meta.libraryUuid,
      replicaId: meta.replicaId,
      sequence: meta.nextSequence,
      changes,
    }
    const prepared = await prepareLibrarySidecarSegment(segment, nowMs)
    const row = preparedRow(prepared)
    await insertLibrarySidecarPreparedSegment(
      tx,
      row,
      prepared.changeIds,
      nextSequence(meta.nextSequence),
    )
    return row
  })
}

export async function publishLibrarySidecarSegments(
  library: Library,
  backend: SyncBackend,
  nowMs: number,
): Promise<number> {
  let pushed = 0
  while (true) {
    const prepared = await prepareNextLibrarySidecarSegment(library, nowMs)
    if (!prepared) return pushed

    await backend.writeBytes(prepared.path, prepared.bytes)
    await markLibrarySidecarPreparedSegmentPublished(
      library,
      prepared.sequence,
      nowMs,
    )
    pushed += parseChangeIds(prepared).length
  }
}

export function planLibrarySidecarReplicaFiles(
  names: string[],
  cursorSequence: string,
): LibrarySidecarPlannedFile[] {
  if (!/^(0|[1-9][0-9]*)$/.test(cursorSequence)) {
    throw new LibrarySidecarSegmentError(
      "invalid_change",
      "cursor sequence is invalid",
    )
  }
  const cursor = BigInt(cursorSequence)
  if (cursor > (1n << 64n) - 1n) {
    throw new LibrarySidecarSegmentError(
      "invalid_change",
      "cursor sequence exceeds the u64 limit",
    )
  }
  const groups = new Map<string, LibrarySidecarPlannedFile[]>()

  for (const name of names) {
    if (name === "replica.json" || !name.endsWith(".json")) continue
    const parsed = parseLibrarySidecarSegmentFileName(name)
    if (BigInt(parsed.sequence) <= cursor) continue
    const item = { name, ...parsed }
    const group = groups.get(parsed.sequence)
    if (group) group.push(item)
    else groups.set(parsed.sequence, [item])
  }

  const ordered = [...groups.entries()].sort(([left], [right]) =>
    BigInt(left) < BigInt(right) ? -1 : 1,
  )
  const planned: LibrarySidecarPlannedFile[] = []
  let expected = cursor + 1n
  for (const [sequence, files] of ordered) {
    if (files.length > 1) {
      throw new LibrarySidecarSegmentError(
        "replica_fork",
        `replica has multiple files for sequence ${sequence}`,
      )
    }
    if (BigInt(sequence) !== expected) {
      throw new LibrarySidecarSegmentError(
        "missing_sequence",
        `replica is missing sequence ${expected}`,
      )
    }
    planned.push(files[0]!)
    expected++
  }
  return planned
}

async function pullReplica(
  library: Library,
  backend: SyncBackend,
  identity: LibrarySidecarReplicaIdentity,
  replicaId: string,
  applySegment: ApplyLibrarySidecarSegment,
  nowMs: number,
): Promise<number> {
  const cursor = await withLibrarySidecarSyncTransaction(library, (tx) =>
    readLibrarySidecarCursor(tx, replicaId),
  )
  const cursorSequence = cursor?.sequence ?? "0"
  const names = await backend.listRemote(`.myreader/changes-v4/${replicaId}/`)
  let planned: LibrarySidecarPlannedFile[]
  try {
    planned = planLibrarySidecarReplicaFiles(names, cursorSequence)
  } catch (error) {
    if (!(error instanceof LibrarySidecarSegmentError)) throw error
    const sequence = /sequence (\d+)/.exec(error.message)?.[1]
    await recordSyncError(
      library,
      error,
      {
        replicaId,
        sequence: sequence ?? null,
        fileHash: null,
      },
      nowMs,
    )
    return 0
  }
  let pulled = 0

  for (const file of planned) {
    const path = `.myreader/changes-v4/${replicaId}/${file.name}`
    const bytes = await backend.readBytes(path)
    const fileHash = await hashLibrarySidecarSegmentBytes(bytes)
    try {
      const segment = await decodeLibrarySidecarSegmentFile(file.name, bytes, {
        libraryUuid: identity.libraryUuid,
        replicaId,
        nowMs,
      })
      await withLibrarySidecarSyncTransaction(library, async (tx) => {
        try {
          await applySegment(tx, segment)
        } catch {
          throw new LibrarySidecarSegmentError(
            "projection_failed",
            "segment projection failed",
          )
        }
        await writeLibrarySidecarCursor(tx, {
          replicaId,
          sequence: file.sequence,
          fileHash,
        })
      })
      pulled += segment.changes.length
    } catch (error) {
      if (!(error instanceof LibrarySidecarSegmentError)) throw error
      await recordSyncError(
        library,
        error,
        {
          replicaId,
          sequence: file.sequence,
          fileHash,
        },
        nowMs,
      )
      break
    }
  }
  return pulled
}

export async function pullLibrarySidecarSegments(
  library: Library,
  backend: SyncBackend,
  identity: LibrarySidecarReplicaIdentity,
  applySegment: ApplyLibrarySidecarSegment,
  nowMs: number,
): Promise<number> {
  const entries = await backend.listRemote(".myreader/changes-v4/")
  let pulled = 0
  for (const entry of entries) {
    const replicaId = entry.replace(/\/$/, "")
    if (!replicaId || replicaId === identity.replicaId) continue
    try {
      validateReplicaId(replicaId)
    } catch (error) {
      if (!(error instanceof LibrarySidecarSegmentError)) throw error
      await recordSyncError(
        library,
        error,
        { replicaId, sequence: null, fileHash: null },
        nowMs,
      )
      continue
    }
    pulled += await pullReplica(
      library,
      backend,
      identity,
      replicaId,
      applySegment,
      nowMs,
    )
  }
  return pulled
}

export async function syncLibrarySidecarKernel(
  library: Library,
  backend: SyncBackend,
  identity: LibrarySidecarReplicaIdentity,
  applySegment: ApplyLibrarySidecarSegment,
  nowMs: number,
): Promise<LibrarySidecarKernelReport> {
  const pushed = await publishLibrarySidecarSegments(library, backend, nowMs)
  const pulled = await pullLibrarySidecarSegments(
    library,
    backend,
    identity,
    applySegment,
    nowMs,
  )
  return { pushed, pulled }
}
