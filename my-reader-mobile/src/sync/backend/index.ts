// Re-export path utilities that sync code still needs
export { resolveLibraryBooksDir, localFileUriFor } from "../../services/fs/path";

// Re-export new RemoteBackend types for sync consumers
export type {
  RemoteBackend,
  RemoteFileStat,
  RemoteDirEntry,
  DownloadRequest,
  UploadRequest,
  PreparedUpload,
} from "../../services/remote/backend";
export { createRemoteBackend } from "../../services/remote/factory";

// Keep LocalDirectBackend for local library sync
export { LocalDirectBackend } from "./local";
