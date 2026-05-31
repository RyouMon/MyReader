import { assertSafeRelativePath, fileUriFor } from "../../services/fs/path";
import { libraryRootUri } from "../library/locations";
import { deleteFileAtUri } from "../../services/fs/file-io";
import { clearExtractedReaderCachesForArchiveUri } from "../../services/fs/cache";
import { downloadRemoteToLocalUri } from "../../services/download/remote-to-local";
import { deleteFileState, upsertFileState } from "../../repos/file_state";
import { AppInvariantError } from "../../errors";
import type { Library } from "../types";
import type { SyncTargetContext } from "./context";
import { isRemoteBackend } from "./resolve";
import i18n from "@/src/i18n";
import type { NativeDownloadOptions } from "../../services/download/native";

export type DownloadOutcome = {
  blake3: string | null;
  size: number;
  mtimeMs: number;
};

type BackgroundDownloadOptions = NativeDownloadOptions;

function toDownloadOutcome(stat: { size: number; mtimeMs: number }): DownloadOutcome {
  return { blake3: null, size: stat.size, mtimeMs: stat.mtimeMs };
}

function localFileUri(ctx: SyncTargetContext, relativePath: string): string {
  assertSafeRelativePath(relativePath);
  return fileUriFor(ctx.libraryRootUri, relativePath);
}

function requireRemoteBackend(ctx: SyncTargetContext) {
  if (!isRemoteBackend(ctx.backend)) {
    throw new AppInvariantError(i18n.t("sync.nativeDownloadNotSupported", { kind: ctx.backend.kind }));
  }
  return ctx.backend;
}

async function removeLocalFile(fileUri: string): Promise<void> {
  await deleteFileAtUri(fileUri);
  await clearExtractedReaderCachesForArchiveUri(fileUri);
}

export async function downloadFileDirect(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<DownloadOutcome> {
  const stat = await downloadRemoteToLocalUri(
    requireRemoteBackend(ctx),
    relativePath,
    localFileUri(ctx, relativePath),
  );
  const outcome = toDownloadOutcome(stat);
  await upsertFileState(ctx.library, relativePath, {
    localState: "present",
    localBlake3: outcome.blake3,
    localSize: outcome.size,
    localMtime: outcome.mtimeMs,
  });
  return outcome;
}

export async function downloadFileDirectWithProgress(
  ctx: SyncTargetContext,
  relativePath: string,
  onProgress?: (received: number, total: number) => void,
  options: BackgroundDownloadOptions = {},
): Promise<DownloadOutcome> {
  const stat = await downloadRemoteToLocalUri(
    requireRemoteBackend(ctx),
    relativePath,
    localFileUri(ctx, relativePath),
    onProgress,
    options,
  );
  const outcome = toDownloadOutcome(stat);
  await upsertFileState(ctx.library, relativePath, {
    localState: "present",
    localBlake3: outcome.blake3,
    localSize: outcome.size,
    localMtime: outcome.mtimeMs,
  });
  return outcome;
}

export async function evictLocalFile(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<void> {
  await removeLocalFile(localFileUri(ctx, relativePath));
  await upsertFileState(ctx.library, relativePath, {
    localState: "remote_only",
    localBlake3: null,
    localSize: null,
    localMtime: null,
  });
}

export async function evictLocalFileOfflineSafe(
  library: Library,
  relativePath: string,
): Promise<void> {
  assertSafeRelativePath(relativePath);
  const fileUri = fileUriFor(libraryRootUri(library), relativePath);
  await removeLocalFile(fileUri);
  await upsertFileState(library, relativePath, {
    localState: "remote_only",
    localBlake3: null,
    localSize: null,
    localMtime: null,
  });
}

export async function deleteFileEverywhere(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<void> {
  assertSafeRelativePath(relativePath);
  await removeLocalFile(localFileUri(ctx, relativePath));
  await ctx.backend.deleteRemote(relativePath);
  await deleteFileState(ctx.library, relativePath);
}
