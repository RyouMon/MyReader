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

private struct FileStateUpdateRecord: Record {
  @Field var localState = ""
  @Field var localBlake3: String? = nil
  @Field var localSize: Int64? = nil
  @Field var localMtime: Int64? = nil
}

private struct BookCoverThumbnailCachePatchRecord: Record {
  @Field var bookId: Int64 = 0
  @Field var coverIdentity = ""
  @Field var thumbnailVersion = ""
  @Field var widthPx: Int64 = 0
  @Field var heightPx: Int64 = 0
  @Field var fileName = ""
  @Field var fileSizeBytes: Int64 = 0
}

private struct DataSourceRecord: Record {
  @Field var sourceType = ""
  @Field var id = ""
  @Field var name = ""
  @Field var enabled = true
  @Field var rootPath: String? = nil
  @Field var readonly: Bool? = nil
  @Field var createdAt: Double? = nil
  @Field var endpoint: String? = nil
  @Field var username: String? = nil
  @Field var hasPassword = false
  @Field var credentialReference: String? = nil
  @Field var clientId: String? = nil
  @Field var tenantId: String? = nil
  @Field var displayName: String? = nil
  @Field var email: String? = nil
  @Field var hasRefreshToken = false

  var native: NativeDataSource {
    NativeDataSource(
      sourceType: sourceType,
      id: id,
      name: name,
      enabled: enabled,
      rootPath: rootPath,
      readonly: readonly,
      createdAt: createdAt,
      endpoint: endpoint,
      username: username,
      hasPassword: hasPassword,
      credentialReference: credentialReference,
      clientId: clientId,
      tenantId: tenantId,
      displayName: displayName,
      email: email,
      hasRefreshToken: hasRefreshToken
    )
  }
}

private struct SecurityScopedBookmarkRecord: Record {
  @Field var bookmarkBase64 = ""
  @Field var resolvedUri = ""
  @Field var stale = false

  var native: NativeSecurityScopedBookmark {
    NativeSecurityScopedBookmark(
      bookmarkBase64: bookmarkBase64,
      resolvedUri: resolvedUri,
      stale: stale
    )
  }
}

private struct LibraryRecord: Record {
  @Field var id = ""
  @Field var name = ""
  @Field var path = ""
  @Field var bookCount: Int64 = 0
  @Field var metadataUri: String? = nil
  @Field var addedAt: Double? = nil
  @Field var dataSourceId: String? = nil
  @Field var sourceType: String? = nil
  @Field var sourcePath: String? = nil
  @Field var metadataEtag: String? = nil
  @Field var securityScopedBookmark: SecurityScopedBookmarkRecord? = nil

  var native: NativeLibrary {
    NativeLibrary(
      id: id,
      name: name,
      path: path,
      bookCount: bookCount,
      metadataUri: metadataUri,
      addedAt: addedAt,
      dataSourceId: dataSourceId,
      sourceType: sourceType,
      sourcePath: sourcePath,
      metadataEtag: metadataEtag,
      securityScopedBookmark: securityScopedBookmark?.native
    )
  }
}

private struct DeviceRegistryRecord: Record {
  @Field var schemaVersion: Int = 1
  @Field var dataSources: [DataSourceRecord] = []
  @Field var libraries: [LibraryRecord] = []
  @Field var activeLibraryId: String? = nil

  var native: NativeDeviceRegistry {
    NativeDeviceRegistry(
      schemaVersion: UInt32(schemaVersion),
      dataSources: dataSources.map(\.native),
      libraries: libraries.map(\.native),
      activeLibraryId: activeLibraryId
    )
  }
}

private struct LocalLibraryRequestRecord: Record {
  @Field var libraryRootPath = ""
  @Field var path = ""
  @Field var sidecarContainerParentPath: String? = nil
  @Field var name: String? = nil
  @Field var metadataUri: String? = nil
  @Field var addedAt: Double? = nil
  @Field var securityScopedBookmark: SecurityScopedBookmarkRecord? = nil

