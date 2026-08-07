import type {
  SyncIndicatorState,
  SyncReason,
  SyncStage,
} from "@my-reader/tools/sync-status"
import type { SFSymbol } from "expo-symbols"

export const SYNC_STATUS_IOS_SYMBOLS: Record<SyncIndicatorState, SFSymbol> = {
  idle: "icloud",
  offline: "icloud.slash",
  recent_success: "checkmark.icloud",
  unchanged: "checkmark.icloud",
  syncing: "arrow.triangle.2.circlepath.icloud",
  pushing: "icloud.and.arrow.up",
  pulling: "icloud.and.arrow.down",
  failed: "exclamationmark.icloud",
}

export const SYNC_INDICATOR_LABEL_KEYS = {
  idle: "syncStatus.state.idle",
  offline: "syncStatus.state.offline",
  recent_success: "syncStatus.state.recentSuccess",
  unchanged: "syncStatus.state.unchanged",
  syncing: "syncStatus.state.syncing",
  pushing: "syncStatus.state.pushing",
  pulling: "syncStatus.state.pulling",
  failed: "syncStatus.state.failed",
} as const satisfies Record<SyncIndicatorState, string>

export const SYNC_STAGE_LABEL_KEYS = {
  preparing: "syncStatus.stage.preparing",
  pushing: "syncStatus.stage.pushing",
  pulling: "syncStatus.stage.pulling",
  applying: "syncStatus.stage.applying",
  sidecar_complete: "syncStatus.stage.sidecarComplete",
  calibre: "syncStatus.stage.calibre",
  complete: "syncStatus.stage.complete",
} as const satisfies Record<SyncStage, string>

export const SYNC_REASON_LABEL_KEYS = {
  manual: "syncStatus.reason.manual",
  local_change: "syncStatus.reason.localChange",
  automatic_check: "syncStatus.reason.automaticCheck",
} as const satisfies Record<SyncReason, string>
