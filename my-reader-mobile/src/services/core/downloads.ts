import {
  downloadCancel,
  downloadClaim,
  downloadClaimReady,
  downloadClearFinished,
  downloadComplete,
  downloadEnqueue,
  downloadFail,
  downloadFindActive,
  downloadList,
  downloadMarkStarted,
  downloadRelease,
  downloadReportProgress,
  type DownloadTask as NativeDownloadTask,
  type EnqueuedDownloadTask as NativeEnqueuedDownloadTask,
} from "my-reader-core"

export type CoreDownloadTask = Omit<
  NativeDownloadTask,
  "bookId" | "format" | "error"
> & {
  bookId: string | null
  format: string | null
  error: string | null
}

export type EnqueuedDownloadTask = Omit<NativeEnqueuedDownloadTask, "task"> & {
  task: CoreDownloadTask
}

function taskFromCore(task: NativeDownloadTask): CoreDownloadTask {
  return {
    ...task,
    bookId: task.bookId ?? null,
    format: task.format ?? null,
    error: task.error ?? null,
  }
}

export function findActiveDownloadTask(
  libraryId: string,
  relativePath: string,
): CoreDownloadTask | null {
  const task = downloadFindActive(libraryId, relativePath)
  return task ? taskFromCore(task) : null
}

export function enqueueDownloadTask(input: {
  id: string
  libraryId: string
  bookId?: string
  format?: string
  relativePath: string
  label: string
}): EnqueuedDownloadTask {
  const result = downloadEnqueue(
    input.id,
    input.libraryId,
    input.bookId,
    input.format,
    input.relativePath,
    input.label,
  )
  return { ...result, task: taskFromCore(result.task) }
}

export function claimDownloadTasks(): CoreDownloadTask[] {
  return downloadClaimReady().map(taskFromCore)
}

export function claimDownloadTask(taskId: string): CoreDownloadTask | null {
  const task = downloadClaim(taskId)
  return task ? taskFromCore(task) : null
}

export function markDownloadTaskStarted(
  taskId: string,
): CoreDownloadTask | null {
  const task = downloadMarkStarted(taskId)
  return task ? taskFromCore(task) : null
}

export function reportDownloadTaskProgress(
  taskId: string,
  received: number,
  total: number,
): CoreDownloadTask | null {
  const task = downloadReportProgress(taskId, received, total)
  return task ? taskFromCore(task) : null
}

export function completeDownloadTask(taskId: string): CoreDownloadTask | null {
  const task = downloadComplete(taskId)
  return task ? taskFromCore(task) : null
}

export function failDownloadTask(
  taskId: string,
  error: string,
): CoreDownloadTask | null {
  const task = downloadFail(taskId, error)
  return task ? taskFromCore(task) : null
}

export function cancelDownloadTask(taskId: string): boolean {
  return downloadCancel(taskId)
}

export function listDownloadTasks(): CoreDownloadTask[] {
  return downloadList().map(taskFromCore)
}

export function releaseDownloadTask(taskId: string): boolean {
  return downloadRelease(taskId)
}

export function clearFinishedDownloadTasks(): void {
  downloadClearFinished()
}
