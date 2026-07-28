import MyReaderRustComponents, {
  type NativeDownloadTask,
  type NativeEnqueuedDownloadTask,
} from "@/modules/myreader-rust-components"

export type CoreDownloadTask = NativeDownloadTask

export function findActiveDownloadTask(
  libraryId: string,
  relativePath: string,
): CoreDownloadTask | null {
  return MyReaderRustComponents.findActiveDownloadTask(libraryId, relativePath)
}

export function enqueueDownloadTask(input: {
  id: string
  libraryId: string
  bookId?: string
  format?: string
  relativePath: string
  label: string
}): NativeEnqueuedDownloadTask {
  return MyReaderRustComponents.enqueueDownloadTask(
    input.id,
    input.libraryId,
    input.bookId ?? null,
    input.format ?? null,
    input.relativePath,
    input.label,
  )
}

export function claimDownloadTasks(): CoreDownloadTask[] {
  return MyReaderRustComponents.claimDownloadTasks()
}

export function claimDownloadTask(taskId: string): CoreDownloadTask | null {
  return MyReaderRustComponents.claimDownloadTask(taskId)
}

export function markDownloadTaskStarted(
  taskId: string,
): CoreDownloadTask | null {
  return MyReaderRustComponents.markDownloadTaskStarted(taskId)
}

export function reportDownloadTaskProgress(
  taskId: string,
  received: number,
  total: number,
): CoreDownloadTask | null {
  return MyReaderRustComponents.reportDownloadTaskProgress(
    taskId,
    received,
    total,
  )
}

export function completeDownloadTask(taskId: string): CoreDownloadTask | null {
  return MyReaderRustComponents.completeDownloadTask(taskId)
}

export function failDownloadTask(
  taskId: string,
  error: string,
): CoreDownloadTask | null {
  return MyReaderRustComponents.failDownloadTask(taskId, error)
}

export function cancelDownloadTask(taskId: string): boolean {
  return MyReaderRustComponents.cancelDownloadTask(taskId)
}

export function listDownloadTasks(): CoreDownloadTask[] {
  return MyReaderRustComponents.listDownloadTasks()
}

export function releaseDownloadTask(taskId: string): boolean {
  return MyReaderRustComponents.releaseDownloadTask(taskId)
}

export function clearFinishedDownloadTasks(): void {
  MyReaderRustComponents.clearFinishedDownloadTasks()
}
