import { requireNativeModule } from "expo"

export type NativeSyncLibrarySidecarReport = {
  pushed: number
  pulled: number
}

export type NativeSyncTaskProgress = {
  taskId: string
  stage: string
  completed: number
  total: number
}

export type NativeDownloadTask = {
  id: string
  libraryId: string
  bookId: string | null
  format: string | null
  relativePath: string
  label: string
  status: "queued" | "starting" | "downloading" | "done" | "error" | "cancelled"
  progress: number
  error: string | null
}

export type NativeEnqueuedDownloadTask = {
  task: NativeDownloadTask
  inserted: boolean
}

export type MyReaderRustComponentsModule = {
  coreContractVersion(): number
  invokeCoreSync(requestJson: string): string
  invokeCoreAsync(requestJson: string): Promise<string>
  migrateLibraryDatabase(databasePath: string): Promise<void>
  findActiveDownloadTask(
    libraryId: string,
    relativePath: string,
  ): NativeDownloadTask | null
  enqueueDownloadTask(
    id: string,
    libraryId: string,
    bookId: string | null,
    format: string | null,
    relativePath: string,
    label: string,
  ): NativeEnqueuedDownloadTask
  claimDownloadTasks(): NativeDownloadTask[]
  claimDownloadTask(taskId: string): NativeDownloadTask | null
  markDownloadTaskStarted(taskId: string): NativeDownloadTask | null
  reportDownloadTaskProgress(
    taskId: string,
    received: number,
    total: number,
  ): NativeDownloadTask | null
  completeDownloadTask(taskId: string): NativeDownloadTask | null
  failDownloadTask(taskId: string, error: string): NativeDownloadTask | null
  cancelDownloadTask(taskId: string): boolean
  listDownloadTasks(): NativeDownloadTask[]
  releaseDownloadTask(taskId: string): boolean
  clearFinishedDownloadTasks(): void
  syncContractVersion(): number
  createSyncCoordinator(coordinatorId: string): boolean
  requestCoordinatedSync(
    coordinatorId: string,
    libraryId: string,
    mode: string,
    reason: string,
    timing: string,
    nowMs: string,
  ): string
  flushCoordinatedSync(
    coordinatorId: string,
    libraryId: string,
    reason: string,
    nowMs: string,
  ): string
  recoverCoordinatedSync(
    coordinatorId: string,
    sidecarRootPath: string,
    libraryId: string,
    nowMs: string,
  ): Promise<string>
  requestCoordinatedPull(
    coordinatorId: string,
    sidecarRootPath: string,
    libraryId: string,
    reason: string,
    nowMs: string,
    freshnessMs: string,
  ): Promise<string>
  beginCoordinatedSync(
    coordinatorId: string,
    libraryId: string,
    generation: number,
  ): string
  effectiveCoordinatedSyncExecution(
    coordinatorId: string,
    sidecarRootPath: string,
    executionJson: string,
    nowMs: string,
    freshnessMs: string,
  ): Promise<string | null>
  completeCoordinatedSync(
    coordinatorId: string,
    libraryId: string,
    nowMs: string,
  ): string
  failCoordinatedSync(
    coordinatorId: string,
    sidecarRootPath: string,
    executionJson: string,
    failureKind: string,
    reason: string,
    nowMs: string,
    randomFraction: number,
  ): Promise<string>
  setCoordinatedSyncLibraryOnline(
    coordinatorId: string,
    libraryId: string,
    online: boolean,
    nowMs: string,
  ): string
  disposeSyncCoordinator(coordinatorId: string): string
  readSyncTaskProgress(taskId: string): NativeSyncTaskProgress | null
  cancelSyncTask(taskId: string): boolean
  releaseSyncTask(taskId: string): boolean
  syncLibrarySidecar(
    taskId: string,
    sidecarRootPath: string,
    libraryRootPath: string,
    nowMs: string,
    mode: string,
    storageJson: string,
  ): Promise<NativeSyncLibrarySidecarReport>
}

let nativeModule: MyReaderRustComponentsModule | null = null

function getNativeModule(): MyReaderRustComponentsModule {
  nativeModule ??= requireNativeModule<MyReaderRustComponentsModule>(
    "MyReaderRustComponents",
  )
  return nativeModule
}

