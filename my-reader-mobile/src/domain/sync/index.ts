export type {
  CalibreSyncResult,
  FileTransferActions,
  LibrarySyncReport,
  MyReaderSyncMode,
  MyReaderSyncProvider,
  MyReaderSyncResult,
  ScheduledSyncTarget,
  SyncLibrariesDeps,
  SyncLibraryOptions,
  SyncPolicyEntry,
  SyncRunReport,
  SyncScope,
  SyncTrigger,
  SyncTriggerPolicy,
} from "./types";

export {
  DEFAULT_SYNC_POLICY,
  LIBRARY_SYNC_INTERVAL_MS,
  READING_SYNC_INTERVAL_MS,
  resolveSyncOptions,
  scopeHasCalibre,
  scopeHasMyreader,
} from "./policy";

export { syncLibrary, syncLibraries } from "./sync-library";
export { runSyncLibraries, useSyncSchedulerStatus } from "./scheduler";
export type { SchedulerStatus } from "./scheduler";

export { openSyncContext, type SyncTargetContext } from "./context";

export {
  evictLocalFile,
  evictLocalFileOfflineSafe,
  deleteFileEverywhere,
  downloadFileDirect,
  downloadFileDirectWithProgress,
} from "./transfer";

export { checkConnectivity } from "./connectivity";
export { SyncConnectivityError } from "../../errors";
