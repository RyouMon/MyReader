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
  prepareDeviceDataSource(sourceJson: string): Promise<string>
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
  addLocalLibrary(registryPath: string, requestJson: string): Promise<string>
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
  listCalibreBooksPageByLastRead(
    libraryRootPath: string,
    sidecarRootPath: string,
    offset: number,
    limit: number,
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
  finalizeDownloadedFile(
    sidecarRootPath: string,
    relativePath: string,
    localPath: string,
  ): Promise<string>
  markLibraryFileRemoteOnly(
    sidecarRootPath: string,
    relativePath: string,
  ): Promise<void>
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
    libraryRootPath: string,
    startDay: string,
    endDay: string,
  ): Promise<string>
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
  prepareDeviceDataSource(sourceJson) {
    return getNativeModule().prepareDeviceDataSource(sourceJson)
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
  addLocalLibrary(registryPath, requestJson) {
    return getNativeModule().addLocalLibrary(registryPath, requestJson)
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
  listCalibreBooksPageByLastRead(
    libraryRootPath,
    sidecarRootPath,
    offset,
    limit,
    search,
  ) {
    return getNativeModule().listCalibreBooksPageByLastRead(
      libraryRootPath,
      sidecarRootPath,
      offset,
      limit,
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
