import type { DownloadTask, EnqueuedDownloadTask } from "./contract.generated"
import { invokeCoreSync } from "./transport"

export type CoreDownloadTask = DownloadTask

export function findActiveDownloadTask(
  libraryId: string,
  relativePath: string,
): CoreDownloadTask | null {
  return invokeCoreSync("download", "findActive", {
    libraryId,
    relativePath,
  })
}

export function enqueueDownloadTask(input: {
  id: string
  libraryId: string
  bookId?: string
  format?: string
  relativePath: string
  label: string
}): EnqueuedDownloadTask {
  return invokeCoreSync("download", "enqueue", {
    ...input,
    bookId: input.bookId ?? null,
    format: input.format ?? null,
  })
}

export function claimDownloadTasks(): CoreDownloadTask[] {
  return invokeCoreSync("download", "claimReady", undefined)
}

export function claimDownloadTask(taskId: string): CoreDownloadTask | null {
  return invokeCoreSync("download", "claim", { taskId })
}

export function markDownloadTaskStarted(
  taskId: string,
): CoreDownloadTask | null {
  return invokeCoreSync("download", "markStarted", { taskId })
}

export function reportDownloadTaskProgress(
  taskId: string,
  received: number,
  total: number,
): CoreDownloadTask | null {
  return invokeCoreSync("download", "reportProgress", {
    taskId,
    received,
    total,
  })
}

export function completeDownloadTask(taskId: string): CoreDownloadTask | null {
  return invokeCoreSync("download", "complete", { taskId })
}

export function failDownloadTask(
  taskId: string,
  error: string,
): CoreDownloadTask | null {
  return invokeCoreSync("download", "fail", { taskId, error })
}

export function cancelDownloadTask(taskId: string): boolean {
  return invokeCoreSync("download", "cancel", { taskId })
}

export function listDownloadTasks(): CoreDownloadTask[] {
  return invokeCoreSync("download", "list", undefined)
}

export function releaseDownloadTask(taskId: string): boolean {
  return invokeCoreSync("download", "release", { taskId })
}

export function clearFinishedDownloadTasks(): void {
  invokeCoreSync("download", "clearFinished", undefined)
}
