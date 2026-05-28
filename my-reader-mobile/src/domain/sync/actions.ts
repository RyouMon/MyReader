/**
 * Barrel re-export for the actions module.
 *
 * Consumers can continue importing from "./actions" while the implementation
 * lives in the focused sub-modules: context, transfer, reconcile.
 */

export {
  openSyncContext,
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
} from "./transfer";

export {
  reconcileFileStates,
  listBackedFiles,
} from "./reconcile";

export {
  getFileState,
  listFileStates,
  subscribeFileState,
  getFileStateRevision,
} from "../../repos/file_state";
export type { FileState as FileStateRow } from "@my-reader/db/types";