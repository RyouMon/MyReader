import type { File as ExpoFile } from "expo-file-system"

export type DownloadRequest = {
  remotePath: string
  localFileUri: string
  url: string
  headers: Record<string, string>
}

export type UploadRequest = {
  localFileUri: string
  remotePath: string
  headers: Record<string, string>
}

export type PreparedUpload = {
  id: string
  remotePath: string
  headers: Record<string, string>
}

export type RemoteFileStat = {
  etag: string
  size: number
  mtimeMs: number
}

export type RemoteBackendKind =
  | "onedrive"
  | "webdav"
  | "gdrive"
  | "dropbox"
  | "s3"

export interface RemoteBackend {
  readonly kind: RemoteBackendKind
  readonly dataSourceId: string

  // -- Auth --
  getAuthHeaders(): Promise<Record<string, string>>
  getCachedAuthHeaders(): Record<string, string> | null
  invalidateAuth(): void | Promise<void>

  // -- Stat --
  statRemoteFile(remotePath: string): Promise<RemoteFileStat | null>

  // -- Transfer (low-level) --
  readBytes(remotePath: string): Promise<Uint8Array>
  writeBytes(remotePath: string, bytes: Uint8Array): Promise<void>
  deleteRemote(remotePath: string): Promise<void>
  listRemote(prefix: string): Promise<string[]>
  downloadToUri(remotePath: string, localFileUri: string): Promise<ExpoFile>

  // -- Transfer (native background) --
  getDownloadRequest(
    remotePath: string,
    localFileUri: string,
  ): Promise<DownloadRequest>
  getUploadRequest(
    localFileUri: string,
    remotePath: string,
  ): Promise<UploadRequest>
  prepareUpload?(
    localFileUri: string,
    remotePath: string,
  ): Promise<PreparedUpload>

  // -- Path / URL --
  contentUrl(remotePath: string): string

  /** Resolves provider-specific URLs such as GDrive IDs or S3 signatures. */
  getContentUri?(
    remotePath: string,
  ): Promise<string | { uri: string; headers?: Record<string, string> }>
}
