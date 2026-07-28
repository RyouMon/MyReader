import ExpoModulesCore

private struct ReadingSessionIntervalRecord: Record {
  @Field var sidecarRootPath = ""
  @Field var libraryRootPath = ""
  @Field var id = ""
  @Field var bookId: Int64 = 0
  @Field var format = ""
  @Field var localDay = ""
  @Field var startedAtMs: Int64 = 0
  @Field var durationSeconds: Int64 = 0
  @Field var recordedAtMs: Int64 = 0
}

private func componentCall<T>(_ operation: () throws -> T) throws -> T {
  do {
    return try operation()
  } catch let RustComponentsError.Core(message) {
    throw Exception(
      name: "RustComponentException",
      description: message,
      code: "CORE_ERROR"
    )
  } catch let RustComponentsError.Sync(message) {
    throw Exception(
      name: "SyncComponentException",
      description: message,
      code: "SYNC_ERROR"
    )
  } catch {
    throw Exception(
      name: "SyncComponentException",
      description: error.localizedDescription,
      code: "SYNC_ERROR"
    )
  }
}

private func downloadTaskDictionary(_ task: NativeDownloadTask) -> [String: Any] {
  [
    "id": task.id,
    "libraryId": task.libraryId,
    "bookId": task.bookId ?? NSNull(),
    "format": task.format ?? NSNull(),
    "relativePath": task.relativePath,
    "label": task.label,
    "status": task.status,
    "progress": task.progress,
    "error": task.error ?? NSNull(),
  ]
}

