/**
 * Barrel re-export for sync file operations.
 */

export {
  openSyncContext,
  type SyncTargetContext
} from "./context";

export {
  deleteFileEverywhere, downloadFileDirect,
  downloadFileDirectWithProgress,
  evictLocalFile,
  evictLocalFileOfflineSafe
} from "./transfer";

export {
  deleteFileEverywhereForLibrary,
  deleteRemoteFileForLibrary,
  evictLocalFileForLibrary
} from "./file-actions";

export type { FileState as FileStateRow } from "@my-reader/db/types";
export {
  getFileState,
  listFileStates
} from "../../repos/file-state";

