import { File } from "expo-file-system";

import { DataIntegrityError } from "@/src/errors";
import {
  deleteFileAtUri,
  ensureParentDirectoryForFile,
  fileHasNonEmptyBytes,
  readFileStat,
  type LocalFileStat,
} from "@/src/services/fs/file-io";
import {
  startNativeDownload,
  type NativeDownloadOptions,
} from "@/src/services/download/native";
import type { RemoteBackend } from "@/src/services/remote/backend";

function statAfterNativeDownload(
  destUri: string,
  bytesDownloaded: number,
): LocalFileStat {
  const file = new File(destUri);
  if (!file.exists) {
    throw new DataIntegrityError(`Download completed but file is missing: ${destUri}`);
  }
  const stat = readFileStat(destUri);
  if (stat.size <= 0) {
    throw new DataIntegrityError(`Download completed but file is empty: ${destUri}`);
  }
  if (bytesDownloaded > 0 && stat.size !== bytesDownloaded) {
    console.warn("Native download byte count differs from filesystem size:", {
      bytesDownloaded,
      fileSize: stat.size,
      fileUri: destUri,
    });
  }
  return stat;
}

async function runNativeDownload(
  backend: RemoteBackend,
  remotePath: string,
  destUri: string,
  onProgress?: (received: number, total: number) => void,
  options: NativeDownloadOptions = {},
): Promise<number> {
  const request = await backend.getDownloadRequest(remotePath, destUri);

  return startNativeDownload({
    relativePath: remotePath,
    url: backend.contentUrl(remotePath),
    destinationUri: destUri,
    headers: request.headers,
    onProgress,
    options,
  }).then((result) => result.bytesDownloaded);
}

/**
 * Downloads a remote object into a local file URI, using the native background
 * downloader when the destination is missing or empty.
 */
export async function downloadRemoteToLocalUri(
  backend: RemoteBackend,
  remotePath: string,
  destUri: string,
  onProgress?: (received: number, total: number) => void,
  options: NativeDownloadOptions = {},
): Promise<LocalFileStat> {
  if (fileHasNonEmptyBytes(destUri)) {
    const stat = readFileStat(destUri);
    onProgress?.(stat.size, stat.size);
    return stat;
  }

  if (new File(destUri).exists) {
    await deleteFileAtUri(destUri);
  }

  await ensureParentDirectoryForFile(destUri);
  try {
    const bytesDownloaded = await runNativeDownload(
      backend,
      remotePath,
      destUri,
      onProgress,
      options,
    );
    return statAfterNativeDownload(destUri, bytesDownloaded);
  } catch (err) {
    await deleteFileAtUri(destUri);
    throw err;
  }
}
