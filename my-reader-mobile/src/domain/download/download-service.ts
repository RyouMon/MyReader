import i18n from "@/src/i18n"

import { AppInvariantError } from "../../errors"
import type { NativeDownloadOptions } from "../../services/download/native"
import { openSyncContext, type SyncTargetContext } from "../sync/context"
import {
  type BookDownloadIdentity,
  type DownloadOutcome,
  downloadFileDirectWithProgress,
  finalizeRecoveredFile,
} from "../sync/transfer"
import type { DataSource, Library } from "../types"

type BackgroundDownloadOptions = NativeDownloadOptions

export type DownloadProgressHandler = (received: number, total: number) => void

export type LibraryDownloadRequest = {
  libraryId: string
  relativePath: string
  libraries: Library[]
  dataSources: DataSource[]
  onProgress?: DownloadProgressHandler
  options?: BackgroundDownloadOptions
  identity?: BookDownloadIdentity
}

/**
 * Opens a sync context for a library by looking it up from the provided lists.
 */
export async function openDownloadContextForLibrary(
  libraryId: string,
  libraries: Library[],
  dataSources: DataSource[],
): Promise<SyncTargetContext> {
  const library = libraries.find((item) => item.id === libraryId)
  if (!library)
    throw new AppInvariantError(
      i18n.t("sync.libraryNotFound", { id: libraryId }),
    )
  return openSyncContext(library, dataSources)
}

/**
 * Downloads a cache file and commits the local `present` state in one place.
 */
export async function downloadLibraryFile({
  libraryId,
  relativePath,
  libraries,
  dataSources,
  onProgress,
  options,
  identity,
}: LibraryDownloadRequest): Promise<DownloadOutcome> {
  const ctx = await openDownloadContextForLibrary(
    libraryId,
    libraries,
    dataSources,
  )
  return downloadContextFile(ctx, relativePath, onProgress, options, identity)
}

/**
 * Downloads a file for an already opened sync context and records its local state.
 */
export async function downloadContextFile(
  ctx: SyncTargetContext,
  relativePath: string,
  onProgress?: DownloadProgressHandler,
  options: BackgroundDownloadOptions = {},
  identity?: BookDownloadIdentity,
): Promise<DownloadOutcome> {
  return downloadFileDirectWithProgress(
    ctx,
    relativePath,
    onProgress,
    options,
    identity,
  )
}

/**
 * Replays completion side effects for a native task that already wrote its file.
 */
export async function finalizeRecoveredDownload(
  libraryId: string,
  relativePath: string,
  libraries: Library[],
  dataSources: DataSource[],
  onProgress?: DownloadProgressHandler,
  identity?: BookDownloadIdentity,
): Promise<DownloadOutcome> {
  const ctx = await openDownloadContextForLibrary(
    libraryId,
    libraries,
    dataSources,
  )
  const outcome = await finalizeRecoveredFile(ctx, relativePath, identity)
  onProgress?.(outcome.size, outcome.size)
  return outcome
}
