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

export type NativeFileState = {
  id: string
  path: string
  localState: "present" | "remote_only" | "local_only" | "dirty_push"
  localBlake3: string | null
  localSize: number | null
  localMtime: number | null
  updatedAt: number
}

export type NativeFileStateUpdate = {
  localState: NativeFileState["localState"]
  localBlake3: string | null
  localSize: number | null
  localMtime: number | null
}

export type NativeDownloadedFile = {
  size: number
  mtimeMs: number
}

export type NativeBookCoverThumbnailCache = {
  id: string
  bookId: number
  coverIdentity: string
  thumbnailVersion: string
  widthPx: number
  heightPx: number
  fileName: string
  fileSizeBytes: number
  createdAt: number
  updatedAt: number
}

export type NativeBookCoverThumbnailCachePatch = {
  bookId: number
  coverIdentity: string
  thumbnailVersion: string
  widthPx: number
  heightPx: number
  fileName: string
  fileSizeBytes: number
}

export type NativeReadingPosition = {
  bookId: number
  format: string
  locatorJson: string
  displayProgression: number | null
  updatedAt: number
  conflictCount: number
}

export type NativeReadingPositionCandidate = {
  operationId: string
  locatorJson: string
  displayProgression: number | null
  recordedAt: number
  replicaId: string
}

export type NativeReaderBookmark = {
  id: string
  bookId: number
  format: string
  locatorKey: string
  locatorJson: string
  createdAt: number
  updatedAt: number
}

export type NativeReaderAnnotation = {
  id: string
  bookId: number
  format: string
  kind: string
  locatorJson: string
  color: string
  note: string | null
  createdAt: number
  updatedAt: number
}

export type NativeReadingStatistics = {
  days: Record<string, number>
  totalDurationSeconds: number
  longestStreakDays: number
  completedBooks: number
}

type NativeReadingSessionIntervalInput = {
  sidecarRootPath: string
  libraryRootPath: string
  id: string
  bookId: number
  format: string
  localDay: string
  startedAtMs: number
  durationSeconds: number
  recordedAtMs: number
}