  var native: NativeLocalLibraryRequest {
    NativeLocalLibraryRequest(
      libraryRootPath: libraryRootPath,
      path: path,
      sidecarContainerParentPath: sidecarContainerParentPath,
      name: name,
      metadataUri: metadataUri,
      addedAt: addedAt,
      securityScopedBookmark: securityScopedBookmark?.native
    )
  }
}

private struct RemoteLibraryRequestRecord: Record {
  @Field var dataSourceId = ""
  @Field var sourcePath = ""
  @Field var librariesRootPath = ""
  @Field var librariesRootUri: String? = nil
  @Field var name: String? = nil
  @Field var addedAt: Double? = nil

  var native: NativeRemoteLibraryRequest {
    NativeRemoteLibraryRequest(
      dataSourceId: dataSourceId,
      sourcePath: sourcePath,
      librariesRootPath: librariesRootPath,
      librariesRootUri: librariesRootUri,
      name: name,
      addedAt: addedAt
    )
  }
}

private struct RemoteCredentialRecord: Record {
  @Field var credentialType = ""
  @Field var password: String? = nil
  @Field var accessToken: String? = nil

  var native: NativeRemoteCredential {
    NativeRemoteCredential(
      credentialType: credentialType,
      password: password,
      accessToken: accessToken
    )
  }
}

private func dataSourceDictionary(_ source: NativeDataSource) -> [String: Any?] {
  [
    "sourceType": source.sourceType,
    "id": source.id,
    "name": source.name,
    "enabled": source.enabled,
    "rootPath": source.rootPath,
    "readonly": source.readonly,
    "createdAt": source.createdAt,
    "endpoint": source.endpoint,
    "username": source.username,
    "hasPassword": source.hasPassword,
    "credentialReference": source.credentialReference,
    "clientId": source.clientId,
    "tenantId": source.tenantId,
    "displayName": source.displayName,
    "email": source.email,
    "hasRefreshToken": source.hasRefreshToken
  ]
}

private func bookmarkDictionary(
  _ bookmark: NativeSecurityScopedBookmark
) -> [String: Any] {
  [
    "bookmarkBase64": bookmark.bookmarkBase64,
    "resolvedUri": bookmark.resolvedUri,
    "stale": bookmark.stale
  ]
}

private func libraryDictionary(_ library: NativeLibrary) -> [String: Any?] {
  [
    "id": library.id,
    "name": library.name,
    "path": library.path,
    "bookCount": library.bookCount,
    "metadataUri": library.metadataUri,
    "addedAt": library.addedAt,
    "dataSourceId": library.dataSourceId,
    "sourceType": library.sourceType,
    "sourcePath": library.sourcePath,
    "metadataEtag": library.metadataEtag,
    "securityScopedBookmark": library.securityScopedBookmark.map(bookmarkDictionary)
  ]
}

private func registryDictionary(_ registry: NativeDeviceRegistry) -> [String: Any?] {
  [
    "schemaVersion": Int(registry.schemaVersion),
    "dataSources": registry.dataSources.map(dataSourceDictionary),
    "libraries": registry.libraries.map(libraryDictionary),
    "activeLibraryId": registry.activeLibraryId
  ]
}

private func libraryResultDictionary(_ result: NativeLibraryResult) -> [String: Any?] {
  [
    "registry": registryDictionary(result.registry),
    "library": libraryDictionary(result.library)
  ]
}

private func bookDictionary(_ book: NativeBookEntry) -> [String: Any?] {
  [
    "id": book.id,
    "title": book.title,
    "titleSort": book.titleSort,
    "authorSort": book.authorSort,
    "authors": book.authors,
    "tags": book.tags,
    "series": book.series,
    "seriesIndex": book.seriesIndex,
    "formats": book.formats,
    "hasCover": book.hasCover,
    "path": book.path,
    "timestamp": book.timestamp,
    "pubdate": book.pubdate,
    "lastModified": book.lastModified,
    "comment": book.comment,
    "publisher": book.publisher,
    "languages": book.languages,
    "rating": book.rating,
    "uuid": book.uuid
  ]
}

