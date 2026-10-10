// Error inspection needs only generated JS types, not native module initialization.
import {
  CoreFfiError,
  type SyncFailureKind,
} from "my-reader-core/src/generated/my_reader_core_ffi"

import { DataIntegrityError, SyncFailureError } from "@/src/errors"

const FAILURE_KINDS = {
  Core: "unexpected",
  Sync: "unexpected",
  DataIntegrity: "data_integrity",
  Io: "unexpected",
  Database: "unexpected",
  Config: "configuration",
  NotFound: "configuration",
  Serialize: "unexpected",
  Storage: "connectivity",
  Tts: "unexpected",
  Credential: "credential",
  Request: "connectivity",
} satisfies Record<CoreFfiError["tag"], SyncFailureKind>

function isCoreError(error: unknown): error is CoreFfiError {
  return (
    typeof error === "object" &&
    error !== null &&
    CoreFfiError.instanceOf(error)
  )
}

export function coreSyncFailureKind(
  error: unknown,
): SyncFailureKind | undefined {
  return isCoreError(error) ? FAILURE_KINDS[error.tag] : undefined
}

/** Preserve native exception categories just as sync reports preserve failureKind. */
export function coreSyncError(error: unknown): unknown {
  if (!isCoreError(error)) return error
  if (error.tag === "DataIntegrity") {
    return new DataIntegrityError(error.message, { cause: error })
  }
  return new SyncFailureError(error.message, FAILURE_KINDS[error.tag], {
    cause: error,
  })
}
