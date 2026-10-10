import {
  CredentialError,
  DataIntegrityError,
  NetworkError,
  SyncConfigError,
  SyncFailureError,
} from "@/src/errors"
import { coreSyncFailureKind } from "@/src/services/core/sync-error"

import type { SyncFailureKind } from "./types"

/** Keeps scheduler and status reporting on the same failure classification. */
export function classifySyncFailure(error: unknown): SyncFailureKind {
  if (error instanceof SyncFailureError) return error.failureKind
  if (error instanceof SyncConfigError) return "configuration"
  if (error instanceof DataIntegrityError) return "data_integrity"
  if (error instanceof CredentialError) return "credential"
  if (error instanceof NetworkError) {
    if (error.statusCode === 401 || error.statusCode === 403)
      return "credential"
    if (error.statusCode === 404) return "configuration"
    if (
      error.statusCode === undefined ||
      error.statusCode === 408 ||
      error.statusCode === 429 ||
      error.statusCode >= 500
    )
      return "connectivity"
    if (error.statusCode >= 400 && error.statusCode < 500)
      return "configuration"
    return "unexpected"
  }

  const coreKind = coreSyncFailureKind(error)
  if (coreKind !== undefined) return coreKind

  return "unexpected"
}

export function syncSuspensionReason(error: unknown): string {
  return classifySyncFailure(error)
}