export type MyReaderRustComponentsModule = {
  coreContractVersion(): number
  invokeCoreSync(requestJson: string): string
  invokeCoreAsync(requestJson: string): Promise<string>
  migrateLibraryDatabase(databasePath: string): Promise<void>
  listBookReadingFormats(
    sidecarRootPath: string,
    libraryRootPath: string,
  ): Promise<Record<string, string>>
  setBookReadingFormat(
    sidecarRootPath: string,
    libraryRootPath: string,
    bookId: number,
    format: string | null,
  ): Promise<void>
  getLibraryFileState(
    sidecarRootPath: string,
    path: string,
  ): Promise<NativeFileState | null>
  listLibraryFileStates(sidecarRootPath: string): Promise<NativeFileState[]>
  upsertLibraryFileState(
    sidecarRootPath: string,
    path: string,
    update: NativeFileStateUpdate,
  ): Promise<void>
  deleteLibraryFileState(sidecarRootPath: string, path: string): Promise<void>
  finalizeDownloadedFile(
    sidecarRootPath: string,
    relativePath: string,
    localPath: string,
  ): Promise<NativeDownloadedFile>
  markLibraryFileRemoteOnly(
    sidecarRootPath: string,
    relativePath: string,
  ): Promise<void>
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
  listBookCoverThumbnailCache(
    sidecarRootPath: string,
    thumbnailVersion: string,
    widthPx: number,
    heightPx: number,
  ): Promise<NativeBookCoverThumbnailCache[]>
  upsertBookCoverThumbnailCache(
    sidecarRootPath: string,
    patch: NativeBookCoverThumbnailCachePatch,
  ): Promise<void>
  deleteBookCoverThumbnailCache(
    sidecarRootPath: string,
    bookId: number,
    thumbnailVersion: string,
    widthPx: number,
    heightPx: number,
  ): Promise<void>
  clearBookCoverThumbnailCache(sidecarRootPath: string): Promise<void>
  listFavoriteBookIds(sidecarRootPath: string): Promise<number[]>
  setFavoriteBook(
    sidecarRootPath: string,
    libraryRootPath: string,
    bookId: number,
    isFavorite: boolean,
    recordedAtMs: number,
  ): Promise<void>
  getReadingPosition(
    sidecarRootPath: string,
    bookId: number,
    format: string,
  ): Promise<NativeReadingPosition | null>
  listReadingPositions(
    sidecarRootPath: string,
  ): Promise<NativeReadingPosition[]>
  setReadingPosition(
    sidecarRootPath: string,
    libraryRootPath: string,
    bookId: number,
    format: string,
    locatorJson: string,
    displayProgression: number | null,
    recordedAtMs: number,
  ): Promise<void>
  listReadingPositionCandidates(
    sidecarRootPath: string,
    libraryRootPath: string,
    bookId: number,
    format: string,
    nowMs: number,
  ): Promise<NativeReadingPositionCandidate[]>
  selectReadingPositionCandidate(
    sidecarRootPath: string,
    libraryRootPath: string,
    bookId: number,
    format: string,
    operationId: string,
    recordedAtMs: number,
  ): Promise<void>
  listReaderBookmarks(
    sidecarRootPath: string,
    bookId: number,
    format: string,
  ): Promise<NativeReaderBookmark[]>
  addReaderBookmark(
    sidecarRootPath: string,
    libraryRootPath: string,
    bookId: number,
    format: string,
    locatorKey: string,
    locatorJson: string,
    recordedAtMs: number,
  ): Promise<NativeReaderBookmark>
  removeReaderBookmark(
    sidecarRootPath: string,
    libraryRootPath: string,
    bookId: number,
    format: string,
    locatorKey: string,
    recordedAtMs: number,
  ): Promise<void>
  listReaderAnnotations(
    sidecarRootPath: string,
    bookId: number,
    format: string,
  ): Promise<NativeReaderAnnotation[]>
  addReaderAnnotation(
    sidecarRootPath: string,
    libraryRootPath: string,
    bookId: number,
    format: string,
    locatorJson: string,
    color: string,
    note: string | null,
    recordedAtMs: number,
  ): Promise<NativeReaderAnnotation>
  updateReaderAnnotation(
    sidecarRootPath: string,
    libraryRootPath: string,
    bookId: number,
    format: string,
    id: string,
    color: string,
    note: string | null,
    recordedAtMs: number,
  ): Promise<NativeReaderAnnotation>
  removeReaderAnnotation(
    sidecarRootPath: string,
    libraryRootPath: string,
    bookId: number,
    format: string,
    id: string,
    recordedAtMs: number,
  ): Promise<void>
  addReadingSessionInterval(
    sidecarRootPath: string,
    libraryRootPath: string,
    id: string,
    bookId: number,
    format: string,
    localDay: string,
    startedAtMs: number,
    durationSeconds: number,
    recordedAtMs: number,
  ): Promise<void>
  addReadingCompletion(
    sidecarRootPath: string,
    libraryRootPath: string,
    id: string,
    bookId: number,
    format: string,
    localDay: string,
    completedAtMs: number,
    recordedAtMs: number,
  ): Promise<boolean>
  getReadingStatistics(
    sidecarRootPath: string,
    libraryRootPath: string,
    startDay: string,
    endDay: string,
  ): Promise<NativeReadingStatistics>
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

type NativeMyReaderRustComponentsModule = Omit<
  MyReaderRustComponentsModule,
  "addReadingSessionInterval"
> & {
  addReadingSessionInterval(
    input: NativeReadingSessionIntervalInput,
  ): Promise<void>
}

let nativeModule: NativeMyReaderRustComponentsModule | null = null

function getNativeModule(): NativeMyReaderRustComponentsModule {
  nativeModule ??= requireNativeModule<NativeMyReaderRustComponentsModule>(
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
  listBookReadingFormats(sidecarRootPath, libraryRootPath) {
    return getNativeModule().listBookReadingFormats(
      sidecarRootPath,
      libraryRootPath,
    )
  },
  setBookReadingFormat(sidecarRootPath, libraryRootPath, bookId, format) {
    return getNativeModule().setBookReadingFormat(
      sidecarRootPath,
      libraryRootPath,
      bookId,
      format,
    )
  },
  getLibraryFileState(sidecarRootPath, path) {
    return getNativeModule().getLibraryFileState(sidecarRootPath, path)
  },
  listLibraryFileStates(sidecarRootPath) {
    return getNativeModule().listLibraryFileStates(sidecarRootPath)
  },
  upsertLibraryFileState(sidecarRootPath, path, updateJson) {
    return getNativeModule().upsertLibraryFileState(
      sidecarRootPath,
      path,
      updateJson,
    )
  },
  deleteLibraryFileState(sidecarRootPath, path) {
    return getNativeModule().deleteLibraryFileState(sidecarRootPath, path)
  },
  finalizeDownloadedFile(sidecarRootPath, relativePath, localPath) {
    return getNativeModule().finalizeDownloadedFile(
      sidecarRootPath,
      relativePath,
      localPath,
    )
  },
  markLibraryFileRemoteOnly(sidecarRootPath, relativePath) {
    return getNativeModule().markLibraryFileRemoteOnly(
      sidecarRootPath,
      relativePath,
    )
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
  listBookCoverThumbnailCache(
    sidecarRootPath,
    thumbnailVersion,
    widthPx,
    heightPx,
  ) {
    return getNativeModule().listBookCoverThumbnailCache(
      sidecarRootPath,
      thumbnailVersion,
      widthPx,
      heightPx,
    )
  },
  upsertBookCoverThumbnailCache(sidecarRootPath, patchJson) {
    return getNativeModule().upsertBookCoverThumbnailCache(
      sidecarRootPath,
      patchJson,
    )
  },
  deleteBookCoverThumbnailCache(
    sidecarRootPath,
    bookId,
    thumbnailVersion,
    widthPx,
    heightPx,
  ) {
    return getNativeModule().deleteBookCoverThumbnailCache(
      sidecarRootPath,
      bookId,
      thumbnailVersion,
      widthPx,
      heightPx,
    )
  },
  clearBookCoverThumbnailCache(sidecarRootPath) {
    return getNativeModule().clearBookCoverThumbnailCache(sidecarRootPath)
  },
  listFavoriteBookIds(sidecarRootPath) {
    return getNativeModule().listFavoriteBookIds(sidecarRootPath)
  },
  setFavoriteBook(
    sidecarRootPath,
    libraryRootPath,
    bookId,
    isFavorite,
    recordedAtMs,
  ) {
    return getNativeModule().setFavoriteBook(
      sidecarRootPath,
      libraryRootPath,
      bookId,
      isFavorite,
      recordedAtMs,
    )
  },
  getReadingPosition(sidecarRootPath, bookId, format) {
    return getNativeModule().getReadingPosition(sidecarRootPath, bookId, format)
  },
  listReadingPositions(sidecarRootPath) {
    return getNativeModule().listReadingPositions(sidecarRootPath)
  },
  setReadingPosition(
    sidecarRootPath,
    libraryRootPath,
    bookId,
    format,
    locatorJson,
    displayProgression,
    recordedAtMs,
  ) {
    return getNativeModule().setReadingPosition(
      sidecarRootPath,
      libraryRootPath,
      bookId,
      format,
      locatorJson,
      displayProgression,
      recordedAtMs,
    )
  },
  listReadingPositionCandidates(
    sidecarRootPath,
    libraryRootPath,
    bookId,
    format,
    nowMs,
  ) {
    return getNativeModule().listReadingPositionCandidates(
      sidecarRootPath,
      libraryRootPath,
      bookId,
      format,
      nowMs,
    )
  },
  selectReadingPositionCandidate(
    sidecarRootPath,
    libraryRootPath,
    bookId,
    format,
    operationId,
    recordedAtMs,
  ) {
    return getNativeModule().selectReadingPositionCandidate(
      sidecarRootPath,
      libraryRootPath,
      bookId,
      format,
      operationId,
      recordedAtMs,
    )
  },
  listReaderBookmarks(sidecarRootPath, bookId, format) {
    return getNativeModule().listReaderBookmarks(
      sidecarRootPath,
      bookId,
      format,
    )
  },
  addReaderBookmark(
    sidecarRootPath,
    libraryRootPath,
    bookId,
    format,
    locatorKey,
    locatorJson,
    recordedAtMs,
  ) {
    return getNativeModule().addReaderBookmark(
      sidecarRootPath,
      libraryRootPath,
      bookId,
      format,
      locatorKey,
      locatorJson,
      recordedAtMs,
    )
  },
  removeReaderBookmark(
    sidecarRootPath,
    libraryRootPath,
    bookId,
    format,
    locatorKey,
    recordedAtMs,
  ) {
    return getNativeModule().removeReaderBookmark(
      sidecarRootPath,
      libraryRootPath,
      bookId,
      format,
      locatorKey,
      recordedAtMs,
    )
  },
  listReaderAnnotations(sidecarRootPath, bookId, format) {
    return getNativeModule().listReaderAnnotations(
      sidecarRootPath,
      bookId,
      format,
    )
  },
  addReaderAnnotation(
    sidecarRootPath,
    libraryRootPath,
    bookId,
    format,
    locatorJson,
    color,
    note,
    recordedAtMs,
  ) {
    return getNativeModule().addReaderAnnotation(
      sidecarRootPath,
      libraryRootPath,
      bookId,
      format,
      locatorJson,
      color,
      note,
      recordedAtMs,
    )
  },
  updateReaderAnnotation(
    sidecarRootPath,
    libraryRootPath,
    bookId,
    format,
    id,
    color,
    note,
    recordedAtMs,
  ) {
    return getNativeModule().updateReaderAnnotation(
      sidecarRootPath,
      libraryRootPath,
      bookId,
      format,
      id,
      color,
      note,
      recordedAtMs,
    )
  },
  removeReaderAnnotation(
    sidecarRootPath,
    libraryRootPath,
    bookId,
    format,
    id,
    recordedAtMs,
  ) {
    return getNativeModule().removeReaderAnnotation(
      sidecarRootPath,
      libraryRootPath,
      bookId,
      format,
      id,
      recordedAtMs,
    )
  },
  addReadingSessionInterval(
    sidecarRootPath,
    libraryRootPath,
    id,
    bookId,
    format,
    localDay,
    startedAtMs,
    durationSeconds,
    recordedAtMs,
  ) {
    return getNativeModule().addReadingSessionInterval({
      sidecarRootPath,
      libraryRootPath,
      id,
      bookId,
      format,
      localDay,
      startedAtMs,
      durationSeconds,
      recordedAtMs,
    })
  },
  addReadingCompletion(
    sidecarRootPath,
    libraryRootPath,
    id,
    bookId,
    format,
    localDay,
    completedAtMs,
    recordedAtMs,
  ) {
    return getNativeModule().addReadingCompletion(
      sidecarRootPath,
      libraryRootPath,
      id,
      bookId,
      format,
      localDay,
      completedAtMs,
      recordedAtMs,
    )
  },
  getReadingStatistics(sidecarRootPath, libraryRootPath, startDay, endDay) {
    return getNativeModule().getReadingStatistics(
      sidecarRootPath,
      libraryRootPath,
      startDay,
      endDay,
    )
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
