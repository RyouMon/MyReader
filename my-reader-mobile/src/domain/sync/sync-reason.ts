import type { SyncReason } from "@my-reader/tools/sync-status"

import type { ScheduledSyncTarget, SyncTrigger } from "./types"

const LOCAL_CHANGE_REASONS = new Set(["local_change", "content_ready"])

/** Maps execution policy into the stable reason shown to the user. */
export function syncReasonForTrigger(
  trigger: SyncTrigger,
  scheduledTarget?: ScheduledSyncTarget,
): SyncReason {
  if (trigger === "manual") return "manual"
  if (trigger === "scheduled" && scheduledTarget === "reading") {
    return "local_change"
  }
  return "automatic_check"
}

/** Gives coalesced local mutations priority over a simultaneous passive check. */
export function syncReasonForCoordinatorReasons(
  reasons: readonly string[],
): SyncReason {
  return reasons.some((reason) => LOCAL_CHANGE_REASONS.has(reason))
    ? "local_change"
    : "automatic_check"
}
