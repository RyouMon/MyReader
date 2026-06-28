import type { BookDiff } from "./book-diff"
import type { SyncTargetContext } from "./context"
import type { BookItem, DataSource, Library } from "../types"

/** 同步范围 */
export type SyncScope = "all" | "calibre" | "myreader"

/** 触发来源（v1 仅四种） */
export type SyncTrigger = "manual" | "startup" | "add" | "scheduled"

/** myreader 阶段方向 */
export type MyReaderSyncMode = "push_only" | "full"

/** 单库同步参数 */
export type SyncLibraryOptions = {
  scope?: SyncScope
  forceCalibre?: boolean
  throwOnFailure?: boolean
  myreaderMode?: MyReaderSyncMode
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
    reading: SyncPolicyEntry & { intervalMs: number }
    library: SyncPolicyEntry & { intervalMs: number }
  }
}

export type CalibreSyncResult = {
  skipped: boolean
  skipReason?: "unchanged" | "not_applicable" | "connectivity" | "error"
  changed: boolean
  library: Library
  books?: BookItem[]
  diff?: BookDiff
  coversMirrored?: number
  error?: string
}

export type MyReaderSyncResult = {
  skipped: boolean
  skipReason?: "not_applicable" | "error"
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

/** 单类 MyReader 数据的同步单元 */
export type MyReaderSyncProvider = {
  id: string
  push(ctx: SyncTargetContext): Promise<number>
  pull(ctx: SyncTargetContext): Promise<number>
}

export type FileTransferActions = {
  evictLocal(ctx: SyncTargetContext, relativePath: string): Promise<void>
  deleteEverywhere(ctx: SyncTargetContext, relativePath: string): Promise<void>
}
