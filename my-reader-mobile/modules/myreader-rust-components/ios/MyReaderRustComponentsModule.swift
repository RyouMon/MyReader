import ExpoModulesCore

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

    AsyncFunction("addReadingSessionInterval") {
      (
        sidecarRootPath: String,
        libraryRootPath: String,
        id: String,
        bookId: Int64,
        format: String,
        localDay: String,
        startedAtMs: Int64,
        durationSeconds: Int64,
        recordedAtMs: Int64
      ) in
      try componentCall {
        try addReadingSessionInterval(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          id: id,
          bookId: bookId,
          format: format,
          localDay: localDay,
          startedAtMs: startedAtMs,
          durationSeconds: durationSeconds,
          recordedAtMs: recordedAtMs
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
        startDay: String,
        endDay: String
      ) -> String in
      try componentCall {
        try getReadingStatistics(
          sidecarRootPath: sidecarRootPath,
          startDay: startDay,
          endDay: endDay
        )
      }
    }

    AsyncFunction("listLegacyFinishedReadings") {
      (sidecarRootPath: String) -> String in
      try componentCall {
        try listLegacyFinishedReadings(sidecarRootPath: sidecarRootPath)
      }
    }

    Function("syncContractVersion") {
      Int(syncContractVersion())
    }

    Function("advanceSyncScheduler") {
      (
        stateJson: String?,
        policyJson: String,
        eventJson: String
      ) -> String in
      try componentCall {
        try advanceSyncScheduler(
          stateJson: stateJson,
          policyJson: policyJson,
          eventJson: eventJson
        )
      }
    }

    AsyncFunction("readSidecarSyncSchedule") {
      (sidecarRootPath: String) -> [String: Any] in
      try componentCall {
        let state = try readSidecarSyncSchedule(sidecarRootPath: sidecarRootPath)
        return [
          "lastSuccessfulPullAt": state.lastSuccessfulPullAt ?? NSNull(),
          "nextRetryAt": state.nextRetryAt ?? NSNull(),
          "transientFailureCount": Int(state.transientFailureCount),
          "suspendedReason": state.suspendedReason ?? NSNull(),
        ]
      }
    }

    AsyncFunction("effectiveSidecarSyncMode") {
      (
        sidecarRootPath: String,
        requestedMode: String,
        nowMs: String,
        freshnessMs: String
      ) -> String? in
      try componentCall {
        try effectiveSidecarSyncMode(
          sidecarRootPath: sidecarRootPath,
          requestedMode: requestedMode,
          nowMs: nowMs,
          freshnessMs: freshnessMs
        )
      }
    }

    AsyncFunction("recordSidecarSyncRetry") {
      (
        sidecarRootPath: String,
        nextRetryAt: String,
        failureCount: UInt32
      ) in
      try componentCall {
        try recordSidecarSyncRetry(
          sidecarRootPath: sidecarRootPath,
          nextRetryAt: nextRetryAt,
          failureCount: failureCount
        )
      }
    }

    AsyncFunction("recordSidecarSyncSuspension") {
      (
        sidecarRootPath: String,
        reason: String
      ) in
      try componentCall {
        try recordSidecarSyncSuspension(
          sidecarRootPath: sidecarRootPath,
          reason: reason
        )
      }
    }

    AsyncFunction("hasSidecarSyncPendingWork") {
      (sidecarRootPath: String) -> Bool in
      try componentCall {
        try hasSidecarSyncPendingWork(sidecarRootPath: sidecarRootPath)
      }
    }

    Function("classifySidecarSyncFailure") {
      (kind: String) -> String in
      classifySidecarSyncFailure(kind: kind)
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
