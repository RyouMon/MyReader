import type { Scalar } from "@op-engineering/op-sqlite"

import { uuid } from "@/src/utils/common"
import type { LibrarySidecarSyncTransaction } from "./library-sidecar-sync"

export type LibrarySidecarAutomergeStateRow = {
  schemaVersion: number
  snapshotBytes: Uint8Array
  headsJson: string
  updatedAt: number
}

export type LibrarySidecarAutomergeChangeRow = {
  changeHash: string
  actorId: string
  actorSequence: string
  bytes: Uint8Array
  origin: "local" | "remote"
  createdAt: number
}

export type LibrarySidecarAutomergeOutboxRow = {
  objectPath: string
  bytes: Uint8Array
  sha256: string
  changeHashesJson: string
  publishedAt: number | null
}

type DbRow = Record<string, Scalar>

function requiredString(row: DbRow, key: string): string {
  const value = row[key]
  if (typeof value !== "string") {
    throw new Error(`Expected ${key} to be text`)
  }
  return value
}

function requiredInteger(row: DbRow, key: string): number {
  const value = row[key]
  if (typeof value !== "number" || !Number.isSafeInteger(value)) {
    throw new Error(`Expected ${key} to be an integer`)
  }
  return value
}

function requiredBytes(row: DbRow, key: string): Uint8Array {
  const value = row[key]
  if (value instanceof Uint8Array) return value
  if (value instanceof ArrayBuffer) return new Uint8Array(value)
  if (ArrayBuffer.isView(value)) {
    return new Uint8Array(value.buffer, value.byteOffset, value.byteLength)
  }
  throw new Error(`Expected ${key} to be a blob`)
}

export async function readLibrarySidecarAutomergeState(
  tx: LibrarySidecarSyncTransaction,
): Promise<LibrarySidecarAutomergeStateRow | null> {
  const result = await tx.execute(
    `SELECT schema_version, snapshot_bytes, heads_json, updated_at
      FROM sync_automerge_state
      WHERE id = 'local'`,
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    schemaVersion: requiredInteger(row, "schema_version"),
    snapshotBytes: requiredBytes(row, "snapshot_bytes"),
    headsJson: requiredString(row, "heads_json"),
    updatedAt: requiredInteger(row, "updated_at"),
  }
}

export async function writeLibrarySidecarAutomergeState(
  tx: LibrarySidecarSyncTransaction,
  row: LibrarySidecarAutomergeStateRow,
): Promise<void> {
  await tx.execute(
    `INSERT INTO sync_automerge_state
      (id, schema_version, snapshot_bytes, heads_json, updated_at)
      VALUES ('local', ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        schema_version = excluded.schema_version,
        snapshot_bytes = excluded.snapshot_bytes,
        heads_json = excluded.heads_json,
        updated_at = excluded.updated_at`,
    [row.schemaVersion, row.snapshotBytes, row.headsJson, row.updatedAt],
  )
}