const moduleFacade: MyReaderRustComponentsModule = {
  coreContractVersion() {
    return getNativeModule().coreContractVersion()
  },
  invokeCoreSync(requestJson) {
    return getNativeModule().invokeCoreSync(requestJson)
  },
  invokeCoreAsync(requestJson) {
    return getNativeModule().invokeCoreAsync(requestJson)
  },
  migrateLibraryDatabase(databasePath) {
    return getNativeModule().migrateLibraryDatabase(databasePath)
  },
  findActiveDownloadTask(libraryId, relativePath) {
    return getNativeModule().findActiveDownloadTask(libraryId, relativePath)
  },
  enqueueDownloadTask(id, libraryId, bookId, format, relativePath, label) {
    return getNativeModule().enqueueDownloadTask(
      id,
      libraryId,
      bookId,
      format,
      relativePath,
      label,
    )
  },
  claimDownloadTasks() {
    return getNativeModule().claimDownloadTasks()
  },
  claimDownloadTask(taskId) {
    return getNativeModule().claimDownloadTask(taskId)
  },
  markDownloadTaskStarted(taskId) {
    return getNativeModule().markDownloadTaskStarted(taskId)
  },
  reportDownloadTaskProgress(taskId, received, total) {
    return getNativeModule().reportDownloadTaskProgress(taskId, received, total)
  },
  completeDownloadTask(taskId) {
    return getNativeModule().completeDownloadTask(taskId)
  },
  failDownloadTask(taskId, error) {
    return getNativeModule().failDownloadTask(taskId, error)
  },
  cancelDownloadTask(taskId) {
    return getNativeModule().cancelDownloadTask(taskId)
  },
  listDownloadTasks() {
    return getNativeModule().listDownloadTasks()
  },
  releaseDownloadTask(taskId) {
    return getNativeModule().releaseDownloadTask(taskId)
  },
  clearFinishedDownloadTasks() {
    return getNativeModule().clearFinishedDownloadTasks()
  },
  syncContractVersion() {
    return getNativeModule().syncContractVersion()
  },
  createSyncCoordinator(coordinatorId) {
    return getNativeModule().createSyncCoordinator(coordinatorId)
  },
  requestCoordinatedSync(
    coordinatorId,
    libraryId,
    mode,
    reason,
    timing,
    nowMs,
  ) {
    return getNativeModule().requestCoordinatedSync(
      coordinatorId,
      libraryId,
      mode,
      reason,
      timing,
      nowMs,
    )
  },
  flushCoordinatedSync(coordinatorId, libraryId, reason, nowMs) {
    return getNativeModule().flushCoordinatedSync(
      coordinatorId,
      libraryId,
      reason,
      nowMs,
    )
  },
  recoverCoordinatedSync(coordinatorId, sidecarRootPath, libraryId, nowMs) {
    return getNativeModule().recoverCoordinatedSync(
      coordinatorId,
      sidecarRootPath,
      libraryId,
      nowMs,
    )
  },
  requestCoordinatedPull(
    coordinatorId,
    sidecarRootPath,
    libraryId,
    reason,
    nowMs,
    freshnessMs,
  ) {
    return getNativeModule().requestCoordinatedPull(
      coordinatorId,
      sidecarRootPath,
      libraryId,
      reason,
      nowMs,
      freshnessMs,
    )
  },
  beginCoordinatedSync(coordinatorId, libraryId, generation) {
    return getNativeModule().beginCoordinatedSync(
      coordinatorId,
      libraryId,
      generation,
    )
  },
  effectiveCoordinatedSyncExecution(
    coordinatorId,
    sidecarRootPath,
    executionJson,
    nowMs,
    freshnessMs,
  ) {
    return getNativeModule().effectiveCoordinatedSyncExecution(
      coordinatorId,
      sidecarRootPath,
      executionJson,
      nowMs,
      freshnessMs,
    )
  },
  completeCoordinatedSync(coordinatorId, libraryId, nowMs) {
    return getNativeModule().completeCoordinatedSync(
      coordinatorId,
      libraryId,
      nowMs,
    )
  },
  failCoordinatedSync(
    coordinatorId,
    sidecarRootPath,
    executionJson,
    failureKind,
    reason,
    nowMs,
    randomFraction,
  ) {
    return getNativeModule().failCoordinatedSync(
      coordinatorId,
      sidecarRootPath,
      executionJson,
      failureKind,
      reason,
      nowMs,
      randomFraction,
    )
  },
  setCoordinatedSyncLibraryOnline(coordinatorId, libraryId, online, nowMs) {
    return getNativeModule().setCoordinatedSyncLibraryOnline(
      coordinatorId,
      libraryId,
      online,
      nowMs,
    )
  },
  disposeSyncCoordinator(coordinatorId) {
    return getNativeModule().disposeSyncCoordinator(coordinatorId)
  },
  readSyncTaskProgress(taskId) {
    return getNativeModule().readSyncTaskProgress(taskId)
  },
  cancelSyncTask(taskId) {
    return getNativeModule().cancelSyncTask(taskId)
  },
  releaseSyncTask(taskId) {
    return getNativeModule().releaseSyncTask(taskId)
  },
  syncLibrarySidecar(
    taskId,
    sidecarRootPath,
    libraryRootPath,
    nowMs,
    mode,
    storageJson,
  ) {
    return getNativeModule().syncLibrarySidecar(
      taskId,
      sidecarRootPath,
      libraryRootPath,
      nowMs,
      mode,
      storageJson,
    )
  },
}

export default moduleFacade