private func pageDictionary(_ page: NativePaginatedBooks) -> [String: Any] {
  [
    "items": page.items.map(bookDictionary),
    "total": Int(page.total)
  ]
}

private func detailDictionary(_ detail: NativeBookDetail) -> [String: Any?] {
  var result = bookDictionary(detail.book)
  result["formatSizes"] = detail.formatSizes.map {
    ["format": $0.format, "sizeBytes": $0.sizeBytes]
  }
  result["identifiers"] = detail.identifiers.map {
    ["idType": $0.idType, "value": $0.value]
  }
  return result
}

private func fileStateDictionary(_ state: NativeFileState) -> [String: Any?] {
  [
    "id": state.id,
    "path": state.path,
    "localState": state.localState,
    "localBlake3": state.localBlake3,
    "localSize": state.localSize,
    "localMtime": state.localMtime,
    "updatedAt": state.updatedAt
  ]
}

private func coverCacheDictionary(_ cache: NativeBookCoverThumbnailCache) -> [String: Any] {
  [
    "id": cache.id,
    "bookId": cache.bookId,
    "coverIdentity": cache.coverIdentity,
    "thumbnailVersion": cache.thumbnailVersion,
    "widthPx": cache.widthPx,
    "heightPx": cache.heightPx,
    "fileName": cache.fileName,
    "fileSizeBytes": cache.fileSizeBytes,
    "createdAt": cache.createdAt,
    "updatedAt": cache.updatedAt
  ]
}

private func readingPositionDictionary(_ position: NativeReadingPosition) -> [String: Any?] {
  [
    "bookId": position.bookId,
    "format": position.format,
    "locatorJson": position.locatorJson,
    "displayProgression": position.displayProgression,
    "updatedAt": position.updatedAt,
    "conflictCount": position.conflictCount
  ]
}

private func readingPositionCandidateDictionary(
  _ candidate: NativeReadingPositionCandidate
) -> [String: Any?] {
  [
    "operationId": candidate.operationId,
    "locatorJson": candidate.locatorJson,
    "displayProgression": candidate.displayProgression,
    "recordedAt": candidate.recordedAt,
    "replicaId": candidate.replicaId
  ]
}

private func readerBookmarkDictionary(_ bookmark: NativeReaderBookmark) -> [String: Any] {
  [
    "id": bookmark.id,
    "bookId": bookmark.bookId,
    "format": bookmark.format,
    "locatorKey": bookmark.locatorKey,
    "locatorJson": bookmark.locatorJson,
    "createdAt": bookmark.createdAt,
    "updatedAt": bookmark.updatedAt
  ]
}

private func readerAnnotationDictionary(_ annotation: NativeReaderAnnotation) -> [String: Any?] {
  [
    "id": annotation.id,
    "bookId": annotation.bookId,
    "format": annotation.format,
    "kind": annotation.kind,
    "locatorJson": annotation.locatorJson,
    "color": annotation.color,
    "note": annotation.note,
    "createdAt": annotation.createdAt,
    "updatedAt": annotation.updatedAt
  ]
}

