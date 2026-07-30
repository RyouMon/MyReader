import { requireNativeModule } from "expo"

export type NativeSyncDatabaseScheduleState = {
  lastSuccessfulPullAt: number | null
  nextRetryAt: number | null
  transientFailureCount: number
  suspendedReason: string | null
}

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

export type MyReaderRustComponentsModule = {
  migrateLibraryDatabase(databasePath: string): Promise<void>
  initializeDeviceRegistry(
    registryPath: string,
    legacyRegistryJson: string | null,
  ): Promise<string>
  upsertDeviceDataSource(
    registryPath: string,
    sourceJson: string,
  ): Promise<string>
  validateDeviceDataSource(
    registryPath: string,
    sourceJson: string,
  ): Promise<void>
  removeDeviceDataSource(
    registryPath: string,
    dataSourceId: string,
  ): Promise<string>
  registerDeviceLibrary(
    registryPath: string,
    libraryJson: string,
  ): Promise<string>
  replaceDeviceLibrary(
    registryPath: string,
    libraryJson: string,
  ): Promise<string>
  removeDeviceLibrary(registryPath: string, libraryId: string): Promise<string>
  switchDeviceLibrary(registryPath: string, libraryId: string): Promise<string>
  testRemoteDataSource(
    sourceJson: string,
    credentialJson: string,
  ): Promise<void>
  listRemoteDirectories(
    registryPath: string,
    dataSourceId: string,
    path: string,
    credentialJson: string,
  ): Promise<string>
  addRemoteLibrary(
    registryPath: string,
    requestJson: string,
    credentialJson: string,
  ): Promise<string>
  refreshRemoteLibrary(
    registryPath: string,
    libraryId: string,
    localRootPath: string,
    credentialJson: string,
  ): Promise<string>
  validateCalibreLibrary(libraryRootPath: string): boolean
  countCalibreBooks(libraryRootPath: string): Promise<number>
  listCalibreBooks(libraryRootPath: string): Promise<string>
  listCalibreBooksPage(
    libraryRootPath: string,
    offset: number,
    limit: number,
    sortBy: string | null,
    search: string | null,
  ): Promise<string>
  getCalibreBookDetail(libraryRootPath: string, bookId: number): Promise<string>
  listCalibreSeriesBooks(
    libraryRootPath: string,
    seriesName: string,
    excludeBookId: number | null,
  ): Promise<string>
  getCalibreLibraryUuid(libraryRootPath: string): Promise<string>
  listCalibreBookSummaries(libraryRootPath: string): Promise<string>
  listCalibreBookFormats(
    libraryRootPath: string,
    bookId: number,
  ): Promise<string>
  listBookReadingFormats(
    sidecarRootPath: string,
    libraryRootPath: string,
  ): Promise<string>
  setBookReadingFormat(
    sidecarRootPath: string,
    libraryRootPath: string,
    bookId: number,
    format: string | null,
  ): Promise<void>
  getLibraryFileState(sidecarRootPath: string, path: string): Promise<string>
  listLibraryFileStates(sidecarRootPath: string): Promise<string>
  upsertLibraryFileState(
    sidecarRootPath: string,
    path: string,
    updateJson: string,
  ): Promise<void>
  deleteLibraryFileState(sidecarRootPath: string, path: string): Promise<void>
  listBookCoverThumbnailCache(
    sidecarRootPath: string,
    thumbnailVersion: string,
    widthPx: number,
    heightPx: number,
  ): Promise<string>
  upsertBookCoverThumbnailCache(
    sidecarRootPath: string,
    patchJson: string,
  ): Promise<void>
  deleteBookCoverThumbnailCache(
    sidecarRootPath: string,
    bookId: number,
    thumbnailVersion: string,
    widthPx: number,
    heightPx: number,
  ): Promise<void>
  clearBookCoverThumbnailCache(sidecarRootPath: string): Promise<void>
  listFavoriteBookIds(sidecarRootPath: string): Promise<string>
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
  ): Promise<string>
  listReadingPositions(sidecarRootPath: string): Promise<string>
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
  ): Promise<string>
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
  ): Promise<string>
  addReaderBookmark(
    sidecarRootPath: string,
    libraryRootPath: string,
    bookId: number,
    format: string,
    locatorKey: string,
    locatorJson: string,
    recordedAtMs: number,
  ): Promise<string>
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
  ): Promise<string>
  addReaderAnnotation(
    sidecarRootPath: string,
    libraryRootPath: string,
    bookId: number,
    format: string,
    locatorJson: string,
    color: string,
    note: string | null,
    recordedAtMs: number,
  ): Promise<string>
  updateReaderAnnotation(
    sidecarRootPath: string,
    libraryRootPath: string,
    bookId: number,
    format: string,
    id: string,
    color: string,
    note: string | null,
    recordedAtMs: number,
  ): Promise<string>
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
    startDay: string,
    endDay: string,
  ): Promise<string>
  listLegacyFinishedReadings(sidecarRootPath: string): Promise<string>
  syncContractVersion(): number
  advanceSyncScheduler(
    stateJson: string | null,
    policyJson: string,
    eventJson: string,
  ): string
  readSidecarSyncSchedule(
    sidecarRootPath: string,
  ): Promise<NativeSyncDatabaseScheduleState>
  effectiveSidecarSyncMode(
    sidecarRootPath: string,
    requestedMode: string,
    nowMs: string,
    freshnessMs: string,
  ): Promise<string | null>
  recordSidecarSyncRetry(
    sidecarRootPath: string,
    nextRetryAt: string,
    failureCount: number,
  ): Promise<void>
  recordSidecarSyncSuspension(
    sidecarRootPath: string,
    reason: string,
  ): Promise<void>
  hasSidecarSyncPendingWork(sidecarRootPath: string): Promise<boolean>
  classifySidecarSyncFailure(kind: string): string
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
  migrateLibraryDatabase(databasePath) {
    return getNativeModule().migrateLibraryDatabase(databasePath)
  },
  initializeDeviceRegistry(registryPath, legacyRegistryJson) {
    return getNativeModule().initializeDeviceRegistry(
      registryPath,
      legacyRegistryJson,
    )
  },
  upsertDeviceDataSource(registryPath, sourceJson) {
    return getNativeModule().upsertDeviceDataSource(registryPath, sourceJson)
  },
  validateDeviceDataSource(registryPath, sourceJson) {
    return getNativeModule().validateDeviceDataSource(registryPath, sourceJson)
  },
  removeDeviceDataSource(registryPath, dataSourceId) {
    return getNativeModule().removeDeviceDataSource(registryPath, dataSourceId)
  },
  registerDeviceLibrary(registryPath, libraryJson) {
    return getNativeModule().registerDeviceLibrary(registryPath, libraryJson)
  },
  replaceDeviceLibrary(registryPath, libraryJson) {
    return getNativeModule().replaceDeviceLibrary(registryPath, libraryJson)
  },
  removeDeviceLibrary(registryPath, libraryId) {
    return getNativeModule().removeDeviceLibrary(registryPath, libraryId)
  },
  switchDeviceLibrary(registryPath, libraryId) {
    return getNativeModule().switchDeviceLibrary(registryPath, libraryId)
  },
  testRemoteDataSource(sourceJson, credentialJson) {
    return getNativeModule().testRemoteDataSource(sourceJson, credentialJson)
  },
  listRemoteDirectories(registryPath, dataSourceId, path, credentialJson) {
    return getNativeModule().listRemoteDirectories(
      registryPath,
      dataSourceId,
      path,
      credentialJson,
    )
  },
  addRemoteLibrary(registryPath, requestJson, credentialJson) {
    return getNativeModule().addRemoteLibrary(
      registryPath,
      requestJson,
      credentialJson,
    )
  },
  refreshRemoteLibrary(registryPath, libraryId, localRootPath, credentialJson) {
    return getNativeModule().refreshRemoteLibrary(
      registryPath,
      libraryId,
      localRootPath,
      credentialJson,
    )
  },
  validateCalibreLibrary(libraryRootPath) {
    return getNativeModule().validateCalibreLibrary(libraryRootPath)
  },
  countCalibreBooks(libraryRootPath) {
    return getNativeModule().countCalibreBooks(libraryRootPath)
  },
  listCalibreBooks(libraryRootPath) {
    return getNativeModule().listCalibreBooks(libraryRootPath)
  },
  listCalibreBooksPage(libraryRootPath, offset, limit, sortBy, search) {
    return getNativeModule().listCalibreBooksPage(
      libraryRootPath,
      offset,
      limit,
      sortBy,
      search,
    )
  },
  getCalibreBookDetail(libraryRootPath, bookId) {
    return getNativeModule().getCalibreBookDetail(libraryRootPath, bookId)
  },
  listCalibreSeriesBooks(libraryRootPath, seriesName, excludeBookId) {
    return getNativeModule().listCalibreSeriesBooks(
      libraryRootPath,
      seriesName,
      excludeBookId,
    )
  },
  getCalibreLibraryUuid(libraryRootPath) {
    return getNativeModule().getCalibreLibraryUuid(libraryRootPath)
  },
  listCalibreBookSummaries(libraryRootPath) {
    return getNativeModule().listCalibreBookSummaries(libraryRootPath)
  },
  listCalibreBookFormats(libraryRootPath, bookId) {
    return getNativeModule().listCalibreBookFormats(libraryRootPath, bookId)
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
    return getNativeModule().addReadingSessionInterval(
      sidecarRootPath,
      libraryRootPath,
      id,
      bookId,
      format,
      localDay,
      startedAtMs,
      durationSeconds,
      recordedAtMs,
    )
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
  getReadingStatistics(sidecarRootPath, startDay, endDay) {
    return getNativeModule().getReadingStatistics(
      sidecarRootPath,
      startDay,
      endDay,
    )
  },
  listLegacyFinishedReadings(sidecarRootPath) {
    return getNativeModule().listLegacyFinishedReadings(sidecarRootPath)
  },
  syncContractVersion() {
    return getNativeModule().syncContractVersion()
  },
  advanceSyncScheduler(stateJson, policyJson, eventJson) {
    return getNativeModule().advanceSyncScheduler(
      stateJson,
      policyJson,
      eventJson,
    )
  },
  readSidecarSyncSchedule(sidecarRootPath) {
    return getNativeModule().readSidecarSyncSchedule(sidecarRootPath)
  },
  effectiveSidecarSyncMode(sidecarRootPath, requestedMode, nowMs, freshnessMs) {
    return getNativeModule().effectiveSidecarSyncMode(
      sidecarRootPath,
      requestedMode,
      nowMs,
      freshnessMs,
    )
  },
  recordSidecarSyncRetry(sidecarRootPath, nextRetryAt, failureCount) {
    return getNativeModule().recordSidecarSyncRetry(
      sidecarRootPath,
      nextRetryAt,
      failureCount,
    )
  },
  recordSidecarSyncSuspension(sidecarRootPath, reason) {
    return getNativeModule().recordSidecarSyncSuspension(
      sidecarRootPath,
      reason,
    )
  },
  hasSidecarSyncPendingWork(sidecarRootPath) {
    return getNativeModule().hasSidecarSyncPendingWork(sidecarRootPath)
  },
  classifySidecarSyncFailure(kind) {
    return getNativeModule().classifySidecarSyncFailure(kind)
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