public class MyReaderRustComponentsModule: Module {
  public func definition() -> ModuleDefinition {
    Name("MyReaderRustComponents")

    AsyncFunction("migrateLibraryDatabase") {
      (databasePath: String) in
      try componentCall {
        try migrateLibraryDatabase(databasePath: databasePath)
      }
    }

    AsyncFunction("initializeDeviceRegistry") {
      (registryPath: String, legacyRegistryJson: String?) -> String in
      try componentCall {
        try initializeDeviceRegistry(
          registryPath: registryPath,
          legacyRegistryJson: legacyRegistryJson
        )
      }
    }

    AsyncFunction("upsertDeviceDataSource") {
      (registryPath: String, sourceJson: String) -> String in
      try componentCall {
        try upsertDeviceDataSource(
          registryPath: registryPath,
          sourceJson: sourceJson
        )
      }
    }

    AsyncFunction("prepareDeviceDataSource") {
      (sourceJson: String) -> String in
      try componentCall {
        try prepareDeviceDataSource(sourceJson: sourceJson)
      }
    }

    AsyncFunction("validateDeviceDataSource") {
      (registryPath: String, sourceJson: String) in
      try componentCall {
        try validateDeviceDataSource(
          registryPath: registryPath,
          sourceJson: sourceJson
        )
      }
    }

    AsyncFunction("removeDeviceDataSource") {
      (registryPath: String, dataSourceId: String) -> String in
      try componentCall {
        try removeDeviceDataSource(
          registryPath: registryPath,
          dataSourceId: dataSourceId
        )
      }
    }

    AsyncFunction("registerDeviceLibrary") {
      (registryPath: String, libraryJson: String) -> String in
      try componentCall {
        try registerDeviceLibrary(
          registryPath: registryPath,
          libraryJson: libraryJson
        )
      }
    }

    AsyncFunction("replaceDeviceLibrary") {
      (registryPath: String, libraryJson: String) -> String in
      try componentCall {
        try replaceDeviceLibrary(
          registryPath: registryPath,
          libraryJson: libraryJson
        )
      }
    }

    AsyncFunction("removeDeviceLibrary") {
      (registryPath: String, libraryId: String) -> String in
      try componentCall {
        try removeDeviceLibrary(
          registryPath: registryPath,
          libraryId: libraryId
        )
      }
    }

    AsyncFunction("switchDeviceLibrary") {
      (registryPath: String, libraryId: String) -> String in
      try componentCall {
        try switchDeviceLibrary(
          registryPath: registryPath,
          libraryId: libraryId
        )
      }
    }

    AsyncFunction("addLocalLibrary") {
      (registryPath: String, requestJson: String) -> String in
      try componentCall {
        try addLocalLibrary(registryPath: registryPath, requestJson: requestJson)
      }
    }

    AsyncFunction("testRemoteDataSource") {
      (sourceJson: String, credentialJson: String) in
      try componentCall {
        try testRemoteDataSource(
          sourceJson: sourceJson,
          credentialJson: credentialJson
        )
      }
    }

    AsyncFunction("listRemoteDirectories") {
      (
        registryPath: String,
        dataSourceId: String,
        path: String,
        credentialJson: String
      ) -> String in
      try componentCall {
        try listRemoteDirectories(
          registryPath: registryPath,
          dataSourceId: dataSourceId,
          path: path,
          credentialJson: credentialJson
        )
      }
    }

    AsyncFunction("addRemoteLibrary") {
      (
        registryPath: String,
        requestJson: String,
        credentialJson: String
      ) -> String in
      try componentCall {
        try addRemoteLibrary(
          registryPath: registryPath,
          requestJson: requestJson,
          credentialJson: credentialJson
        )
      }
    }

    AsyncFunction("refreshRemoteLibrary") {
      (
        registryPath: String,
        libraryId: String,
        localRootPath: String,
        credentialJson: String
      ) -> String in
      try componentCall {
        try refreshRemoteLibrary(
          registryPath: registryPath,
          libraryId: libraryId,
          localRootPath: localRootPath,
          credentialJson: credentialJson
        )
      }
    }

    Function("validateCalibreLibrary") {
      (libraryRootPath: String) -> Bool in
      validateCalibreLibrary(libraryRootPath: libraryRootPath)
    }

    AsyncFunction("countCalibreBooks") {
      (libraryRootPath: String) -> Int in
      try componentCall {
        Int(try countCalibreBooks(libraryRootPath: libraryRootPath))
      }
    }

    AsyncFunction("listCalibreBooks") {
      (libraryRootPath: String) -> String in
      try componentCall {
        try listCalibreBooks(libraryRootPath: libraryRootPath)
      }
    }

    AsyncFunction("listCalibreBooksPage") {
      (
        libraryRootPath: String,
        offset: Int,
        limit: Int,
        sortBy: String?,
        search: String?
      ) -> String in
      try componentCall {
        try listCalibreBooksPage(
          libraryRootPath: libraryRootPath,
          offset: UInt64(offset),
          limit: UInt64(limit),
          sortBy: sortBy,
          search: search
        )
      }
    }

    AsyncFunction("listCalibreBooksPageByLastRead") {
      (
        libraryRootPath: String,
        sidecarRootPath: String,
        offset: Int,
        limit: Int,
        search: String?
      ) -> String in
      try componentCall {
        try listCalibreBooksPageByLastRead(
          libraryRootPath: libraryRootPath,
          sidecarRootPath: sidecarRootPath,
          offset: UInt64(offset),
          limit: UInt64(limit),
          search: search
        )
      }
    }

    AsyncFunction("getCalibreBookDetail") {
      (libraryRootPath: String, bookId: Int64) -> String in
      try componentCall {
        try getCalibreBookDetail(
          libraryRootPath: libraryRootPath,
          bookId: bookId
        )
      }
    }

    AsyncFunction("listCalibreSeriesBooks") {
      (
        libraryRootPath: String,
        seriesName: String,
        excludeBookId: Int64?
      ) -> String in
      try componentCall {
        try listCalibreSeriesBooks(
          libraryRootPath: libraryRootPath,
          seriesName: seriesName,
          excludeBookId: excludeBookId
        )
      }
    }

    AsyncFunction("getCalibreLibraryUuid") {
      (libraryRootPath: String) -> String in
      try componentCall {
        try getCalibreLibraryUuid(libraryRootPath: libraryRootPath)
      }
    }

    AsyncFunction("listCalibreBookSummaries") {
      (libraryRootPath: String) -> String in
      try componentCall {
        try listCalibreBookSummaries(libraryRootPath: libraryRootPath)
      }
    }

    AsyncFunction("listCalibreBookFormats") {
      (libraryRootPath: String, bookId: Int64) -> String in
      try componentCall {
        try listCalibreBookFormats(
          libraryRootPath: libraryRootPath,
          bookId: bookId
        )
      }
    }

    AsyncFunction("listBookReadingFormats") {
      (sidecarRootPath: String, libraryRootPath: String) -> String in
      try componentCall {
        try listBookReadingFormats(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath
        )
      }
    }

    AsyncFunction("setBookReadingFormat") {
      (
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Int64,
        format: String?
      ) in
      try componentCall {
        try setBookReadingFormat(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          bookId: bookId,
          format: format
        )
      }
    }

    AsyncFunction("getLibraryFileState") {
      (sidecarRootPath: String, path: String) -> String in
      try componentCall {
        try getLibraryFileState(
          sidecarRootPath: sidecarRootPath,
          path: path
        )
      }
    }

    AsyncFunction("listLibraryFileStates") {
      (sidecarRootPath: String) -> String in
      try componentCall {
        try listLibraryFileStates(sidecarRootPath: sidecarRootPath)
      }
    }

    AsyncFunction("upsertLibraryFileState") {
      (sidecarRootPath: String, path: String, updateJson: String) in
      try componentCall {
        try upsertLibraryFileState(
          sidecarRootPath: sidecarRootPath,
          path: path,
          updateJson: updateJson
        )
      }
    }

    AsyncFunction("deleteLibraryFileState") {
      (sidecarRootPath: String, path: String) in
      try componentCall {
        try deleteLibraryFileState(
          sidecarRootPath: sidecarRootPath,
          path: path
        )
      }
    }

    AsyncFunction("finalizeDownloadedFile") {
      (sidecarRootPath: String, relativePath: String, localPath: String) -> String in
      try componentCall {
        try finalizeDownloadedFile(
          sidecarRootPath: sidecarRootPath,
          relativePath: relativePath,
          localPath: localPath
        )
      }
    }

    AsyncFunction("markLibraryFileRemoteOnly") {
      (sidecarRootPath: String, relativePath: String) in
      try componentCall {
        try markLibraryFileRemoteOnly(
          sidecarRootPath: sidecarRootPath,
          relativePath: relativePath
        )
      }
    }

    AsyncFunction("listBookCoverThumbnailCache") {
      (
        sidecarRootPath: String,
        thumbnailVersion: String,
        widthPx: Int64,
        heightPx: Int64
      ) -> String in
      try componentCall {
        try listBookCoverThumbnailCache(
          sidecarRootPath: sidecarRootPath,
          thumbnailVersion: thumbnailVersion,
          widthPx: widthPx,
          heightPx: heightPx
        )
      }
    }

    AsyncFunction("upsertBookCoverThumbnailCache") {
      (sidecarRootPath: String, patchJson: String) in
      try componentCall {
        try upsertBookCoverThumbnailCache(
          sidecarRootPath: sidecarRootPath,
          patchJson: patchJson
        )
      }
    }

    AsyncFunction("deleteBookCoverThumbnailCache") {
      (
        sidecarRootPath: String,
        bookId: Int64,
        thumbnailVersion: String,
        widthPx: Int64,
        heightPx: Int64
      ) in
      try componentCall {
        try deleteBookCoverThumbnailCache(
          sidecarRootPath: sidecarRootPath,
          bookId: bookId,
          thumbnailVersion: thumbnailVersion,
          widthPx: widthPx,
          heightPx: heightPx
        )
      }
    }

    AsyncFunction("clearBookCoverThumbnailCache") {
      (sidecarRootPath: String) in
      try componentCall {
        try clearBookCoverThumbnailCache(sidecarRootPath: sidecarRootPath)
      }
    }

    AsyncFunction("listFavoriteBookIds") {
      (sidecarRootPath: String) -> String in
      try componentCall {
        try listFavoriteBookIds(sidecarRootPath: sidecarRootPath)
      }
    }

    AsyncFunction("setFavoriteBook") {
      (
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Int64,
        isFavorite: Bool,
        recordedAtMs: Int64
      ) in
      try componentCall {
        try setFavoriteBook(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          bookId: bookId,
          isFavorite: isFavorite,
          recordedAtMs: recordedAtMs
        )
      }
    }

    AsyncFunction("getReadingPosition") {
      (sidecarRootPath: String, bookId: Int64, format: String) -> String in
      try componentCall {
        try getReadingPosition(
          sidecarRootPath: sidecarRootPath,
          bookId: bookId,
          format: format
        )
      }
    }

    AsyncFunction("listReadingPositions") {
      (sidecarRootPath: String) -> String in
      try componentCall {
        try listReadingPositions(sidecarRootPath: sidecarRootPath)
      }
    }

    AsyncFunction("setReadingPosition") {
      (
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Int64,
        format: String,
        locatorJson: String,
        displayProgression: Double?,
        recordedAtMs: Int64
      ) in
      try componentCall {
        try setReadingPosition(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          bookId: bookId,
          format: format,
          locatorJson: locatorJson,
          displayProgression: displayProgression,
          recordedAtMs: recordedAtMs
        )
      }
    }

    AsyncFunction("listReadingPositionCandidates") {
      (
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Int64,
        format: String,
        nowMs: Int64
      ) -> String in
      try componentCall {
        try listReadingPositionCandidates(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          bookId: bookId,
          format: format,
          nowMs: nowMs
        )
      }
    }

    AsyncFunction("selectReadingPositionCandidate") {
      (
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Int64,
        format: String,
        operationId: String,
        recordedAtMs: Int64
      ) in
      try componentCall {
        try selectReadingPositionCandidate(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          bookId: bookId,
          format: format,
          operationId: operationId,
          recordedAtMs: recordedAtMs
        )
      }
    }

    AsyncFunction("listReaderBookmarks") {
      (sidecarRootPath: String, bookId: Int64, format: String) -> String in
      try componentCall {
        try listReaderBookmarks(
          sidecarRootPath: sidecarRootPath,
          bookId: bookId,
          format: format
        )
      }
    }

    AsyncFunction("addReaderBookmark") {
      (
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Int64,
        format: String,
        locatorKey: String,
        locatorJson: String,
        recordedAtMs: Int64
      ) -> String in
      try componentCall {
        try addReaderBookmark(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          bookId: bookId,
          format: format,
          locatorKey: locatorKey,
          locatorJson: locatorJson,
          recordedAtMs: recordedAtMs
        )
      }
    }

    AsyncFunction("removeReaderBookmark") {
      (
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Int64,
        format: String,
        locatorKey: String,
        recordedAtMs: Int64
      ) in
      try componentCall {
        try removeReaderBookmark(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          bookId: bookId,
          format: format,
          locatorKey: locatorKey,
          recordedAtMs: recordedAtMs
        )
      }
    }

    AsyncFunction("listReaderAnnotations") {
      (sidecarRootPath: String, bookId: Int64, format: String) -> String in
      try componentCall {
        try listReaderAnnotations(
          sidecarRootPath: sidecarRootPath,
          bookId: bookId,
          format: format
        )
      }
    }

    AsyncFunction("addReaderAnnotation") {
      (
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Int64,
        format: String,
        locatorJson: String,
        color: String,
        note: String?,
        recordedAtMs: Int64
      ) -> String in
      try componentCall {
        try addReaderAnnotation(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          bookId: bookId,
          format: format,
          locatorJson: locatorJson,
          color: color,
          note: note,
          recordedAtMs: recordedAtMs
        )
      }
    }

    AsyncFunction("updateReaderAnnotation") {
      (
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Int64,
        format: String,
        id: String,
        color: String,
        note: String?,
        recordedAtMs: Int64
      ) -> String in
      try componentCall {
        try updateReaderAnnotation(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          bookId: bookId,
          format: format,
          id: id,
          color: color,
          note: note,
          recordedAtMs: recordedAtMs
        )
      }
    }

    AsyncFunction("removeReaderAnnotation") {
      (
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Int64,
        format: String,
        id: String,
        recordedAtMs: Int64
      ) in
      try componentCall {
        try removeReaderAnnotation(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          bookId: bookId,
          format: format,
          id: id,
          recordedAtMs: recordedAtMs
        )
      }
    }

    AsyncFunction("addReadingSessionInterval") { (input: ReadingSessionIntervalRecord) in
      try componentCall {
        try addReadingSessionInterval(
          sidecarRootPath: input.sidecarRootPath,
          libraryRootPath: input.libraryRootPath,
          id: input.id,
          bookId: input.bookId,
          format: input.format,
          localDay: input.localDay,
          startedAtMs: input.startedAtMs,
          durationSeconds: input.durationSeconds,
          recordedAtMs: input.recordedAtMs
        )
      }
    }

    AsyncFunction("addReadingCompletion") {
      (
        sidecarRootPath: String,
        libraryRootPath: String,
        id: String,
        bookId: Int64,
        format: String,
        localDay: String,
        completedAtMs: Int64,
        recordedAtMs: Int64
      ) -> Bool in
      try componentCall {
        try addReadingCompletion(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          id: id,
          bookId: bookId,
          format: format,
          localDay: localDay,
          completedAtMs: completedAtMs,
          recordedAtMs: recordedAtMs
        )
      }
    }

    AsyncFunction("getReadingStatistics") {
      (
        sidecarRootPath: String,
        libraryRootPath: String,
        startDay: String,
        endDay: String
      ) -> String in
      try componentCall {
        try getReadingStatistics(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          startDay: startDay,
          endDay: endDay
        )
      }
    }

    Function("findActiveDownloadTask") {
      (libraryId: String, relativePath: String) -> [String: Any]? in
      findActiveDownloadTask(
        libraryId: libraryId,
        relativePath: relativePath
      ).map(downloadTaskDictionary)
    }

    Function("enqueueDownloadTask") {
      (
        id: String,
        libraryId: String,
        bookId: String?,
        format: String?,
        relativePath: String,
        label: String
      ) -> [String: Any] in
      let result = try componentCall {
        try enqueueDownloadTask(
          id: id,
          libraryId: libraryId,
          bookId: bookId,
          format: format,
          relativePath: relativePath,
          label: label
        )
      }
      return [
        "task": downloadTaskDictionary(result.task),
        "inserted": result.inserted,
      ]
    }

    Function("claimDownloadTasks") {
      claimDownloadTasks().map(downloadTaskDictionary)
    }

    Function("claimDownloadTask") {
      (taskId: String) -> [String: Any]? in
      claimDownloadTask(taskId: taskId).map(downloadTaskDictionary)
    }

    Function("markDownloadTaskStarted") {
      (taskId: String) -> [String: Any]? in
      markDownloadTaskStarted(taskId: taskId).map(downloadTaskDictionary)
    }

    Function("reportDownloadTaskProgress") {
      (taskId: String, received: Int64, total: Int64) -> [String: Any]? in
      reportDownloadTaskProgress(
        taskId: taskId,
        received: UInt64(clamping: received),
        total: UInt64(clamping: total)
      ).map(downloadTaskDictionary)
    }

    Function("completeDownloadTask") {
      (taskId: String) -> [String: Any]? in
      completeDownloadTask(taskId: taskId).map(downloadTaskDictionary)
    }

    Function("failDownloadTask") {
      (taskId: String, error: String) -> [String: Any]? in
      failDownloadTask(taskId: taskId, error: error).map(downloadTaskDictionary)
    }

    Function("cancelDownloadTask") {
      (taskId: String) -> Bool in
      cancelDownloadTask(taskId: taskId)
    }

    Function("listDownloadTasks") {
      listDownloadTasks().map(downloadTaskDictionary)
    }

    Function("releaseDownloadTask") {
      (taskId: String) -> Bool in
      releaseDownloadTask(taskId: taskId)
    }

    Function("clearFinishedDownloadTasks") {
      clearFinishedDownloadTasks()
    }

    Function("syncContractVersion") {
      Int(syncContractVersion())
    }

    Function("createSyncCoordinator") {
      (coordinatorId: String) -> Bool in
      createSyncCoordinator(coordinatorId: coordinatorId)
    }

    Function("requestCoordinatedSync") {
      (
        coordinatorId: String,
        libraryId: String,
        mode: String,
        reason: String,
        timing: String,
        nowMs: String
      ) -> String in
      try componentCall {
        try requestCoordinatedSync(
          coordinatorId: coordinatorId,
          libraryId: libraryId,
          mode: mode,
          reason: reason,
          timing: timing,
          nowMs: nowMs
        )
      }
    }

    Function("flushCoordinatedSync") {
      (
        coordinatorId: String,
        libraryId: String,
        reason: String,
        nowMs: String
      ) -> String in
      try componentCall {
        try flushCoordinatedSync(
          coordinatorId: coordinatorId,
          libraryId: libraryId,
          reason: reason,
          nowMs: nowMs
        )
      }
    }

    AsyncFunction("recoverCoordinatedSync") {
      (
        coordinatorId: String,
        sidecarRootPath: String,
        libraryId: String,
        nowMs: String
      ) -> String in
      try componentCall {
        try recoverCoordinatedSync(
          coordinatorId: coordinatorId,
          sidecarRootPath: sidecarRootPath,
          libraryId: libraryId,
          nowMs: nowMs
        )
      }
    }

    AsyncFunction("requestCoordinatedPull") {
      (
        coordinatorId: String,
        sidecarRootPath: String,
        libraryId: String,
        reason: String,
        nowMs: String,
        freshnessMs: String
      ) -> String in
      try componentCall {
        try requestCoordinatedPull(
          coordinatorId: coordinatorId,
          sidecarRootPath: sidecarRootPath,
          libraryId: libraryId,
          reason: reason,
          nowMs: nowMs,
          freshnessMs: freshnessMs
        )
      }
    }

    Function("beginCoordinatedSync") {
      (
        coordinatorId: String,
        libraryId: String,
        generation: Int
      ) -> String in
      try componentCall {
        try beginCoordinatedSync(
          coordinatorId: coordinatorId,
          libraryId: libraryId,
          generation: UInt64(generation)
        )
      }
    }

    AsyncFunction("effectiveCoordinatedSyncExecution") {
      (
        coordinatorId: String,
        sidecarRootPath: String,
        executionJson: String,
        nowMs: String,
        freshnessMs: String
      ) -> String? in
      try componentCall {
        try effectiveCoordinatedSyncExecution(
          coordinatorId: coordinatorId,
          sidecarRootPath: sidecarRootPath,
          executionJson: executionJson,
          nowMs: nowMs,
          freshnessMs: freshnessMs
        )
      }
    }

    Function("completeCoordinatedSync") {
      (
        coordinatorId: String,
        libraryId: String,
        nowMs: String
      ) -> String in
      try componentCall {
        try completeCoordinatedSync(
          coordinatorId: coordinatorId,
          libraryId: libraryId,
          nowMs: nowMs
        )
      }
    }

    AsyncFunction("failCoordinatedSync") {
      (
        coordinatorId: String,
        sidecarRootPath: String,
        executionJson: String,
        failureKind: String,
        reason: String,
        nowMs: String,
        randomFraction: Double
      ) -> String in
      try componentCall {
        try failCoordinatedSync(
          coordinatorId: coordinatorId,
          sidecarRootPath: sidecarRootPath,
          executionJson: executionJson,
          failureKind: failureKind,
          reason: reason,
          nowMs: nowMs,
          randomFraction: randomFraction
        )
      }
    }

    Function("setCoordinatedSyncLibraryOnline") {
      (
        coordinatorId: String,
        libraryId: String,
        online: Bool,
        nowMs: String
      ) -> String in
      try componentCall {
        try setCoordinatedSyncLibraryOnline(
          coordinatorId: coordinatorId,
          libraryId: libraryId,
          online: online,
          nowMs: nowMs
        )
      }
    }

    Function("disposeSyncCoordinator") {
      (coordinatorId: String) -> String in
      try componentCall {
        try disposeSyncCoordinator(coordinatorId: coordinatorId)
      }
    }

    Function("readSyncTaskProgress") {
      (taskId: String) -> [String: Any]? in
      guard let progress = readSyncTaskProgress(taskId: taskId) else {
        return nil
      }
      return [
        "taskId": progress.taskId,
        "stage": progress.stage,
        "completed": Int(progress.completed),
        "total": Int(progress.total),
      ]
    }

    Function("cancelSyncTask") {
      (taskId: String) -> Bool in
      cancelSyncTask(taskId: taskId)
    }

    Function("releaseSyncTask") {
      (taskId: String) -> Bool in
      releaseSyncTask(taskId: taskId)
    }

    AsyncFunction("syncLibrarySidecar") {
      (
        taskId: String,
        sidecarRootPath: String,
        libraryRootPath: String,
        nowMs: String,
        mode: String,
        storageJson: String
      ) async throws -> [String: Any] in
      let result = try componentCall {
        try syncLibrarySidecar(
          taskId: taskId,
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          nowMs: nowMs,
          mode: mode,
          storageJson: storageJson
        )
      }
      return [
        "pushed": Int(result.pushed),
        "pulled": Int(result.pulled),
      ]
    }
  }
}
