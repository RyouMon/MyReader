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
 * Uniform surface for the two supported mobile backends.
 *
 * Paths are always treated as **forward-slash** relative paths rooted at the
 * library; backends translate them into URLs, bookmarked directories or raw
 * filesystem paths as appropriate.
 */
export interface SyncBackend {
  readonly kind: BackendKind;
  readonly isLocalDirect: boolean;
  readBytes(relativePath: string): Promise<Uint8Array>;
  writeBytes(relativePath: string, bytes: Uint8Array): Promise<void>;
  deleteRemote(relativePath: string): Promise<void>;
  statRemote(relativePath: string): Promise<RemoteStat>;
  /**
   * List direct children of the given prefix. Returns names relative to the
   * prefix — directories include a trailing `/`, files do not.
   * Returns `[]` when the directory does not exist (404).
   */
  listRemote(prefix: string): Promise<string[]>;
  getDownloadRequest(relativePath: string): DownloadRequest | null;
  getUploadRequest(relativePath: string): UploadRequest | null;
  prepareUpload?(relativePath: string): Promise<void>;
}