private func readingStatisticsDictionary(_ statistics: NativeReadingStatistics) -> [String: Any] {
  [
    "days": statistics.days,
    "totalDurationSeconds": statistics.totalDurationSeconds,
    "longestStreakDays": statistics.longestStreakDays,
    "completedBooks": statistics.completedBooks
  ]
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
      (registryPath: String, legacyRegistry: DeviceRegistryRecord?) -> [String: Any?] in
      try componentCall {
        registryDictionary(try initializeDeviceRegistry(
          registryPath: registryPath,
          legacyRegistry: legacyRegistry?.native
        ))
      }
    }

    AsyncFunction("upsertDeviceDataSource") {
      (registryPath: String, source: DataSourceRecord) -> [String: Any?] in
      try componentCall {
        registryDictionary(try upsertDeviceDataSource(
          registryPath: registryPath,
          source: source.native
        ))
      }
    }

    AsyncFunction("prepareDeviceDataSource") {
      (source: DataSourceRecord) -> [String: Any?] in
      try componentCall {
        dataSourceDictionary(try prepareDeviceDataSource(source: source.native))
      }
    }

    AsyncFunction("validateDeviceDataSource") {
      (registryPath: String, source: DataSourceRecord) in
      try componentCall {
        try validateDeviceDataSource(
          registryPath: registryPath,
          source: source.native
        )
      }
    }

    AsyncFunction("removeDeviceDataSource") {
      (registryPath: String, dataSourceId: String) -> [String: Any?] in
      try componentCall {
        registryDictionary(try removeDeviceDataSource(
          registryPath: registryPath,
          dataSourceId: dataSourceId
        ))
      }
    }

    AsyncFunction("registerDeviceLibrary") {
      (registryPath: String, library: LibraryRecord) -> [String: Any?] in
      try componentCall {
        registryDictionary(try registerDeviceLibrary(
          registryPath: registryPath,
          library: library.native
        ))
      }
    }

    AsyncFunction("replaceDeviceLibrary") {
      (registryPath: String, library: LibraryRecord) -> [String: Any?] in
      try componentCall {
        registryDictionary(try replaceDeviceLibrary(
          registryPath: registryPath,
          library: library.native
        ))
      }
    }

    AsyncFunction("removeDeviceLibrary") {
      (registryPath: String, libraryId: String) -> [String: Any?] in
      try componentCall {
        registryDictionary(try removeDeviceLibrary(
          registryPath: registryPath,
          libraryId: libraryId
        ))
      }
    }

    AsyncFunction("switchDeviceLibrary") {
      (registryPath: String, libraryId: String) -> [String: Any?] in
      try componentCall {
        registryDictionary(try switchDeviceLibrary(
          registryPath: registryPath,
          libraryId: libraryId
        ))
      }
    }

    AsyncFunction("addLocalLibrary") {
      (registryPath: String, request: LocalLibraryRequestRecord) -> [String: Any?] in
      try componentCall {
        libraryResultDictionary(try addLocalLibrary(
          registryPath: registryPath,
          request: request.native
        ))
      }
    }

    AsyncFunction("testRemoteDataSource") {
      (source: DataSourceRecord, credential: RemoteCredentialRecord) in
      try componentCall {
        try testRemoteDataSource(
          source: source.native,
          credential: credential.native
        )
      }
    }

    AsyncFunction("listRemoteDirectories") {
      (
        registryPath: String,
        dataSourceId: String,
        path: String,
        credential: RemoteCredentialRecord
      ) -> [[String: Any]] in
      try componentCall {
        try listRemoteDirectories(
          registryPath: registryPath,
          dataSourceId: dataSourceId,
          path: path,
          credential: credential.native
        ).map {
          ["name": $0.name, "path": $0.path, "isDirectory": $0.isDirectory]
        }
      }
    }

    AsyncFunction("addRemoteLibrary") {
      (
        registryPath: String,
        request: RemoteLibraryRequestRecord,
        credential: RemoteCredentialRecord
      ) -> [String: Any?] in
      try componentCall {
        libraryResultDictionary(try addRemoteLibrary(
          registryPath: registryPath,
          request: request.native,
          credential: credential.native
        ))
      }
    }

    AsyncFunction("refreshRemoteLibrary") {
      (
        registryPath: String,
        libraryId: String,
        localRootPath: String,
        credential: RemoteCredentialRecord
      ) -> [String: Any?] in
      try componentCall {
        libraryResultDictionary(try refreshRemoteLibrary(
          registryPath: registryPath,
          libraryId: libraryId,
          localRootPath: localRootPath,
          credential: credential.native
        ))
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
      (libraryRootPath: String) -> [[String: Any?]] in
      try componentCall {
        try listCalibreBooks(libraryRootPath: libraryRootPath).map(bookDictionary)
      }
    }

    AsyncFunction("listCalibreBooksPage") {
      (
        libraryRootPath: String,
        offset: Int,
        limit: Int,
        sortBy: String?,
        search: String?
      ) -> [String: Any] in
      try componentCall {
        pageDictionary(try listCalibreBooksPage(
          libraryRootPath: libraryRootPath,
          offset: UInt64(offset),
          limit: UInt64(limit),
          sortBy: sortBy,
          search: search
        ))
      }
    }

    AsyncFunction("listCalibreBooksPageByLastRead") {
      (
        libraryRootPath: String,
        sidecarRootPath: String,
        offset: Int,
        limit: Int,
        search: String?
      ) -> [String: Any] in
      try componentCall {
        pageDictionary(try listCalibreBooksPageByLastRead(
          libraryRootPath: libraryRootPath,
          sidecarRootPath: sidecarRootPath,
          offset: UInt64(offset),
          limit: UInt64(limit),
          search: search
        ))
      }
    }

    AsyncFunction("getCalibreBookDetail") {
      (libraryRootPath: String, bookId: Int64) -> [String: Any?] in
      try componentCall {
        detailDictionary(try getCalibreBookDetail(
          libraryRootPath: libraryRootPath,
          bookId: bookId
        ))
      }
    }

    AsyncFunction("listCalibreSeriesBooks") {
      (
        libraryRootPath: String,
        seriesName: String,
        excludeBookId: Int64?
      ) -> [[String: Any?]] in
      try componentCall {
        try listCalibreSeriesBooks(
          libraryRootPath: libraryRootPath,
          seriesName: seriesName,
          excludeBookId: excludeBookId
        ).map(bookDictionary)
      }
    }

    AsyncFunction("getCalibreLibraryUuid") {
      (libraryRootPath: String) -> String in
      try componentCall {
        try getCalibreLibraryUuid(libraryRootPath: libraryRootPath)
      }
    }

    AsyncFunction("listCalibreBookSummaries") {
      (libraryRootPath: String) -> [[String: Any]] in
      try componentCall {
        try listCalibreBookSummaries(libraryRootPath: libraryRootPath).map {
          [
            "id": $0.id,
            "path": $0.path,
            "hasCover": $0.hasCover,
            "formats": $0.formats,
            "formatPaths": $0.formatPaths
          ]
        }
      }
    }

    AsyncFunction("listCalibreBookFormats") {
      (libraryRootPath: String, bookId: Int64) -> [[String: Any]] in
      try componentCall {
        try listCalibreBookFormats(
          libraryRootPath: libraryRootPath,
          bookId: bookId
        ).map {
          [
            "format": $0.format,
            "name": $0.name,
            "sizeBytes": $0.sizeBytes,
            "relativePath": $0.relativePath
          ]
        }
      }
    }

    AsyncFunction("listBookReadingFormats") {
      (sidecarRootPath: String, libraryRootPath: String) -> [String: String] in
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
      (sidecarRootPath: String, path: String) -> [String: Any?]? in
      try componentCall {
        try getLibraryFileState(
          sidecarRootPath: sidecarRootPath,
          path: path
        ).map(fileStateDictionary)
      }
    }

    AsyncFunction("listLibraryFileStates") {
      (sidecarRootPath: String) -> [[String: Any?]] in
      try componentCall {
        try listLibraryFileStates(sidecarRootPath: sidecarRootPath).map(fileStateDictionary)
      }
    }

    AsyncFunction("upsertLibraryFileState") {
      (sidecarRootPath: String, path: String, update: FileStateUpdateRecord) in
      try componentCall {
        try upsertLibraryFileState(
          sidecarRootPath: sidecarRootPath,
          path: path,
          update: NativeFileStateUpdate(
            localState: update.localState,
            localBlake3: update.localBlake3,
            localSize: update.localSize,
            localMtime: update.localMtime
          )
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
      (sidecarRootPath: String, relativePath: String, localPath: String) -> [String: Any] in
      try componentCall {
        let file = try finalizeDownloadedFile(
          sidecarRootPath: sidecarRootPath,
          relativePath: relativePath,
          localPath: localPath
        )
        return ["size": file.size, "mtimeMs": file.mtimeMs]
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
      ) -> [[String: Any]] in
      try componentCall {
        try listBookCoverThumbnailCache(
          sidecarRootPath: sidecarRootPath,
          thumbnailVersion: thumbnailVersion,
          widthPx: widthPx,
          heightPx: heightPx
        ).map(coverCacheDictionary)
      }
    }

    AsyncFunction("upsertBookCoverThumbnailCache") {
      (sidecarRootPath: String, patch: BookCoverThumbnailCachePatchRecord) in
      try componentCall {
        try upsertBookCoverThumbnailCache(
          sidecarRootPath: sidecarRootPath,
          patch: NativeBookCoverThumbnailCachePatch(
            bookId: patch.bookId,
            coverIdentity: patch.coverIdentity,
            thumbnailVersion: patch.thumbnailVersion,
            widthPx: patch.widthPx,
            heightPx: patch.heightPx,
            fileName: patch.fileName,
            fileSizeBytes: patch.fileSizeBytes
          )
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
      (sidecarRootPath: String) -> [Int64] in
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
      (sidecarRootPath: String, bookId: Int64, format: String) -> [String: Any?]? in
      try componentCall {
        try getReadingPosition(
          sidecarRootPath: sidecarRootPath,
          bookId: bookId,
          format: format
        ).map(readingPositionDictionary)
      }
    }

    AsyncFunction("listReadingPositions") {
      (sidecarRootPath: String) -> [[String: Any?]] in
      try componentCall {
        try listReadingPositions(
          sidecarRootPath: sidecarRootPath
        ).map(readingPositionDictionary)
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
      ) -> [[String: Any?]] in
      try componentCall {
        try listReadingPositionCandidates(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          bookId: bookId,
          format: format,
          nowMs: nowMs
        ).map(readingPositionCandidateDictionary)
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
      (sidecarRootPath: String, bookId: Int64, format: String) -> [[String: Any]] in
      try componentCall {
        try listReaderBookmarks(
          sidecarRootPath: sidecarRootPath,
          bookId: bookId,
          format: format
        ).map(readerBookmarkDictionary)
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
      ) -> [String: Any] in
      try componentCall {
        readerBookmarkDictionary(try addReaderBookmark(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          bookId: bookId,
          format: format,
          locatorKey: locatorKey,
          locatorJson: locatorJson,
          recordedAtMs: recordedAtMs
        ))
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
      (sidecarRootPath: String, bookId: Int64, format: String) -> [[String: Any?]] in
      try componentCall {
        try listReaderAnnotations(
          sidecarRootPath: sidecarRootPath,
          bookId: bookId,
          format: format
        ).map(readerAnnotationDictionary)
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
      ) -> [String: Any?] in
      try componentCall {
        readerAnnotationDictionary(try addReaderAnnotation(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          bookId: bookId,
          format: format,
          locatorJson: locatorJson,
          color: color,
          note: note,
          recordedAtMs: recordedAtMs
        ))
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
      ) -> [String: Any?] in
      try componentCall {
        readerAnnotationDictionary(try updateReaderAnnotation(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          bookId: bookId,
          format: format,
          id: id,
          color: color,
          note: note,
          recordedAtMs: recordedAtMs
        ))
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
      ) -> [String: Any] in
      try componentCall {
        readingStatisticsDictionary(try getReadingStatistics(
          sidecarRootPath: sidecarRootPath,
          libraryRootPath: libraryRootPath,
          startDay: startDay,
          endDay: endDay
        ))
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
