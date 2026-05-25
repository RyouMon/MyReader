export type BackendKind = "webdav" | "local-direct";

export type RemoteStat = {
  size: number;
  /** mtime in ms; may be 0 when backend does not expose a modification date. */
  mtimeMs: number;
  exists: boolean;
};

export type DownloadRequest = {
  url: string;
  headers?: Record<string, string>;
};

export type UploadRequest = {
  url: string;
  method: "PUT";
  headers?: Record<string, string>;
};

/**
 * Core file operations — all backends must implement.
 *
 * Paths are always treated as **forward-slash** relative paths rooted at the
 * library; backends translate them into URLs, bookmarked directories or raw
 * filesystem paths as appropriate.
 */
export interface RemoteFileOps {
  readonly kind: BackendKind;
  readBytes(relativePath: string): Promise<Uint8Array>;
  writeBytes(relativePath: string, bytes: Uint8Array): Promise<void>;
  deleteRemote(relativePath: string): Promise<void>;
  statRemote(relativePath: string): Promise<RemoteStat>;
  listRemote(prefix: string): Promise<string[]>;
}

/**
 * Native transfer operations — only remote backends (WebDAV) implement.
 * Enables background download/upload via the native adapter without loading
 * entire file contents into JS memory.
 */
export interface NativeTransferOps {
  getDownloadRequest(relativePath: string): DownloadRequest;
  getUploadRequest(relativePath: string): UploadRequest;
  prepareUpload(relativePath: string): Promise<void>;
}

/** Union type for backends that support native file transfer. */
export type TransferBackend = RemoteFileOps & NativeTransferOps;

/** Type guard: checks whether a backend supports native transfer. */
export function isTransferBackend(backend: RemoteFileOps): backend is TransferBackend {
  return "getDownloadRequest" in backend;
}
