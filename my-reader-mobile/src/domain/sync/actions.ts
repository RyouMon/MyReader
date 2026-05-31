/**
 * Barrel re-export for sync file operations.
 */

export {
  openSyncContext,
  type SyncTargetContext,
} from "./context";

export {
  downloadFileDirect,
  downloadFileDirectWithProgress,
  evictLocalFile,
  evictLocalFileOfflineSafe,
  deleteFileEverywhere,
} from "./transfer";

export {
  deleteFileEverywhereForLibrary,
  deleteRemoteFileForLibrary,
  evictLocalFileForLibrary,
} from "./file-actions";

export {
  getFileState,
  listFileStates,
  subscribeFileState,
  getFileStateRevision,
} from "../../repos/file_state";
export type { FileState as FileStateRow } from "@my-reader/db/types";
