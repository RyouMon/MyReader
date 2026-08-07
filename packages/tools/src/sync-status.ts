export const SYNC_STAGES = [
  "preparing",
  "pushing",
  "pulling",
  "applying",
  "sidecar_complete",
  "calibre",
  "complete",
] as const

export type SyncStage = (typeof SYNC_STAGES)[number]

export const SYNC_REASONS = [
  "manual",
  "local_change",
  "automatic_check",
] as const

export type SyncReason = (typeof SYNC_REASONS)[number]

export type SyncIndicatorState =
  | "idle"
  | "offline"
  | "recent_success"
  | "unchanged"
  | "syncing"
  | "pushing"
  | "pulling"
  | "failed"

export type SyncIndicatorInput = {
  isRunning: boolean
  stage?: SyncStage | null
  lastResult?: "success" | "failure" | null
  lastCompletedAt?: number | null
  unchangedCompletedAt?: number | null
  isOffline?: boolean
}

export const TRANSIENT_SYNC_STATUS_MS = 5_000
export const RECENT_SYNC_SUCCESS_MS = TRANSIENT_SYNC_STATUS_MS

const SYNC_STAGE_SET = new Set<string>(SYNC_STAGES)
const SYNC_REASON_SET = new Set<string>(SYNC_REASONS)

/** Normalizes the stage emitted by Core without owning any stage transitions. */
export function parseSyncStage(value: string): SyncStage | null {
  const normalized = value.endsWith("_failed")
    ? value.slice(0, -"_failed".length)
    : value
  return SYNC_STAGE_SET.has(normalized) ? (normalized as SyncStage) : null
}

/** Normalizes persisted or bridged sync reasons into the shared UI contract. */
export function parseSyncReason(value: string): SyncReason | null {
  return SYNC_REASON_SET.has(value) ? (value as SyncReason) : null
}

/** Projects an operation snapshot into the compact status shown in app chrome. */
export function deriveSyncIndicatorState(
  input: SyncIndicatorInput,
  now = Date.now(),
  transientStatusMs = TRANSIENT_SYNC_STATUS_MS,
): SyncIndicatorState {
  if (input.isRunning) {
    if (input.stage === "pushing") return "pushing"
    if (input.stage === "pulling") return "pulling"
    return "syncing"
  }

  if (
    input.unchangedCompletedAt != null &&
    now >= input.unchangedCompletedAt &&
    now - input.unchangedCompletedAt <= transientStatusMs
  ) {
    return "unchanged"
  }

  if (input.lastResult === "failure") return "failed"
  if (input.isOffline) return "offline"

  if (
    input.lastResult === "success" &&
    input.lastCompletedAt != null &&
    now >= input.lastCompletedAt &&
    now - input.lastCompletedAt <= transientStatusMs
  ) {
    return "recent_success"
  }

  return "idle"
}
