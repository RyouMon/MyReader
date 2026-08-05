import i18n from "@/src/i18n"
import { libraryTypeOf } from "@my-reader/tools/types/library"
import { libraryContainerRootUri } from "@/src/services/fs/library-paths"
import { AppInvariantError, DataIntegrityError } from "../../errors"
import {
  deleteFileState,
  finalizeDownloadedFile,
  installVerifiedDownloadedFile,
  markFileRemoteOnly,
  markFileSourceMissing,
} from "../../services/core/content"
import { getMyreaderBookContent } from "../../services/core/catalog"
import type { NativeDownloadOptions } from "../../services/download/native"
import { downloadRemoteToLocalUri } from "../../services/download/remote-to-local"
import { deleteFileAtUri } from "../../services/fs/file-io"
import { assertSafeRelativePath, fileUriFor } from "../../services/fs/path"
import type { Library } from "../types"
import { isRemoteSourceType } from "../types"
import type { SyncTargetContext } from "./context"
import { isRemoteBackend } from "./resolve"

export type DownloadOutcome = {
  sha256: string | null
  size: number
  mtimeMs: number
}

export type BookDownloadIdentity = {
  bookId: string
  format: string
}

type BackgroundDownloadOptions = NativeDownloadOptions

function localFileUri(ctx: SyncTargetContext, relativePath: string): string {
  assertSafeRelativePath(relativePath)
  return fileUriFor(ctx.libraryRootUri, relativePath)
}

function requireRemoteBackend(ctx: SyncTargetContext) {
  if (!isRemoteBackend(ctx.backend)) {
    throw new AppInvariantError(
      i18n.t("sync.nativeDownloadNotSupported", { kind: ctx.backend.kind }),
    )
  }
  return ctx.backend
}

async function removeLocalFile(fileUri: string): Promise<void> {
  await deleteFileAtUri(fileUri)
}

async function expectedManagedContent(
  ctx: SyncTargetContext,
  relativePath: string,
  identity?: BookDownloadIdentity,
) {
  if (libraryTypeOf(ctx.library) !== "myreader") return null
  if (!identity) {
    throw new AppInvariantError("MYREADER_BOOK_DOWNLOAD_IDENTITY_REQUIRED")
  }
  const bookId = Number(identity.bookId)
  if (!Number.isSafeInteger(bookId) || bookId <= 0) {
    throw new AppInvariantError("MYREADER_BOOK_ID_INVALID")
  }
  const content = await getMyreaderBookContent(
    ctx.libraryRootUri,
    ctx.librarySidecarRootUri,
    bookId,
    identity.format,
  )
  if (content.relativePath !== relativePath) {
    throw new DataIntegrityError("MYREADER_BOOK_FILE_PATH_MISMATCH")
  }
  return content
}

async function markMissingManagedSource(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<void> {
  await markFileSourceMissing(ctx.library, relativePath)
}

export async function downloadFileDirectWithProgress(
  ctx: SyncTargetContext,
  relativePath: string,
  onProgress?: (received: number, total: number) => void,
  options: BackgroundDownloadOptions = {},
  identity?: BookDownloadIdentity,
): Promise<DownloadOutcome> {
  const backend = requireRemoteBackend(ctx)
  const fileUri = localFileUri(ctx, relativePath)
  const expected = await expectedManagedContent(ctx, relativePath, identity)
  if (!expected) {
    await downloadRemoteToLocalUri(
      backend,
      relativePath,
      fileUri,
      onProgress,
      options,
    )
    const downloaded = await finalizeDownloadedFile(
      ctx.library,
      relativePath,
      fileUri,
    )
    return { ...downloaded, sha256: downloaded.sha256 ?? null }
  }

  const remoteStat = await backend.statRemoteFile(relativePath)
  if (!remoteStat) {
    await markMissingManagedSource(ctx, relativePath)
    throw new DataIntegrityError(`REMOTE_BOOK_FILE_NOT_FOUND: ${relativePath}`)
  }
  if (remoteStat.size !== expected.size) {
    throw new DataIntegrityError("REMOTE_BOOK_FILE_SIZE_MISMATCH")
  }

  const partialUri = `${fileUri}.part`
  try {
    await downloadRemoteToLocalUri(
      backend,
      relativePath,
      partialUri,
      onProgress,
      options,
    )
    return await installVerifiedDownloadedFile(
      ctx.library,
      relativePath,
      partialUri,
      fileUri,
      expected.size,
      expected.sha256,
    )
  } catch (error) {
    await removeLocalFile(partialUri)
    try {
      if ((await backend.statRemoteFile(relativePath)) === null) {
        await markMissingManagedSource(ctx, relativePath)
      }
    } catch {
      // Preserve the original transfer error when the follow-up stat also fails.
    }
    throw error
  }
}

export async function finalizeRecoveredFile(
  ctx: SyncTargetContext,
  relativePath: string,
  identity?: BookDownloadIdentity,
): Promise<DownloadOutcome> {
  const fileUri = localFileUri(ctx, relativePath)
  const expected = await expectedManagedContent(ctx, relativePath, identity)
  if (!expected) {
    const downloaded = await finalizeDownloadedFile(
      ctx.library,
      relativePath,
      fileUri,
    )
    return { ...downloaded, sha256: downloaded.sha256 ?? null }
  }
  return installVerifiedDownloadedFile(
    ctx.library,
    relativePath,
    `${fileUri}.part`,
    fileUri,
    expected.size,
    expected.sha256,
  )
}

export async function evictLocalFile(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<void> {
  await removeLocalFile(localFileUri(ctx, relativePath))
  await markFileRemoteOnly(ctx.library, relativePath)
}

export async function evictLocalFileOfflineSafe(
  library: Library,
  relativePath: string,
): Promise<void> {
  if (!isRemoteSourceType(library.sourceType)) return
  assertSafeRelativePath(relativePath)
  const fileUri = fileUriFor(libraryContainerRootUri(library.id), relativePath)
  await removeLocalFile(fileUri)
  await markFileRemoteOnly(library, relativePath)
}

export async function deleteFileEverywhere(
  ctx: SyncTargetContext,
  relativePath: string,
): Promise<void> {
  assertSafeRelativePath(relativePath)
  await removeLocalFile(localFileUri(ctx, relativePath))
  await ctx.backend.deleteRemote(relativePath)
  await deleteFileState(ctx.library, relativePath)
}
