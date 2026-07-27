import { requireNativeModule } from "expo"

export type NativeSyncDocumentCommandResult = {
  schemaVersion: number
  heads: string[]
  projectionJson: string
}

export type NativeSyncDatabaseIdentity = {
  libraryUuid: string
  replicaId: string
}

export type NativeSyncDatabaseScheduleState = {
  lastSuccessfulPullAt: number | null
  nextRetryAt: number | null
  transientFailureCount: number
  suspendedReason: string | null
}

export type NativeSyncDatabaseDiagnostics = {
  schemaVersion: number | null
  heads: string[]
  changes: number
  pendingOutbox: number
  receipts: number
  projectionVersion: number | null
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
  syncContractVersion(): number
  advanceSyncScheduler(
    stateJson: string | null,
    policyJson: string,
    eventJson: string,
  ): string
  ensureSyncDatabaseIdentity(
    databasePath: string,
    libraryUuid: string,
  ): Promise<NativeSyncDatabaseIdentity>
  readSyncDatabaseScheduleState(
    databasePath: string,
  ): Promise<NativeSyncDatabaseScheduleState | null>
  writeSyncDatabaseScheduleState(
    databasePath: string,
    lastSuccessfulPullAt: number | null,
    nextRetryAt: number | null,
    transientFailureCount: number,
    suspendedReason: string | null,
  ): Promise<void>
  markSyncDatabaseScheduleSucceeded(
    databasePath: string,
    completedPullAt: number | null,
  ): Promise<void>
  ensureSyncDatabaseDocument(
    databasePath: string,
    libraryUuid: string,
    replicaId: string,
    nowMs: string,
  ): Promise<NativeSyncDocumentCommandResult>
  executeSyncDatabaseCommand(
    databasePath: string,
    libraryUuid: string,
    replicaId: string,
    nowMs: string,
    commandJson: string,
  ): Promise<NativeSyncDocumentCommandResult>
  hasSyncDatabasePendingWork(databasePath: string): Promise<boolean>
  readSyncDatabaseDiagnostics(
    databasePath: string,
  ): Promise<NativeSyncDatabaseDiagnostics>
  readSyncTaskProgress(taskId: string): NativeSyncTaskProgress | null
  cancelSyncTask(taskId: string): boolean
  releaseSyncTask(taskId: string): boolean
  syncLibrarySidecar(
    taskId: string,
    databasePath: string,
    libraryUuid: string,
    replicaId: string,
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
  ensureSyncDatabaseIdentity(databasePath, libraryUuid) {
    return getNativeModule().ensureSyncDatabaseIdentity(
      databasePath,
      libraryUuid,
    )
  },
  readSyncDatabaseScheduleState(databasePath) {
    return getNativeModule().readSyncDatabaseScheduleState(databasePath)
  },
  writeSyncDatabaseScheduleState(
    databasePath,
    lastSuccessfulPullAt,
    nextRetryAt,
    transientFailureCount,
    suspendedReason,
  ) {
    return getNativeModule().writeSyncDatabaseScheduleState(
      databasePath,
      lastSuccessfulPullAt,
      nextRetryAt,
      transientFailureCount,
      suspendedReason,
    )
  },
  markSyncDatabaseScheduleSucceeded(databasePath, completedPullAt) {
    return getNativeModule().markSyncDatabaseScheduleSucceeded(
      databasePath,
      completedPullAt,
    )
  },
  ensureSyncDatabaseDocument(databasePath, libraryUuid, replicaId, nowMs) {
    return getNativeModule().ensureSyncDatabaseDocument(
      databasePath,
      libraryUuid,
      replicaId,
      nowMs,
    )
  },
  executeSyncDatabaseCommand(
    databasePath,
    libraryUuid,
    replicaId,
    nowMs,
    commandJson,
  ) {
    return getNativeModule().executeSyncDatabaseCommand(
      databasePath,
      libraryUuid,
      replicaId,
      nowMs,
      commandJson,
    )
  },
  hasSyncDatabasePendingWork(databasePath) {
    return getNativeModule().hasSyncDatabasePendingWork(databasePath)
  },
  readSyncDatabaseDiagnostics(databasePath) {
    return getNativeModule().readSyncDatabaseDiagnostics(databasePath)
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
    databasePath,
    libraryUuid,
    replicaId,
    nowMs,
    mode,
    storageJson,
  ) {
    return getNativeModule().syncLibrarySidecar(
      taskId,
      databasePath,
      libraryUuid,
      replicaId,
      nowMs,
      mode,
      storageJson,
    )
  },
}

export default moduleFacade
