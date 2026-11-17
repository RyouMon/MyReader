import type { DataSource } from "@my-reader/tools/types/data-source"
import type { Library } from "@my-reader/tools/types/library"
import { Directory, File } from "expo-file-system"
import {
  storageDelete,
  storageDownloadRequest,
  storageList,
  storageRead,
  storageStat,
  storageWrite,
} from "my-reader-core"
import { CredentialError, NetworkError } from "../../errors"
import { invalidateCloudAccessToken } from "../auth/cloud"
import { appConfigPath } from "../core/app-config"
import { coreErrorKind } from "../core/error"
import { resolveRemoteCredential } from "../core/remote-credentials"
import {
  type LibraryStorageConfig,
  resolveLibraryStorage,
  toCoreLibraryStorage,
} from "../core/sync"
import { libraryRootUri } from "../fs/library-paths"
import {
  parentDirectoryUriForFileUri,
  toNativeFilesystemPath,
} from "../fs/path"
import type { DownloadRequest, RemoteBackend, RemoteFileStat } from "./backend"

/**
 * Provider-neutral mobile transport. Provider-specific authentication and
 * request signing stay in Rust Core, so adding an OpenDAL provider does not
 * require another React Native HTTP implementation.
 */
export class CoreRemoteBackend implements RemoteBackend {
  readonly kind: Extract<RemoteBackend["kind"], "gdrive" | "dropbox" | "s3">
  readonly dataSourceId: string

  constructor(
    dataSourceId: string,
    private readonly source: Extract<
      DataSource,
      { type: "gdrive" | "dropbox" | "s3" }
    >,
    private readonly library: Library,
  ) {
    this.dataSourceId = dataSourceId
    this.kind = source.type
  }

  async getAuthHeaders(): Promise<Record<string, string>> {
    const storage = await this.resolveStorage()
    if (
      (storage.kind === "gdrive" || storage.kind === "dropbox") &&
      storage.accessToken
    ) {
      return { Authorization: `Bearer ${storage.accessToken}` }
    }
    return {}
  }

  getCachedAuthHeaders(): Record<string, string> | null {
    return null
  }

  async invalidateAuth(): Promise<void> {
    // The next operation resolves the current SecureStore token. Auth refresh
    // invalidation is handled by the shared cloud auth service.
    if (this.kind === "gdrive" || this.kind === "dropbox") {
      await invalidateCloudAccessToken(this.dataSourceId)
    }
  }

  async statRemoteFile(remotePath: string): Promise<RemoteFileStat | null> {
    try {
      const stat = await storageStat(
        toCoreLibraryStorage(await this.resolveStorage()),
        remotePath,
      )
      return stat
        ? { etag: stat.etag, size: stat.size, mtimeMs: stat.mtimeMs }
        : null
    } catch (error) {
      throw asNetworkError(error, remotePath, "stat")
    }
  }

  async readBytes(remotePath: string): Promise<Uint8Array> {
    try {
      return new Uint8Array(
        await storageRead(
          toCoreLibraryStorage(await this.resolveStorage()),
          remotePath,
        ),
      )
    } catch (error) {
      throw asNetworkError(error, remotePath, "read")
    }
  }

  async writeBytes(remotePath: string, bytes: Uint8Array): Promise<void> {
    try {
      await storageWrite(
        toCoreLibraryStorage(await this.resolveStorage()),
        remotePath,
        bytes.slice().buffer,
      )
    } catch (error) {
      throw asNetworkError(error, remotePath, "write")
    }
  }

  async deleteRemote(remotePath: string): Promise<void> {
    try {
      await storageDelete(
        toCoreLibraryStorage(await this.resolveStorage()),
        remotePath,
      )
    } catch (error) {
      throw asNetworkError(error, remotePath, "delete")
    }
  }

  async listRemote(prefix: string): Promise<string[]> {
    try {
      return await storageList(
        toCoreLibraryStorage(await this.resolveStorage()),
        prefix,
      )
    } catch (error) {
      throw asNetworkError(error, prefix, "list")
    }
  }

  async downloadToUri(remotePath: string, localFileUri: string): Promise<File> {
    const request = await this.getDownloadRequest(remotePath, localFileUri)
    const parentUri = parentDirectoryUriForFileUri(localFileUri)
    if (parentUri) {
      const parent = new Directory(parentUri)
      if (!parent.exists)
        parent.create({ idempotent: true, intermediates: true })
    }
    const file = new File(localFileUri)
    if (file.exists) file.delete()
    await File.downloadFileAsync(request.url, file, {
      headers: request.headers,
      idempotent: true,
    })
    return file
  }

  async getDownloadRequest(
    remotePath: string,
    localFileUri: string,
  ): Promise<DownloadRequest> {
    try {
      const request = await storageDownloadRequest(
        toCoreLibraryStorage(await this.resolveStorage()),
        remotePath,
      )
      return {
        remotePath,
        localFileUri,
        url: request.url,
        headers: Object.fromEntries(request.headers),
      }
    } catch (error) {
      throw asNetworkError(error, remotePath, "download")
    }
  }

  async getUploadRequest(): Promise<never> {
    throw new Error("NATIVE_UPLOAD_REQUEST_UNSUPPORTED")
  }

  async getContentUri(
    remotePath: string,
  ): Promise<{ uri: string; headers?: Record<string, string> }> {
    const request = await this.getDownloadRequest(remotePath, "")
    return { uri: request.url, headers: request.headers }
  }

  contentUrl(): string {
    // GDrive and S3 require an async Core request (file ID lookup or a
    // presigned URL). Their covers are resolved through the download path.
    return ""
  }

  private async resolveStorage(): Promise<LibraryStorageConfig> {
    const credential = await resolveRemoteCredential(this.source)
    return resolveLibraryStorage({
      configPath: appConfigPath,
      libraryId: this.library.id,
      localRootPath: toNativeFilesystemPath(libraryRootUri(this.library)),
      credential,
    })
  }
}

function asNetworkError(error: unknown, path: string, operation: string) {
  if (
    error instanceof NetworkError ||
    error instanceof CredentialError ||
    coreErrorKind(error)
  ) {
    return error
  }
  return new NetworkError(
    `Remote ${operation} failed: ${path}: ${error instanceof Error ? error.message : String(error)}`,
    undefined,
    { cause: error },
  )
}
