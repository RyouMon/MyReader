import {
  DataIntegrityError,
  NetworkError,
  SyncConfigError,
  SyncConnectivityError,
} from "@/src/errors"

import type { SyncFailureKind } from "./types"

/** Keeps scheduler and status reporting on the same failure classification. */
export function classifySyncFailure(error: unknown): SyncFailureKind {
  if (error instanceof SyncConfigError) return "configuration"
  if (error instanceof DataIntegrityError) return "data_integrity"
  if (error instanceof SyncConnectivityError || error instanceof NetworkError) {
    return "connectivity"
  }

  const message = error instanceof Error ? error.message : String(error)
  if (
    /credential|password|unauthorized|authentication|\b401\b|\b403\b/i.test(
      message,
    )
  ) {
    return "credential"
  }
  if (
    /network|offline|timeout|timed out|connection|temporar|unavailable|rate.?limit|429|5\d\d/i.test(
      message,
    )
  ) {
    return "connectivity"
  }
  return "unexpected"
}

export function syncSuspensionReason(error: unknown): string {
  const kind = classifySyncFailure(error)
  return kind === "configuration" || kind === "data_integrity"
    ? kind
    : "unexpected"
}
