import type { Scalar, Transaction } from "@op-engineering/op-sqlite"

import type { Library } from "@my-reader/tools/types/library"
import { getLibraryDatabase } from "@/src/services/db/library-db"
import { uuid } from "@/src/utils/common"

export type LibrarySidecarSyncTransaction = Transaction

export type LibrarySidecarLocalMetaRow = {
  protocol: string
  libraryUuid: string
  replicaId: string
  nextSequence: string
}

export type LibrarySidecarOutboxRow = {
  changeId: string
  clock: string
  domain: string
  stateJson: string
  segmentSequence: string | null
}

export type LibrarySidecarPreparedSegmentRow = {
  sequence: string
  path: string
  bytes: Uint8Array
  sha256: string
  changeIdsJson: string
  publishedAt: number | null
}

export type LibrarySidecarCursorRow = {
  replicaId: string
  sequence: string
  fileHash: string
}

type DbRow = Record<string, Scalar>

function requiredString(row: DbRow, key: string): string {
  const value = row[key]
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be text`)
  }
  return value
}

function optionalString(row: DbRow, key: string): string | null {
  const value = row[key]
  if (value === null) return null
  return requiredString(row, key)
}

function preparedSegmentRow(row: DbRow): LibrarySidecarPreparedSegmentRow {
  const rawBytes = row.bytes
  const bytes =
    rawBytes instanceof Uint8Array
      ? rawBytes
      : rawBytes instanceof ArrayBuffer
        ? new Uint8Array(rawBytes)
        : ArrayBuffer.isView(rawBytes)
          ? new Uint8Array(
              rawBytes.buffer,
              rawBytes.byteOffset,
              rawBytes.byteLength,
            )
          : null
  if (!bytes) {
    throw new Error("Expected prepared segment bytes to be a blob")
  }
  const publishedAt = row.published_at
  if (
    publishedAt !== null &&
    (typeof publishedAt !== "number" || !Number.isSafeInteger(publishedAt))
  ) {
    throw new Error("Expected published_at to be an integer")
  }
  return {
    sequence: requiredString(row, "sequence"),
    path: requiredString(row, "path"),
    bytes,
    sha256: requiredString(row, "sha256"),
    changeIdsJson: requiredString(row, "change_ids_json"),
    publishedAt,
  }
}

/**
 * This repository intentionally uses OP-SQLite's native transaction and raw
 * SQL instead of the Drizzle OP-SQLite adapter. The Drizzle adapter commits
 * immediately after invoking a transaction callback without awaiting an async
 * callback, but sync mutations must keep awaited domain, HLC, outbox, segment,
 * and cursor writes in one transaction. OP-SQLite's native transaction awaits
 * the callback correctly, but its transaction handle exposes only execute()
 * and cannot be wrapped as a Drizzle connection. Raw SQL stays confined to
 * this repository so those transaction boundaries remain explicit and atomic.
 */
export async function withLibrarySidecarSyncTransaction<T>(
  library: Library,
  operation: (tx: LibrarySidecarSyncTransaction) => Promise<T>,
): Promise<T> {
  const { raw } = await getLibraryDatabase(library)
  let result: T | undefined
  await raw.transaction(async (tx) => {
    result = await operation(tx)
  })
  return result as T
}

export async function readLibrarySidecarLocalMeta(
  tx: LibrarySidecarSyncTransaction,
): Promise<LibrarySidecarLocalMetaRow | null> {
  const result = await tx.execute(
    "SELECT protocol, library_uuid, replica_id, next_sequence FROM sync_local_meta LIMIT 1",
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    protocol: requiredString(row, "protocol"),
    libraryUuid: requiredString(row, "library_uuid"),
    replicaId: requiredString(row, "replica_id"),
    nextSequence: requiredString(row, "next_sequence"),
  }
}

export async function insertLibrarySidecarLocalMeta(
  tx: LibrarySidecarSyncTransaction,
  row: LibrarySidecarLocalMetaRow,
): Promise<void> {
  await tx.execute(
    `INSERT INTO sync_local_meta
      (id, protocol, library_uuid, replica_id, next_sequence)
      VALUES (?, ?, ?, ?, ?)`,
    [uuid(), row.protocol, row.libraryUuid, row.replicaId, row.nextSequence],
  )
}

export async function readLibrarySidecarHlcState(
  tx: LibrarySidecarSyncTransaction,
): Promise<{ physicalMs: string; counter: string } | null> {
  const result = await tx.execute(
    "SELECT physical_ms, counter FROM sync_hlc_state LIMIT 1",
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    physicalMs: requiredString(row, "physical_ms"),
    counter: requiredString(row, "counter"),
  }
}

export async function writeLibrarySidecarHlcState(
  tx: LibrarySidecarSyncTransaction,
  state: { physicalMs: string; counter: string },
): Promise<void> {
  const result = await tx.execute(
    "UPDATE sync_hlc_state SET physical_ms = ?, counter = ?",
    [state.physicalMs, state.counter],
  )
  if (result.rowsAffected === 0) {
    await tx.execute(
      `INSERT INTO sync_hlc_state (id, physical_ms, counter)
        VALUES (?, ?, ?)`,
      [uuid(), state.physicalMs, state.counter],
    )
  }
}

export async function insertLibrarySidecarOutboxChange(
  tx: LibrarySidecarSyncTransaction,
  row: Omit<LibrarySidecarOutboxRow, "segmentSequence">,
): Promise<void> {
  await tx.execute(
    `INSERT INTO sync_outbox
      (id, change_id, clock, domain, state_json, segment_sequence)
      VALUES (?, ?, ?, ?, ?, NULL)`,
    [uuid(), row.changeId, row.clock, row.domain, row.stateJson],
  )
}

export async function listUnassignedLibrarySidecarOutbox(
  tx: LibrarySidecarSyncTransaction,
  limit: number,
): Promise<LibrarySidecarOutboxRow[]> {
  const result = await tx.execute(
    `SELECT change_id, clock, domain, state_json, segment_sequence
      FROM sync_outbox
      WHERE segment_sequence IS NULL
      ORDER BY clock, change_id
      LIMIT ?`,
    [limit],
  )
  return result.rows.map((row) => ({
    changeId: requiredString(row, "change_id"),
    clock: requiredString(row, "clock"),
    domain: requiredString(row, "domain"),
    stateJson: requiredString(row, "state_json"),
    segmentSequence: optionalString(row, "segment_sequence"),
  }))
}

export async function readPendingLibrarySidecarPreparedSegment(
  tx: LibrarySidecarSyncTransaction,
): Promise<LibrarySidecarPreparedSegmentRow | null> {
  const result = await tx.execute(
    `SELECT sequence, path, bytes, sha256, change_ids_json, published_at
      FROM sync_prepared_segments
      WHERE published_at IS NULL
      ORDER BY length(sequence), sequence
      LIMIT 1`,
  )
  const row = result.rows[0]
  return row ? preparedSegmentRow(row) : null
}

export async function insertLibrarySidecarPreparedSegment(
  tx: LibrarySidecarSyncTransaction,
  row: LibrarySidecarPreparedSegmentRow,
  changeIds: string[],
  nextSequence: string,
): Promise<void> {
  await tx.execute(
    `INSERT INTO sync_prepared_segments
      (id, sequence, path, bytes, sha256, change_ids_json, published_at)
      VALUES (?, ?, ?, ?, ?, ?, NULL)`,
    [uuid(), row.sequence, row.path, row.bytes, row.sha256, row.changeIdsJson],
  )
  for (const changeId of changeIds) {
    const result = await tx.execute(
      `UPDATE sync_outbox
        SET segment_sequence = ?
        WHERE change_id = ? AND segment_sequence IS NULL`,
      [row.sequence, changeId],
    )
    if (result.rowsAffected !== 1) {
      throw new Error(`Outbox change ${changeId} was already assigned`)
    }
  }
  await tx.execute("UPDATE sync_local_meta SET next_sequence = ?", [
    nextSequence,
  ])
}

export async function markLibrarySidecarPreparedSegmentPublished(
  library: Library,
  sequence: string,
  publishedAt: number,
): Promise<void> {
  await withLibrarySidecarSyncTransaction(library, async (tx) => {
    const result = await tx.execute(
      `UPDATE sync_prepared_segments
        SET published_at = ?
        WHERE sequence = ? AND published_at IS NULL`,
      [publishedAt, sequence],
    )
    if (result.rowsAffected !== 1) {
      throw new Error(`Prepared segment ${sequence} is not pending`)
    }
    await tx.execute("DELETE FROM sync_outbox WHERE segment_sequence = ?", [
      sequence,
    ])
  })
}

export async function readLibrarySidecarCursor(
  tx: LibrarySidecarSyncTransaction,
  replicaId: string,
): Promise<LibrarySidecarCursorRow | null> {
  const result = await tx.execute(
    `SELECT replica_id, sequence, file_hash
      FROM sync_cursors
      WHERE replica_id = ?`,
    [replicaId],
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    replicaId: requiredString(row, "replica_id"),
    sequence: requiredString(row, "sequence"),
    fileHash: requiredString(row, "file_hash"),
  }
}

export async function writeLibrarySidecarCursor(
  tx: LibrarySidecarSyncTransaction,
  row: LibrarySidecarCursorRow,
): Promise<void> {
  await tx.execute(
    `INSERT INTO sync_cursors (id, replica_id, sequence, file_hash)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(replica_id) DO UPDATE SET
        sequence = excluded.sequence,
        file_hash = excluded.file_hash`,
    [uuid(), row.replicaId, row.sequence, row.fileHash],
  )
}

export async function insertLibrarySidecarSyncError(
  tx: LibrarySidecarSyncTransaction,
  row: {
    id: string
    code: string
    replicaId: string | null
    sequence: string | null
    domain: string | null
    fileHash: string | null
    createdAt: number
  },
): Promise<void> {
  await tx.execute(
    `INSERT INTO sync_errors
      (id, code, replica_id, sequence, domain, file_hash, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      row.id,
      row.code,
      row.replicaId,
      row.sequence,
      row.domain,
      row.fileHash,
      row.createdAt,
    ],
  )
}
