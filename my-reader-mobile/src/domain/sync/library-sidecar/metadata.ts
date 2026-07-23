import type { SyncBackend } from "../resolve"
import type { LibrarySidecarReplicaMetadata } from "./contract"
import { formatLibrarySidecarHlc } from "./hlc"
import { LibrarySidecarSegmentError } from "./segment"

const textEncoder = new TextEncoder()
const textDecoder = new TextDecoder("utf-8", { fatal: true })
const RFC3339_PATTERN =
  /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/

function invalid(message: string): never {
  throw new LibrarySidecarSegmentError("invalid_change", message)
}

function record(value: unknown, field: string): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    invalid(`${field} must be an object`)
  }
  return value as Record<string, unknown>
}

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim().length === 0) {
    invalid(`${field} must be non-empty text`)
  }
  return value
}

function optionalText(value: unknown, field: string): void {
  if (
    value !== undefined &&
    (typeof value !== "string" || value.trim().length === 0)
  ) {
    invalid(`${field} must be non-empty text when present`)
  }
}

export function validateLibrarySidecarReplicaMetadata(
  value: unknown,
  expectedReplicaId?: string,
): LibrarySidecarReplicaMetadata {
  const metadata = record(value, "replica metadata")
  if (metadata.schemaVersion !== 1) {
    invalid("replica metadata schemaVersion is unsupported")
  }
  const replicaId = requiredText(metadata.replicaId, "replicaId")
  try {
    formatLibrarySidecarHlc({
      physicalMs: 0n,
      counter: 0n,
      replicaId,
    })
  } catch {
    invalid("replicaId must be a lowercase UUIDv4")
  }
  if (expectedReplicaId && replicaId !== expectedReplicaId) {
    invalid("replica metadata identity does not match its directory")
  }
  const updatedAt = requiredText(metadata.updatedAt, "updatedAt")
  if (
    !RFC3339_PATTERN.test(updatedAt) ||
    !Number.isFinite(Date.parse(updatedAt))
  ) {
    invalid("updatedAt must be an ISO date")
  }
  if (metadata.device !== undefined) {
    const device = record(metadata.device, "device")
    optionalText(device.model, "device.model")
  }
  const system = record(metadata.system, "system")
  requiredText(system.name, "system.name")
  optionalText(system.version, "system.version")
  const app = record(metadata.app, "app")
  requiredText(app.version, "app.version")
  optionalText(app.buildNumber, "app.buildNumber")
  return metadata as unknown as LibrarySidecarReplicaMetadata
}

export function encodeLibrarySidecarReplicaMetadata(
  metadata: LibrarySidecarReplicaMetadata,
): Uint8Array {
  validateLibrarySidecarReplicaMetadata(metadata, metadata.replicaId)
  return textEncoder.encode(JSON.stringify(metadata))
}

export function decodeLibrarySidecarReplicaMetadata(
  bytes: Uint8Array,
  expectedReplicaId: string,
): LibrarySidecarReplicaMetadata {
  let value: unknown
  try {
    value = JSON.parse(textDecoder.decode(bytes)) as unknown
  } catch {
    throw new LibrarySidecarSegmentError(
      "invalid_json",
      "replica metadata is not valid UTF-8 JSON",
    )
  }
  return validateLibrarySidecarReplicaMetadata(value, expectedReplicaId)
}

export async function publishLibrarySidecarReplicaMetadata(
  backend: SyncBackend,
  metadata: LibrarySidecarReplicaMetadata,
): Promise<boolean> {
  const bytes = encodeLibrarySidecarReplicaMetadata(metadata)
  try {
    await backend.writeBytes(
      `.myreader/changes-v4/${metadata.replicaId}/replica.json`,
      bytes,
    )
    return true
  } catch {
    return false
  }
}
