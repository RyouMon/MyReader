import { File } from "expo-file-system";

import type { Library } from "../data/types";
import { useAppStore } from "../store/app-store";
import { AppInvariantError, DataIntegrityError, NetworkError } from "../errors";

import { localFileUriFor } from "./backend";
import { openSyncContext, type SyncTargetContext } from "./actions";
import { upsertFileState } from "./file_state";
import {
  downloadFileDirectWithProgress as downloadCacheFileDirectWithProgress,
  type BackgroundDownloadOptions,
  type DownloadOutcome,
} from "./file_ops";
import { resolveSyncTarget } from "./resolve";

export type DownloadProgressHandler = (received: number, total: number) => void;

export type LibraryDownloadRequest = {
  libraryId: string;
  relativePath: string;
  onProgress?: DownloadProgressHandler;
  options?: BackgroundDownloadOptions;
};

/**
 * Opens the current app-store library snapshot for queue-driven download work.
 */
export async function openDownloadContextForLibrary(libraryId: string): Promise<SyncTargetContext> {
  const { libraries, dataSources } = useAppStore.getState();
  const library = libraries.find((item: Library) => item.id === libraryId);
  if (!library) throw new AppInvariantError(`未找到书库: ${libraryId}`);
  return openSyncContext(library, dataSources);
}

/**
 * Performs a lightweight connectivity probe for the given library.
 * Local libraries always pass. WebDAV libraries get a 2-second timeout.
 */
export async function checkLibraryConnectivity(libraryId: string): Promise<void> {
  const { libraries, dataSources } = useAppStore.getState();
  const library = libraries.find((item: Library) => item.id === libraryId);
  if (!library) throw new AppInvariantError(`未找到书库: ${libraryId}`);
  if (library.sourceType !== "webdav") return;

  const resolved = await resolveSyncTarget(library, dataSources);
  // 用单一包裹 promise 把 statRemote 回调和 clearTimeout 统一管理，
  // 避免独立 timeout promise 在 Hermes 的 unhandled-rejection 检测中被误报。
  await new Promise<void>((resolve, reject) => {
    const timeoutId = setTimeout(() => {
      reject(new NetworkError("连接数据源超时（2秒），请检查网络或 WebDAV 配置"));
    }, 2000);
    resolved.backend.statRemote(".").then(
      () => { clearTimeout(timeoutId); resolve(); },
      (err: unknown) => { clearTimeout(timeoutId); reject(err); },
    );
  });
}

/**
 * Downloads a cache file and commits the local `present` state in one place.
 */
export async function downloadLibraryFile({
  libraryId,
  relativePath,
  onProgress,
  options,
}: LibraryDownloadRequest): Promise<DownloadOutcome> {
  const ctx = await openDownloadContextForLibrary(libraryId);
  return downloadContextFile(ctx, relativePath, onProgress, options);
}

/**
 * Downloads a file for an already opened sync context and records its local state.
 */
export async function downloadContextFile(
  ctx: SyncTargetContext,
  relativePath: string,
  onProgress?: DownloadProgressHandler,
  options: BackgroundDownloadOptions = {},
): Promise<DownloadOutcome> {
  const outcome = await downloadCacheFileDirectWithProgress(
    ctx.backend,
    ctx.libraryCacheDirUri,
    relativePath,
    onProgress,
    options,
  );
  await commitDownloadOutcome(ctx, relativePath, outcome);
  return outcome;
}

/**
 * Replays completion side effects for a native task that already wrote its file.
 */
export async function finalizeRecoveredDownload(
  libraryId: string,
  relativePath: string,
  onProgress?: DownloadProgressHandler,
): Promise<DownloadOutcome> {
  const ctx = await openDownloadContextForLibrary(libraryId);
  const outcome = readCachedDownloadOutcome(ctx, relativePath);
  onProgress?.(outcome.size, outcome.size);
  await commitDownloadOutcome(ctx, relativePath, outcome);
  return outcome;
}

/**
 * Persists the file_state row shared by normal and recovered downloads.
 */
export async function commitDownloadOutcome(
  ctx: SyncTargetContext,
  relativePath: string,
  outcome: DownloadOutcome,
): Promise<void> {
  console.info("Start to save file state after download, params:", {
    libraryId: ctx.libraryId,
    dataSourceId: ctx.dataSourceId,
    relativePath,
    localState: "present",
    size: outcome.size,
  });
  await upsertFileState(
    { dataSourceId: ctx.dataSourceId, libraryId: ctx.libraryId },
    relativePath,
    {
      localState: "present",
      localBlake3: outcome.blake3,
      localSize: outcome.size,
      localMtime: outcome.mtimeMs,
    },
  );
}

/**
 * Reads the bytes metadata expected after a recovered native task reaches DONE.
 */
function readCachedDownloadOutcome(ctx: SyncTargetContext, relativePath: string): DownloadOutcome {
  const file = new File(localFileUriFor(ctx.libraryCacheDirUri, relativePath));
  if (!file.exists) {
    throw new DataIntegrityError(`原生下载已完成，但缓存文件不存在: ${relativePath}`);
  }
  return {
    blake3: null,
    size: file.size ?? 0,
    mtimeMs: file.modificationTime ? file.modificationTime * 1000 : Date.now(),
  };
}
