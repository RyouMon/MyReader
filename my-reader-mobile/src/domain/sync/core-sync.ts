import type { Library } from "@my-reader/tools/types/library"

import { appConfigPath } from "@/src/services/core/app-config"
import {
  cancelSyncTask,
  type LibraryStorageConfig,
  readSyncTaskProgress,
  readSyncTaskSidecarReport,
  releaseSyncTask,
  syncLibraryData,
  type LibrarySyncReport,
  type LibrarySyncScope,
  type SidecarSyncMode,
  type SidecarSyncReport,
  type SyncTaskProgress,
} from "@/src/services/core/sync"
import { librarySidecarRootUri } from "@/src/services/fs/library-paths"
import { toNativeFilesystemPath } from "@/src/services/fs/path"

let nextTaskSequence = 0

export function createLibrarySyncTaskId(libraryId: string): string {
  nextTaskSequence += 1
  return `${libraryId}:${Date.now()}:${nextTaskSequence}`
}

export function cancelLibrarySyncTask(taskId: string): boolean {
  return cancelSyncTask(taskId)
}

export async function runCoreLibrarySync(input: {
  library: Library
  libraryRootUri: string
  nowMs: number
  scope: LibrarySyncScope
  forceCalibre: boolean
  mode: SidecarSyncMode
  storage: LibraryStorageConfig
  taskId?: string
  onProgress?: (progress: SyncTaskProgress) => void
  onSidecarComplete?: (report: SidecarSyncReport) => void
}): Promise<LibrarySyncReport> {
  const taskId = input.taskId ?? createLibrarySyncTaskId(input.library.id)
  let sidecarPublished = false
  let lastProgressSignature: string | null = null
  const publishProgress = () => {
    const progress = readSyncTaskProgress(taskId)
    if (!progress) return
    const signature = `${progress.stage}:${progress.completed}:${progress.total}`
    if (signature === lastProgressSignature) return
    lastProgressSignature = signature
    input.onProgress?.(progress)
  }
  const publishSidecarResult = () => {
    if (sidecarPublished) return
    const report = readSyncTaskSidecarReport(taskId)
    if (!report) return
    sidecarPublished = true
    input.onSidecarComplete?.(report)
  }
  const sync = syncLibraryData({
    taskId,
    configPath: appConfigPath,
    sidecarRootPath: toNativeFilesystemPath(
      librarySidecarRootUri(input.library),
    ),
    libraryRootPath: toNativeFilesystemPath(input.libraryRootUri),
    libraryId: input.library.id,
    nowMs: input.nowMs,
    scope: input.scope,
    forceCalibre: input.forceCalibre,
    mode: input.mode,
    storage: input.storage,
  })
  const resultTimer = setInterval(() => {
    publishProgress()
    publishSidecarResult()
  }, 100)
  try {
    const report = await sync
    publishProgress()
    publishSidecarResult()
    return report
  } finally {
    clearInterval(resultTimer)
    publishProgress()
    releaseSyncTask(taskId)
  }
}
