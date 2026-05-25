/**
 * Barrel re-export for the actions module.
 *
 * Consumers can continue importing from "./actions" while the implementation
 * lives in the focused sub-modules: context, file-actions, reconcile.
 */

export {
  openSyncContext,
  getLibraryCacheDirUri,
  type SyncTargetContext,
} from "./context";

export {
  downloadFile,
  downloadFileDirect,
  downloadFileDirectWithProgress,
  evictLocalFile,
  evictLocalFileOfflineSafe,
  deleteFileEverywhere,
  type DownloadResult,
} from "./file-actions";

export {
  reconcileFileStates,
  listBackedFiles,
  persistManifest,
} from "./reconcile";