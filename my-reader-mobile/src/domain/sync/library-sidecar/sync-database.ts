import type { Library } from "@my-reader/tools/types/library"

import MyReaderRustComponents, {
  type NativeSyncTaskProgress,
} from "@/modules/myreader-rust-components"
import {
  libraryRootUri,
  librarySidecarRootUri,
} from "@/src/services/fs/library-paths"
import { toNativeFilesystemPath } from "@/src/services/fs/path"
import type { NativeSidecarStorageConfig } from "../resolve"

export type LibrarySidecarSyncProgress = NativeSyncTaskProgress & {
  libraryId: string
}

const progressListeners = new Set<
  (progress: LibrarySidecarSyncProgress) => void
>()
let nextTaskSequence = 0

export function subscribeLibrarySidecarSyncProgress(
  listener: (progress: LibrarySidecarSyncProgress) => void,
): () => void {
  progressListeners.add(listener)
  return () => progressListeners.delete(listener)
}

export function createLibrarySidecarSyncTaskId(libraryId: string): string {
  nextTaskSequence += 1
  return `${libraryId}:${Date.now()}:${nextTaskSequence}`
}

export function cancelLibrarySidecarSyncTask(taskId: string): boolean {
  return MyReaderRustComponents.cancelSyncTask(taskId)
}

function emitProgress(
  libraryId: string,
  progress: NativeSyncTaskProgress,
  listener?: (progress: LibrarySidecarSyncProgress) => void,
): void {
  const event = { ...progress, libraryId }
  listener?.(event)
  for (const subscribed of progressListeners) subscribed(event)
}

export async function syncLibrarySidecarDatabase(
  library: Library,
  nowMs: number,
  mode: "push_only" | "full",
  storage: NativeSidecarStorageConfig,
  task?: {
    taskId?: string
    onProgress?: (progress: LibrarySidecarSyncProgress) => void
  },
): Promise<{ pushed: number; pulled: number }> {
  const taskId = task?.taskId ?? createLibrarySidecarSyncTaskId(library.id)
  let previousProgress = ""
  const publishProgress = () => {
    const progress = MyReaderRustComponents.readSyncTaskProgress(taskId)
    const serialized = progress ? JSON.stringify(progress) : ""
    if (progress && serialized !== previousProgress) {
      previousProgress = serialized
      emitProgress(library.id, progress, task?.onProgress)
    }
  }
  const sync = MyReaderRustComponents.syncLibrarySidecar(
    taskId,
    toNativeFilesystemPath(librarySidecarRootUri(library)),
    toNativeFilesystemPath(libraryRootUri(library)),
    String(nowMs),
    mode,
    JSON.stringify(storage),
  )
  const progressTimer = setInterval(publishProgress, 100)
  try {
    return await sync
  } finally {
    clearInterval(progressTimer)
    publishProgress()
    MyReaderRustComponents.releaseSyncTask(taskId)
  }
}
