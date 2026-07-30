import type { BookItem, DataSource, Library } from "../types"

/** 同步范围 */
export type SyncScope = "all" | "calibre" | "myreader"

/** 触发来源（v1 仅四种） */
export type SyncTrigger = "manual" | "startup" | "add" | "scheduled"

/** myreader 阶段方向 */
export type MyReaderSyncMode = "push_only" | "full"

export type SyncFailureKind =
  | "connectivity"
  | "configuration"
  | "credential"
  | "data_integrity"
  | "unexpected"

/** 单库同步参数 */
export type SyncLibraryOptions = {
  scope?: SyncScope
  forceCalibre?: boolean
  throwOnFailure?: boolean
  myreaderMode?: MyReaderSyncMode
  myreaderTaskId?: string
}

/** 某触发源下的策略条目 */
export type SyncPolicyEntry = {
  enabled: boolean
  options: SyncLibraryOptions
}

/** scheduled 调用 syncLibraries 时的库范围 */
export type ScheduledSyncTarget = "reading" | "library"

/** 全局触发策略 */
export type SyncTriggerPolicy = {
  manual: SyncPolicyEntry
  add: SyncPolicyEntry
  startup: SyncPolicyEntry
  scheduled: {
    reading: SyncPolicyEntry
    library: SyncPolicyEntry
  }
}

export type CalibreSyncResult = {
  skipped: boolean
  skipReason?: "unchanged" | "not_applicable" | "connectivity" | "error"
  changed: boolean
  library: Library
  books?: BookItem[]
  error?: string
}

export type MyReaderSyncResult = {
  skipped: boolean
  skipReason?: "not_applicable" | "error"
  failureKind?: SyncFailureKind
  mode: MyReaderSyncMode
  providers: Record<string, { pushed: number; pulled: number; error?: string }>
  error?: string
}

export type LibrarySyncReport = {
  libraryId: string
  libraryName: string
  calibre: CalibreSyncResult
  myreader: MyReaderSyncResult
  durationMs: number
  error?: string
  failureKind?: SyncFailureKind
}

export type SyncRunReport = {
  trigger: SyncTrigger
  startedAt: number
  finishedAt: number
  durationMs: number
  results: LibrarySyncReport[]
  aborted?: boolean
}

export type SyncLibrariesDeps = {
  libraries: Library[]
  dataSources: DataSource[]
  syncOnStartup: boolean
  enableAutoSync: boolean
  activeLibraryId?: string | null
}