export async function insertLibrarySidecarAutomergeChange(
  tx: LibrarySidecarSyncTransaction,
  row: LibrarySidecarAutomergeChangeRow,
): Promise<boolean> {
  const existing = await tx.execute(
    `SELECT change_hash
      FROM sync_automerge_changes
      WHERE change_hash = ? OR (actor_id = ? AND actor_sequence = ?)
      LIMIT 1`,
    [row.changeHash, row.actorId, row.actorSequence],
  )
  const existingRow = existing.rows[0]
  if (existingRow) {
    if (requiredString(existingRow, "change_hash") !== row.changeHash) {
      throw new Error(
        `Automerge actor ${row.actorId} sequence ${row.actorSequence} is a fork`,
      )
    }
    return false
  }
  await tx.execute(
    `INSERT INTO sync_automerge_changes
      (id, change_hash, actor_id, actor_sequence, bytes, origin, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      row.changeHash,
      row.actorId,
      row.actorSequence,
      row.bytes,
      row.origin,
      row.createdAt,
    ],
  )
  return true
}

export async function insertLibrarySidecarAutomergeOutbox(
  tx: LibrarySidecarSyncTransaction,
  row: LibrarySidecarAutomergeOutboxRow,
): Promise<void> {
  const existing = await tx.execute(
    `SELECT sha256
      FROM sync_automerge_outbox
      WHERE object_path = ?`,
    [row.objectPath],
  )
  if (existing.rows[0]) {
    if (requiredString(existing.rows[0], "sha256") !== row.sha256) {
      throw new Error(`Automerge outbox path collision: ${row.objectPath}`)
    }
    return
  }
  await tx.execute(
    `INSERT INTO sync_automerge_outbox
      (id, object_path, bytes, sha256, change_hashes_json, published_at)
      VALUES (?, ?, ?, ?, ?, ?)`,
    [
      uuid(),
      row.objectPath,
      row.bytes,
      row.sha256,
      row.changeHashesJson,
      row.publishedAt,
    ],
  )
}

export async function listPendingLibrarySidecarAutomergeOutbox(
  tx: LibrarySidecarSyncTransaction,
): Promise<LibrarySidecarAutomergeOutboxRow[]> {
  const result = await tx.execute(
    `SELECT object_path, bytes, sha256, change_hashes_json, published_at
      FROM sync_automerge_outbox
      WHERE published_at IS NULL
      ORDER BY object_path`,
  )
  return result.rows.map((row) => ({
    objectPath: requiredString(row, "object_path"),
    bytes: requiredBytes(row, "bytes"),
    sha256: requiredString(row, "sha256"),
    changeHashesJson: requiredString(row, "change_hashes_json"),
    publishedAt: null,
  }))
}

export async function markLibrarySidecarAutomergeOutboxPublished(
  tx: LibrarySidecarSyncTransaction,
  objectPath: string,
  publishedAt: number,
): Promise<void> {
  await tx.execute(
    `UPDATE sync_automerge_outbox
      SET published_at = ?
      WHERE object_path = ?`,
    [publishedAt, objectPath],
  )
}

export async function hasLibrarySidecarAutomergeReceipt(
  tx: LibrarySidecarSyncTransaction,
  objectPath: string,
): Promise<boolean> {
  const result = await tx.execute(
    "SELECT 1 FROM sync_automerge_receipts WHERE object_path = ? LIMIT 1",
    [objectPath],
  )
  return result.rows.length > 0
}

export async function insertLibrarySidecarAutomergeReceipt(
  tx: LibrarySidecarSyncTransaction,
  row: { objectPath: string; sha256: string; appliedAt: number },
): Promise<void> {
  await tx.execute(
    `INSERT INTO sync_automerge_receipts
      (id, object_path, sha256, applied_at)
      VALUES (?, ?, ?, ?)
      ON CONFLICT(object_path) DO UPDATE SET
        sha256 = excluded.sha256,
        applied_at = excluded.applied_at`,
    [uuid(), row.objectPath, row.sha256, row.appliedAt],
  )
}

export async function writeLibrarySidecarAutomergeProjectionMeta(
  tx: LibrarySidecarSyncTransaction,
  row: {
    projectionVersion: number
    headsJson: string
    rebuiltAt: number | null
  },
): Promise<void> {
  await tx.execute(
    `INSERT INTO sync_automerge_projection_meta
      (id, projection_version, heads_json, rebuilt_at)
      VALUES ('local', ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        projection_version = excluded.projection_version,
        heads_json = excluded.heads_json,
        rebuilt_at = excluded.rebuilt_at`,
    [row.projectionVersion, row.headsJson, row.rebuiltAt],
  )
}

export async function readLibrarySidecarAutomergeProjectionMeta(
  tx: LibrarySidecarSyncTransaction,
): Promise<{
  projectionVersion: number
  headsJson: string
  rebuiltAt: number | null
} | null> {
  const result = await tx.execute(
    `SELECT projection_version, heads_json, rebuilt_at
      FROM sync_automerge_projection_meta
      WHERE id = 'local'`,
  )
  const row = result.rows[0]
  if (!row) return null
  return {
    projectionVersion: requiredInteger(row, "projection_version"),
    headsJson: requiredString(row, "heads_json"),
    rebuiltAt:
      row.rebuilt_at === null ? null : requiredInteger(row, "rebuilt_at"),
  }
}

export async function readLibrarySidecarAutomergeDiagnostics(
  tx: LibrarySidecarSyncTransaction,
): Promise<{
  schemaVersion: number | null
  headsJson: string | null
  changes: number
  pendingOutbox: number
  receipts: number
  projectionVersion: number | null
}> {
  const result = await tx.execute(
    `SELECT
      (SELECT schema_version FROM sync_automerge_state WHERE id = 'local')
        AS schema_version,
      (SELECT heads_json FROM sync_automerge_state WHERE id = 'local')
        AS heads_json,
      (SELECT COUNT(*) FROM sync_automerge_changes) AS changes,
      (SELECT COUNT(*) FROM sync_automerge_outbox WHERE published_at IS NULL) AS pending_outbox,
      (SELECT COUNT(*) FROM sync_automerge_receipts) AS receipts,
      (SELECT projection_version FROM sync_automerge_projection_meta WHERE id = 'local')
        AS projection_version`,
  )
  const row = result.rows[0]
  if (!row) {
    return {
      schemaVersion: null,
      headsJson: null,
      changes: 0,
      pendingOutbox: 0,
      receipts: 0,
      projectionVersion: null,
    }
  }
  return {
    schemaVersion:
      row.schema_version === null
        ? null
        : requiredInteger(row, "schema_version"),
    headsJson:
      row.heads_json === null ? null : requiredString(row, "heads_json"),
    changes: requiredInteger(row, "changes"),
    pendingOutbox: requiredInteger(row, "pending_outbox"),
    receipts: requiredInteger(row, "receipts"),
    projectionVersion:
      row.projection_version === null
        ? null
        : requiredInteger(row, "projection_version"),
  }
}
