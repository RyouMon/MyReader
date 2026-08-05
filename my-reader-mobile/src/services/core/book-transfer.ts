import {
  bookTransferReadTaskProgress,
  bookTransferReleaseTask,
  bookTransferRunPendingUploads,
  CoreFfiError,
  type BookUploadTaskProgress,
} from "my-reader-core"
import type { Library } from "@my-reader/tools/types/library"

import { DataIntegrityError } from "@/src/errors"
import { librarySidecarRootUri } from "@/src/services/fs/library-paths"
import { toNativeFilesystemPath } from "@/src/services/fs/path"
import {
  toCoreLibraryStorage,
  type LibraryStorageConfig,
} from "@/src/services/core/sync"

let nextTaskSequence = 0

function createBookUploadTaskId(libraryId: string): string {
  nextTaskSequence += 1
  return `book-upload:${libraryId}:${Date.now()}:${nextTaskSequence}`
}

export async function runPendingBookUploads(input: {
  library: Library
  libraryRootUri: string
  storage: LibraryStorageConfig
  onProgress?: (progress: BookUploadTaskProgress) => void
}): Promise<string[]> {
  const taskId = createBookUploadTaskId(input.library.id)
  const publishProgress = () => {
    const progress = bookTransferReadTaskProgress(taskId)
    if (progress) input.onProgress?.(progress)
  }
  const upload = bookTransferRunPendingUploads(
    taskId,
    toNativeFilesystemPath(librarySidecarRootUri(input.library)),
    toNativeFilesystemPath(input.libraryRootUri),
    toCoreLibraryStorage(input.storage),
  )
  const progressTimer = setInterval(publishProgress, 100)
  try {
    const completed = await upload
    publishProgress()
    return completed
  } catch (error) {
    if (CoreFfiError.DataIntegrity.instanceOf(error)) {
      throw new DataIntegrityError(error.message)
    }
    throw error
  } finally {
    clearInterval(progressTimer)
    bookTransferReleaseTask(taskId)
  }
}

export type { BookUploadTaskProgress }
