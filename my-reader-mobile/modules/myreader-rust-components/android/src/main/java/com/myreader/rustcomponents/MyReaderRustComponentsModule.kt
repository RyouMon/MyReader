package com.myreader.rustcomponents

import com.myreader.rustcomponents.uniffi.RustComponentsException
import com.myreader.rustcomponents.uniffi.NativeBookDetail
import com.myreader.rustcomponents.uniffi.NativeBookEntry
import com.myreader.rustcomponents.uniffi.NativeBookFormat
import com.myreader.rustcomponents.uniffi.NativeBookCoverThumbnailCache
import com.myreader.rustcomponents.uniffi.NativeBookCoverThumbnailCachePatch
import com.myreader.rustcomponents.uniffi.NativeBookSummary
import com.myreader.rustcomponents.uniffi.NativeDownloadTask
import com.myreader.rustcomponents.uniffi.NativeDownloadedFile
import com.myreader.rustcomponents.uniffi.NativeDataSource
import com.myreader.rustcomponents.uniffi.NativeDeviceRegistry
import com.myreader.rustcomponents.uniffi.NativeFileState
import com.myreader.rustcomponents.uniffi.NativeFileStateUpdate
import com.myreader.rustcomponents.uniffi.NativeLibrary
import com.myreader.rustcomponents.uniffi.NativeLibraryResult
import com.myreader.rustcomponents.uniffi.NativeLocalLibraryRequest
import com.myreader.rustcomponents.uniffi.NativePaginatedBooks
import com.myreader.rustcomponents.uniffi.NativeReaderAnnotation
import com.myreader.rustcomponents.uniffi.NativeReaderBookmark
import com.myreader.rustcomponents.uniffi.NativeReadingPosition
import com.myreader.rustcomponents.uniffi.NativeReadingPositionCandidate
import com.myreader.rustcomponents.uniffi.NativeReadingStatistics
import com.myreader.rustcomponents.uniffi.NativeRemoteCredential
import com.myreader.rustcomponents.uniffi.NativeRemoteLibraryRequest
import com.myreader.rustcomponents.uniffi.NativeSecurityScopedBookmark
import com.myreader.rustcomponents.uniffi.addReadingCompletion
import com.myreader.rustcomponents.uniffi.addReadingSessionInterval
import com.myreader.rustcomponents.uniffi.beginCoordinatedSync
import com.myreader.rustcomponents.uniffi.addLocalLibrary
import com.myreader.rustcomponents.uniffi.addRemoteLibrary
import com.myreader.rustcomponents.uniffi.addReaderBookmark
import com.myreader.rustcomponents.uniffi.addReaderAnnotation
import com.myreader.rustcomponents.uniffi.cancelSyncTask
import com.myreader.rustcomponents.uniffi.cancelDownloadTask
import com.myreader.rustcomponents.uniffi.claimDownloadTask
import com.myreader.rustcomponents.uniffi.claimDownloadTasks
import com.myreader.rustcomponents.uniffi.clearBookCoverThumbnailCache
import com.myreader.rustcomponents.uniffi.clearFinishedDownloadTasks
import com.myreader.rustcomponents.uniffi.completeCoordinatedSync
import com.myreader.rustcomponents.uniffi.completeDownloadTask
import com.myreader.rustcomponents.uniffi.countCalibreBooks
import com.myreader.rustcomponents.uniffi.createSyncCoordinator
import com.myreader.rustcomponents.uniffi.deleteBookCoverThumbnailCache
import com.myreader.rustcomponents.uniffi.deleteLibraryFileState
import com.myreader.rustcomponents.uniffi.disposeSyncCoordinator
import com.myreader.rustcomponents.uniffi.effectiveCoordinatedSyncExecution
import com.myreader.rustcomponents.uniffi.failCoordinatedSync
import com.myreader.rustcomponents.uniffi.failDownloadTask
import com.myreader.rustcomponents.uniffi.findActiveDownloadTask
import com.myreader.rustcomponents.uniffi.flushCoordinatedSync
import com.myreader.rustcomponents.uniffi.getCalibreBookDetail
import com.myreader.rustcomponents.uniffi.getCalibreLibraryUuid
import com.myreader.rustcomponents.uniffi.getLibraryFileState
import com.myreader.rustcomponents.uniffi.getReadingStatistics
import com.myreader.rustcomponents.uniffi.finalizeDownloadedFile
import com.myreader.rustcomponents.uniffi.getReadingPosition
import com.myreader.rustcomponents.uniffi.initializeDeviceRegistry
import com.myreader.rustcomponents.uniffi.listCalibreBookFormats
import com.myreader.rustcomponents.uniffi.listCalibreBookSummaries
import com.myreader.rustcomponents.uniffi.listCalibreBooks
import com.myreader.rustcomponents.uniffi.listCalibreBooksPage
import com.myreader.rustcomponents.uniffi.listCalibreBooksPageByLastRead
import com.myreader.rustcomponents.uniffi.listCalibreSeriesBooks
import com.myreader.rustcomponents.uniffi.listBookCoverThumbnailCache
import com.myreader.rustcomponents.uniffi.listBookReadingFormats
import com.myreader.rustcomponents.uniffi.listFavoriteBookIds
import com.myreader.rustcomponents.uniffi.listDownloadTasks
import com.myreader.rustcomponents.uniffi.listLibraryFileStates
import com.myreader.rustcomponents.uniffi.markLibraryFileRemoteOnly
import com.myreader.rustcomponents.uniffi.markDownloadTaskStarted
import com.myreader.rustcomponents.uniffi.listRemoteDirectories
import com.myreader.rustcomponents.uniffi.listReadingPositionCandidates
import com.myreader.rustcomponents.uniffi.listReadingPositions
import com.myreader.rustcomponents.uniffi.listReaderBookmarks
import com.myreader.rustcomponents.uniffi.listReaderAnnotations
import com.myreader.rustcomponents.uniffi.migrateLibraryDatabase
import com.myreader.rustcomponents.uniffi.prepareDeviceDataSource
import com.myreader.rustcomponents.uniffi.registerDeviceLibrary
import com.myreader.rustcomponents.uniffi.removeDeviceDataSource
import com.myreader.rustcomponents.uniffi.removeDeviceLibrary
import com.myreader.rustcomponents.uniffi.removeReaderBookmark
import com.myreader.rustcomponents.uniffi.removeReaderAnnotation
import com.myreader.rustcomponents.uniffi.replaceDeviceLibrary
import com.myreader.rustcomponents.uniffi.readSyncTaskProgress
import com.myreader.rustcomponents.uniffi.recoverCoordinatedSync
import com.myreader.rustcomponents.uniffi.refreshRemoteLibrary
import com.myreader.rustcomponents.uniffi.releaseSyncTask
import com.myreader.rustcomponents.uniffi.releaseDownloadTask
import com.myreader.rustcomponents.uniffi.reportDownloadTaskProgress
import com.myreader.rustcomponents.uniffi.requestCoordinatedPull
import com.myreader.rustcomponents.uniffi.requestCoordinatedSync
import com.myreader.rustcomponents.uniffi.setCoordinatedSyncLibraryOnline
import com.myreader.rustcomponents.uniffi.syncContractVersion
import com.myreader.rustcomponents.uniffi.syncLibrarySidecar
import com.myreader.rustcomponents.uniffi.setBookReadingFormat
import com.myreader.rustcomponents.uniffi.setFavoriteBook
import com.myreader.rustcomponents.uniffi.setReadingPosition
import com.myreader.rustcomponents.uniffi.selectReadingPositionCandidate
import com.myreader.rustcomponents.uniffi.switchDeviceLibrary
import com.myreader.rustcomponents.uniffi.testRemoteDataSource
import com.myreader.rustcomponents.uniffi.upsertBookCoverThumbnailCache
import com.myreader.rustcomponents.uniffi.upsertDeviceDataSource
import com.myreader.rustcomponents.uniffi.validateDeviceDataSource
import com.myreader.rustcomponents.uniffi.validateCalibreLibrary
import com.myreader.rustcomponents.uniffi.upsertLibraryFileState
import com.myreader.rustcomponents.uniffi.updateReaderAnnotation
import com.myreader.rustcomponents.uniffi.enqueueDownloadTask
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import expo.modules.kotlin.modules.ModuleDefinitionBuilder
import expo.modules.kotlin.records.Field
import expo.modules.kotlin.records.Record
import expo.modules.kotlin.types.OptimizedRecord

@OptimizedRecord
data class ReadingSessionIntervalRecord(
  @Field val sidecarRootPath: String = "",
  @Field val libraryRootPath: String = "",
  @Field val id: String = "",
  @Field val bookId: Long = 0,
  @Field val format: String = "",
  @Field val localDay: String = "",
  @Field val startedAtMs: Long = 0,
  @Field val durationSeconds: Long = 0,
  @Field val recordedAtMs: Long = 0,
) : Record

@OptimizedRecord
data class FileStateUpdateRecord(
  @Field val localState: String = "",
  @Field val localBlake3: String? = null,
  @Field val localSize: Long? = null,
  @Field val localMtime: Long? = null,
) : Record

@OptimizedRecord
data class BookCoverThumbnailCachePatchRecord(
  @Field val bookId: Long = 0,
  @Field val coverIdentity: String = "",
  @Field val thumbnailVersion: String = "",
  @Field val widthPx: Long = 0,
  @Field val heightPx: Long = 0,
  @Field val fileName: String = "",
  @Field val fileSizeBytes: Long = 0,
) : Record

@OptimizedRecord
data class DataSourceRecord(
  @Field val sourceType: String = "",
  @Field val id: String = "",
  @Field val name: String = "",
  @Field val enabled: Boolean = true,
  @Field val rootPath: String? = null,
  @Field val readonly: Boolean? = null,
  @Field val createdAt: Double? = null,
  @Field val endpoint: String? = null,
  @Field val username: String? = null,
  @Field val hasPassword: Boolean = false,
  @Field val credentialReference: String? = null,
  @Field val clientId: String? = null,
  @Field val tenantId: String? = null,
  @Field val displayName: String? = null,
  @Field val email: String? = null,
  @Field val hasRefreshToken: Boolean = false,
) : Record {
  fun native() = NativeDataSource(
    sourceType = sourceType,
    id = id,
    name = name,
    enabled = enabled,
    rootPath = rootPath,
    readonly = readonly,
    createdAt = createdAt,
    endpoint = endpoint,
    username = username,
    hasPassword = hasPassword,
    credentialReference = credentialReference,
    clientId = clientId,
    tenantId = tenantId,
    displayName = displayName,
    email = email,
    hasRefreshToken = hasRefreshToken,
  )
}

@OptimizedRecord
data class SecurityScopedBookmarkRecord(
  @Field val bookmarkBase64: String = "",
  @Field val resolvedUri: String = "",
  @Field val stale: Boolean = false,
) : Record {
  fun native() = NativeSecurityScopedBookmark(
    bookmarkBase64 = bookmarkBase64,
    resolvedUri = resolvedUri,
    stale = stale,
  )
}

@OptimizedRecord
data class LibraryRecord(
  @Field val id: String = "",
  @Field val name: String = "",
  @Field val path: String = "",
  @Field val bookCount: Long = 0,
  @Field val metadataUri: String? = null,
  @Field val addedAt: Double? = null,
  @Field val dataSourceId: String? = null,
  @Field val sourceType: String? = null,
  @Field val sourcePath: String? = null,
  @Field val metadataEtag: String? = null,
  @Field val securityScopedBookmark: SecurityScopedBookmarkRecord? = null,
) : Record {
  fun native() = NativeLibrary(
    id = id,
    name = name,
    path = path,
    bookCount = bookCount,
    metadataUri = metadataUri,
    addedAt = addedAt,
    dataSourceId = dataSourceId,
    sourceType = sourceType,
    sourcePath = sourcePath,
    metadataEtag = metadataEtag,
    securityScopedBookmark = securityScopedBookmark?.native(),
  )
}

@OptimizedRecord
data class DeviceRegistryRecord(
  @Field val schemaVersion: Int = 1,
  @Field val dataSources: List<DataSourceRecord> = emptyList(),
  @Field val libraries: List<LibraryRecord> = emptyList(),
  @Field val activeLibraryId: String? = null,
) : Record {
  fun native() = NativeDeviceRegistry(
    schemaVersion = schemaVersion.toUInt(),
    dataSources = dataSources.map(DataSourceRecord::native),
    libraries = libraries.map(LibraryRecord::native),
    activeLibraryId = activeLibraryId,
  )
}

@OptimizedRecord
data class LocalLibraryRequestRecord(
  @Field val libraryRootPath: String = "",
  @Field val path: String = "",
  @Field val sidecarContainerParentPath: String? = null,
  @Field val name: String? = null,
  @Field val metadataUri: String? = null,
  @Field val addedAt: Double? = null,
  @Field val securityScopedBookmark: SecurityScopedBookmarkRecord? = null,
) : Record {
  fun native() = NativeLocalLibraryRequest(
    libraryRootPath = libraryRootPath,
    path = path,
    sidecarContainerParentPath = sidecarContainerParentPath,
    name = name,
    metadataUri = metadataUri,
    addedAt = addedAt,
    securityScopedBookmark = securityScopedBookmark?.native(),
  )
}

@OptimizedRecord
data class RemoteLibraryRequestRecord(
  @Field val dataSourceId: String = "",
  @Field val sourcePath: String = "",
  @Field val librariesRootPath: String = "",
  @Field val librariesRootUri: String? = null,
  @Field val name: String? = null,
  @Field val addedAt: Double? = null,
) : Record {
  fun native() = NativeRemoteLibraryRequest(
    dataSourceId = dataSourceId,
    sourcePath = sourcePath,
    librariesRootPath = librariesRootPath,
    librariesRootUri = librariesRootUri,
    name = name,
    addedAt = addedAt,
  )
}

@OptimizedRecord
data class RemoteCredentialRecord(
  @Field val credentialType: String = "",
  @Field val password: String? = null,
  @Field val accessToken: String? = null,
) : Record {
  fun native() = NativeRemoteCredential(
    credentialType = credentialType,
    password = password,
    accessToken = accessToken,
  )
}

class MyReaderRustComponentsModule : Module() {
  private fun dataSourceMap(source: NativeDataSource): Map<String, Any?> = mapOf(
    "sourceType" to source.sourceType,
    "id" to source.id,
    "name" to source.name,
    "enabled" to source.enabled,
    "rootPath" to source.rootPath,
    "readonly" to source.readonly,
    "createdAt" to source.createdAt,
    "endpoint" to source.endpoint,
    "username" to source.username,
    "hasPassword" to source.hasPassword,
    "credentialReference" to source.credentialReference,
    "clientId" to source.clientId,
    "tenantId" to source.tenantId,
    "displayName" to source.displayName,
    "email" to source.email,
    "hasRefreshToken" to source.hasRefreshToken,
  )

  private fun bookmarkMap(bookmark: NativeSecurityScopedBookmark): Map<String, Any?> = mapOf(
    "bookmarkBase64" to bookmark.bookmarkBase64,
    "resolvedUri" to bookmark.resolvedUri,
    "stale" to bookmark.stale,
  )

  private fun libraryMap(library: NativeLibrary): Map<String, Any?> = mapOf(
    "id" to library.id,
    "name" to library.name,
    "path" to library.path,
    "bookCount" to library.bookCount,
    "metadataUri" to library.metadataUri,
    "addedAt" to library.addedAt,
    "dataSourceId" to library.dataSourceId,
    "sourceType" to library.sourceType,
    "sourcePath" to library.sourcePath,
    "metadataEtag" to library.metadataEtag,
    "securityScopedBookmark" to library.securityScopedBookmark?.let(::bookmarkMap),
  )

  private fun registryMap(registry: NativeDeviceRegistry): Map<String, Any?> = mapOf(
    "schemaVersion" to registry.schemaVersion.toLong(),
    "dataSources" to registry.dataSources.map(::dataSourceMap),
    "libraries" to registry.libraries.map(::libraryMap),
    "activeLibraryId" to registry.activeLibraryId,
  )

  private fun libraryResultMap(result: NativeLibraryResult): Map<String, Any?> = mapOf(
    "registry" to registryMap(result.registry),
    "library" to libraryMap(result.library),
  )

  private fun bookMap(book: NativeBookEntry): Map<String, Any?> = mapOf(
    "id" to book.id,
    "title" to book.title,
    "titleSort" to book.titleSort,
    "authorSort" to book.authorSort,
    "authors" to book.authors,
    "tags" to book.tags,
    "series" to book.series,
    "seriesIndex" to book.seriesIndex,
    "formats" to book.formats,
    "hasCover" to book.hasCover,
    "path" to book.path,
    "timestamp" to book.timestamp,
    "pubdate" to book.pubdate,
    "lastModified" to book.lastModified,
    "comment" to book.comment,
    "publisher" to book.publisher,
    "languages" to book.languages,
    "rating" to book.rating,
    "uuid" to book.uuid,
  )

  private fun pageMap(page: NativePaginatedBooks): Map<String, Any?> = mapOf(
    "items" to page.items.map(::bookMap),
    "total" to page.total.toLong(),
  )

  private fun detailMap(detail: NativeBookDetail): Map<String, Any?> =
    bookMap(detail.book) + mapOf(
      "formatSizes" to detail.formatSizes.map {
        mapOf("format" to it.format, "sizeBytes" to it.sizeBytes)
      },
      "identifiers" to detail.identifiers.map {
        mapOf("idType" to it.idType, "value" to it.value)
      },
    )

  private fun summaryMap(summary: NativeBookSummary): Map<String, Any?> = mapOf(
    "id" to summary.id,
    "path" to summary.path,
    "hasCover" to summary.hasCover,
    "formats" to summary.formats,
    "formatPaths" to summary.formatPaths,
  )

  private fun formatMap(format: NativeBookFormat): Map<String, Any?> = mapOf(
    "format" to format.format,
    "name" to format.name,
    "sizeBytes" to format.sizeBytes,
    "relativePath" to format.relativePath,
  )

  private fun fileStateMap(state: NativeFileState): Map<String, Any?> = mapOf(
    "id" to state.id,
    "path" to state.path,
    "localState" to state.localState,
    "localBlake3" to state.localBlake3,
    "localSize" to state.localSize,
    "localMtime" to state.localMtime,
    "updatedAt" to state.updatedAt,
  )

  private fun downloadedFileMap(file: NativeDownloadedFile): Map<String, Any?> = mapOf(
    "size" to file.size,
    "mtimeMs" to file.mtimeMs,
  )

  private fun coverCacheMap(cache: NativeBookCoverThumbnailCache): Map<String, Any?> = mapOf(
    "id" to cache.id,
    "bookId" to cache.bookId,
    "coverIdentity" to cache.coverIdentity,
    "thumbnailVersion" to cache.thumbnailVersion,
    "widthPx" to cache.widthPx,
    "heightPx" to cache.heightPx,
    "fileName" to cache.fileName,
    "fileSizeBytes" to cache.fileSizeBytes,
    "createdAt" to cache.createdAt,
    "updatedAt" to cache.updatedAt,
  )

  private fun readingPositionMap(position: NativeReadingPosition): Map<String, Any?> = mapOf(
    "bookId" to position.bookId,
    "format" to position.format,
    "locatorJson" to position.locatorJson,
    "displayProgression" to position.displayProgression,
    "updatedAt" to position.updatedAt,
    "conflictCount" to position.conflictCount,
  )

  private fun readingPositionCandidateMap(
    candidate: NativeReadingPositionCandidate,
  ): Map<String, Any?> = mapOf(
    "operationId" to candidate.operationId,
    "locatorJson" to candidate.locatorJson,
    "displayProgression" to candidate.displayProgression,
    "recordedAt" to candidate.recordedAt,
    "replicaId" to candidate.replicaId,
  )

  private fun readerBookmarkMap(bookmark: NativeReaderBookmark): Map<String, Any?> = mapOf(
    "id" to bookmark.id,
    "bookId" to bookmark.bookId,
    "format" to bookmark.format,
    "locatorKey" to bookmark.locatorKey,
    "locatorJson" to bookmark.locatorJson,
    "createdAt" to bookmark.createdAt,
    "updatedAt" to bookmark.updatedAt,
  )

  private fun readerAnnotationMap(annotation: NativeReaderAnnotation): Map<String, Any?> = mapOf(
    "id" to annotation.id,
    "bookId" to annotation.bookId,
    "format" to annotation.format,
    "kind" to annotation.kind,
    "locatorJson" to annotation.locatorJson,
    "color" to annotation.color,
    "note" to annotation.note,
    "createdAt" to annotation.createdAt,
    "updatedAt" to annotation.updatedAt,
  )

  private fun readingStatisticsMap(statistics: NativeReadingStatistics): Map<String, Any?> = mapOf(
    "days" to statistics.days,
    "totalDurationSeconds" to statistics.totalDurationSeconds,
    "longestStreakDays" to statistics.longestStreakDays.toLong(),
    "completedBooks" to statistics.completedBooks.toLong(),
  )

  private fun downloadTaskMap(task: NativeDownloadTask): Map<String, Any?> = mapOf(
    "id" to task.id,
    "libraryId" to task.libraryId,
    "bookId" to task.bookId,
    "format" to task.format,
    "relativePath" to task.relativePath,
    "label" to task.label,
    "status" to task.status,
    "progress" to task.progress,
    "error" to task.error,
  )

  private fun <T> componentCall(operation: () -> T): T = try {
    operation()
  } catch (error: RustComponentsException) {
    when (error) {
      is RustComponentsException.Core ->
        throw CodedException("CORE_ERROR", error.v1, error)
      is RustComponentsException.Sync ->
        throw CodedException("SYNC_ERROR", error.v1, error)
    }
  }

  override fun definition() = ModuleDefinition {
    Name("MyReaderRustComponents")
    defineDatabaseFunctions()
    defineRegistryFunctions()
    defineCatalogFunctions()
    defineFileFunctions()
    defineFavoriteFunctions()
    defineReadingPositionFunctions()
    defineAnnotationFunctions()
    defineDownloadFunctions()
    defineSyncFunctions()
  }

  private fun ModuleDefinitionBuilder.defineDatabaseFunctions() {
    AsyncFunction("migrateLibraryDatabase") { databasePath: String ->
      componentCall {
        migrateLibraryDatabase(databasePath)
      }
    }
  }

  private fun ModuleDefinitionBuilder.defineRegistryFunctions() {
    AsyncFunction("initializeDeviceRegistry") {
        registryPath: String,
        legacyRegistry: DeviceRegistryRecord? ->
      componentCall {
        registryMap(initializeDeviceRegistry(registryPath, legacyRegistry?.native()))
      }
    }

    AsyncFunction("upsertDeviceDataSource") {
        registryPath: String,
        source: DataSourceRecord ->
      componentCall {
        registryMap(upsertDeviceDataSource(registryPath, source.native()))
      }
    }

    AsyncFunction("prepareDeviceDataSource") { source: DataSourceRecord ->
      componentCall {
        dataSourceMap(prepareDeviceDataSource(source.native()))
      }
    }

    AsyncFunction("validateDeviceDataSource") {
        registryPath: String,
        source: DataSourceRecord ->
      componentCall {
        validateDeviceDataSource(registryPath, source.native())
      }
    }

    AsyncFunction("removeDeviceDataSource") {
        registryPath: String,
        dataSourceId: String ->
      componentCall {
        registryMap(removeDeviceDataSource(registryPath, dataSourceId))
      }
    }

    AsyncFunction("registerDeviceLibrary") {
        registryPath: String,
        library: LibraryRecord ->
      componentCall {
        registryMap(registerDeviceLibrary(registryPath, library.native()))
      }
    }

    AsyncFunction("replaceDeviceLibrary") {
        registryPath: String,
        library: LibraryRecord ->
      componentCall {
        registryMap(replaceDeviceLibrary(registryPath, library.native()))
      }
    }

    AsyncFunction("removeDeviceLibrary") {
        registryPath: String,
        libraryId: String ->
      componentCall {
        registryMap(removeDeviceLibrary(registryPath, libraryId))
      }
    }

    AsyncFunction("switchDeviceLibrary") {
        registryPath: String,
        libraryId: String ->
      componentCall {
        registryMap(switchDeviceLibrary(registryPath, libraryId))
      }
    }

    AsyncFunction("addLocalLibrary") {
        registryPath: String,
        request: LocalLibraryRequestRecord ->
      componentCall {
        libraryResultMap(addLocalLibrary(registryPath, request.native()))
      }
    }

    AsyncFunction("testRemoteDataSource") {
        source: DataSourceRecord,
        credential: RemoteCredentialRecord ->
      componentCall {
        testRemoteDataSource(source.native(), credential.native())
      }
    }

    AsyncFunction("listRemoteDirectories") {
        registryPath: String,
        dataSourceId: String,
        path: String,
        credential: RemoteCredentialRecord ->
      componentCall {
        listRemoteDirectories(
          registryPath,
          dataSourceId,
          path,
          credential.native(),
        ).map {
          mapOf(
            "name" to it.name,
            "path" to it.path,
            "isDirectory" to it.isDirectory,
          )
        }
      }
    }

    AsyncFunction("addRemoteLibrary") {
        registryPath: String,
        request: RemoteLibraryRequestRecord,
        credential: RemoteCredentialRecord ->
      componentCall {
        libraryResultMap(
          addRemoteLibrary(registryPath, request.native(), credential.native()),
        )
      }
    }

    AsyncFunction("refreshRemoteLibrary") {
        registryPath: String,
        libraryId: String,
        localRootPath: String,
        credential: RemoteCredentialRecord ->
      componentCall {
        libraryResultMap(
          refreshRemoteLibrary(
            registryPath,
            libraryId,
            localRootPath,
            credential.native(),
          ),
        )
      }
    }
  }

  private fun ModuleDefinitionBuilder.defineCatalogFunctions() {
    Function("validateCalibreLibrary") { libraryRootPath: String ->
      validateCalibreLibrary(libraryRootPath)
    }

    AsyncFunction("countCalibreBooks") { libraryRootPath: String ->
      componentCall {
        countCalibreBooks(libraryRootPath).toLong()
      }
    }

    AsyncFunction("listCalibreBooks") { libraryRootPath: String ->
      componentCall {
        listCalibreBooks(libraryRootPath).map(::bookMap)
      }
    }

    AsyncFunction("listCalibreBooksPage") {
        libraryRootPath: String,
        offset: Long,
        limit: Long,
        sortBy: String?,
        search: String? ->
      componentCall {
        pageMap(listCalibreBooksPage(
          libraryRootPath,
          offset.toULong(),
          limit.toULong(),
          sortBy,
          search,
        ))
      }
    }

    AsyncFunction("listCalibreBooksPageByLastRead") {
        libraryRootPath: String,
        sidecarRootPath: String,
        offset: Long,
        limit: Long,
        search: String? ->
      componentCall {
        pageMap(listCalibreBooksPageByLastRead(
          libraryRootPath,
          sidecarRootPath,
          offset.toULong(),
          limit.toULong(),
          search,
        ))
      }
    }

    AsyncFunction("getCalibreBookDetail") {
        libraryRootPath: String,
        bookId: Long ->
      componentCall {
        detailMap(getCalibreBookDetail(libraryRootPath, bookId))
      }
    }

    AsyncFunction("listCalibreSeriesBooks") {
        libraryRootPath: String,
        seriesName: String,
        excludeBookId: Long? ->
      componentCall {
        listCalibreSeriesBooks(
          libraryRootPath,
          seriesName,
          excludeBookId,
        ).map(::bookMap)
      }
    }

    AsyncFunction("getCalibreLibraryUuid") { libraryRootPath: String ->
      componentCall {
        getCalibreLibraryUuid(libraryRootPath)
      }
    }

    AsyncFunction("listCalibreBookSummaries") { libraryRootPath: String ->
      componentCall {
        listCalibreBookSummaries(libraryRootPath).map(::summaryMap)
      }
    }

    AsyncFunction("listCalibreBookFormats") {
        libraryRootPath: String,
        bookId: Long ->
      componentCall {
        listCalibreBookFormats(libraryRootPath, bookId).map(::formatMap)
      }
    }

    AsyncFunction("listBookReadingFormats") {
        sidecarRootPath: String,
        libraryRootPath: String ->
      componentCall {
        listBookReadingFormats(sidecarRootPath, libraryRootPath)
      }
    }

    AsyncFunction("setBookReadingFormat") {
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Long,
        format: String? ->
      componentCall {
        setBookReadingFormat(sidecarRootPath, libraryRootPath, bookId, format)
      }
    }
  }

  private fun ModuleDefinitionBuilder.defineFileFunctions() {
    AsyncFunction("getLibraryFileState") {
        sidecarRootPath: String,
        path: String ->
      componentCall {
        getLibraryFileState(sidecarRootPath, path)?.let(::fileStateMap)
      }
    }

    AsyncFunction("listLibraryFileStates") { sidecarRootPath: String ->
      componentCall {
        listLibraryFileStates(sidecarRootPath).map(::fileStateMap)
      }
    }

    AsyncFunction("upsertLibraryFileState") {
        sidecarRootPath: String,
        path: String,
        update: FileStateUpdateRecord ->
      componentCall {
        upsertLibraryFileState(
          sidecarRootPath,
          path,
          NativeFileStateUpdate(
            localState = update.localState,
            localBlake3 = update.localBlake3,
            localSize = update.localSize,
            localMtime = update.localMtime,
          ),
        )
      }
    }

    AsyncFunction("deleteLibraryFileState") {
        sidecarRootPath: String,
        path: String ->
      componentCall {
        deleteLibraryFileState(sidecarRootPath, path)
      }
    }

    AsyncFunction("finalizeDownloadedFile") {
        sidecarRootPath: String,
        relativePath: String,
        localPath: String ->
      componentCall {
        downloadedFileMap(finalizeDownloadedFile(sidecarRootPath, relativePath, localPath))
      }
    }

    AsyncFunction("markLibraryFileRemoteOnly") {
        sidecarRootPath: String,
        relativePath: String ->
      componentCall {
        markLibraryFileRemoteOnly(sidecarRootPath, relativePath)
      }
    }

    AsyncFunction("listBookCoverThumbnailCache") {
        sidecarRootPath: String,
        thumbnailVersion: String,
        widthPx: Long,
        heightPx: Long ->
      componentCall {
        listBookCoverThumbnailCache(
          sidecarRootPath,
          thumbnailVersion,
          widthPx,
          heightPx,
        ).map(::coverCacheMap)
      }
    }

    AsyncFunction("upsertBookCoverThumbnailCache") {
        sidecarRootPath: String,
        patch: BookCoverThumbnailCachePatchRecord ->
      componentCall {
        upsertBookCoverThumbnailCache(
          sidecarRootPath,
          NativeBookCoverThumbnailCachePatch(
            bookId = patch.bookId,
            coverIdentity = patch.coverIdentity,
            thumbnailVersion = patch.thumbnailVersion,
            widthPx = patch.widthPx,
            heightPx = patch.heightPx,
            fileName = patch.fileName,
            fileSizeBytes = patch.fileSizeBytes,
          ),
        )
      }
    }

    AsyncFunction("deleteBookCoverThumbnailCache") {
        sidecarRootPath: String,
        bookId: Long,
        thumbnailVersion: String,
        widthPx: Long,
        heightPx: Long ->
      componentCall {
        deleteBookCoverThumbnailCache(
          sidecarRootPath,
          bookId,
          thumbnailVersion,
          widthPx,
          heightPx,
        )
      }
    }

    AsyncFunction("clearBookCoverThumbnailCache") { sidecarRootPath: String ->
      componentCall {
        clearBookCoverThumbnailCache(sidecarRootPath)
      }
    }
  }

  private fun ModuleDefinitionBuilder.defineFavoriteFunctions() {
    AsyncFunction("listFavoriteBookIds") { sidecarRootPath: String ->
      componentCall {
        listFavoriteBookIds(sidecarRootPath)
      }
    }

    AsyncFunction("setFavoriteBook") {
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Long,
        isFavorite: Boolean,
        recordedAtMs: Long ->
      componentCall {
        setFavoriteBook(
          sidecarRootPath,
          libraryRootPath,
          bookId,
          isFavorite,
          recordedAtMs,
        )
      }
    }
  }

  private fun ModuleDefinitionBuilder.defineReadingPositionFunctions() {
    AsyncFunction("getReadingPosition") {
        sidecarRootPath: String,
        bookId: Long,
        format: String ->
      componentCall {
        getReadingPosition(sidecarRootPath, bookId, format)?.let(::readingPositionMap)
      }
    }

    AsyncFunction("listReadingPositions") { sidecarRootPath: String ->
      componentCall {
        listReadingPositions(sidecarRootPath).map(::readingPositionMap)
      }
    }

    AsyncFunction("setReadingPosition") {
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Long,
        format: String,
        locatorJson: String,
        displayProgression: Double?,
        recordedAtMs: Long ->
      componentCall {
        setReadingPosition(
          sidecarRootPath,
          libraryRootPath,
          bookId,
          format,
          locatorJson,
          displayProgression,
          recordedAtMs,
        )
      }
    }

    AsyncFunction("listReadingPositionCandidates") {
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Long,
        format: String,
        nowMs: Long ->
      componentCall {
        listReadingPositionCandidates(
          sidecarRootPath,
          libraryRootPath,
          bookId,
          format,
          nowMs,
        ).map(::readingPositionCandidateMap)
      }
    }

    AsyncFunction("selectReadingPositionCandidate") {
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Long,
        format: String,
        operationId: String,
        recordedAtMs: Long ->
      componentCall {
        selectReadingPositionCandidate(
          sidecarRootPath,
          libraryRootPath,
          bookId,
          format,
          operationId,
          recordedAtMs,
        )
      }
    }
  }

  private fun ModuleDefinitionBuilder.defineAnnotationFunctions() {
    AsyncFunction("listReaderBookmarks") {
        sidecarRootPath: String,
        bookId: Long,
        format: String ->
      componentCall {
        listReaderBookmarks(sidecarRootPath, bookId, format).map(::readerBookmarkMap)
      }
    }

    AsyncFunction("addReaderBookmark") {
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Long,
        format: String,
        locatorKey: String,
        locatorJson: String,
        recordedAtMs: Long ->
      componentCall {
        addReaderBookmark(
          sidecarRootPath,
          libraryRootPath,
          bookId,
          format,
          locatorKey,
          locatorJson,
          recordedAtMs,
        ).let(::readerBookmarkMap)
      }
    }

    AsyncFunction("removeReaderBookmark") {
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Long,
        format: String,
        locatorKey: String,
        recordedAtMs: Long ->
      componentCall {
        removeReaderBookmark(
          sidecarRootPath,
          libraryRootPath,
          bookId,
          format,
          locatorKey,
          recordedAtMs,
        )
      }
    }

    AsyncFunction("listReaderAnnotations") {
        sidecarRootPath: String,
        bookId: Long,
        format: String ->
      componentCall {
        listReaderAnnotations(sidecarRootPath, bookId, format).map(::readerAnnotationMap)
      }
    }

    AsyncFunction("addReaderAnnotation") {
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Long,
        format: String,
        locatorJson: String,
        color: String,
        note: String?,
        recordedAtMs: Long ->
      componentCall {
        addReaderAnnotation(
          sidecarRootPath,
          libraryRootPath,
          bookId,
          format,
          locatorJson,
          color,
          note,
          recordedAtMs,
        ).let(::readerAnnotationMap)
      }
    }

    AsyncFunction("updateReaderAnnotation") {
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Long,
        format: String,
        id: String,
        color: String,
        note: String?,
        recordedAtMs: Long ->
      componentCall {
        updateReaderAnnotation(
          sidecarRootPath,
          libraryRootPath,
          bookId,
          format,
          id,
          color,
          note,
          recordedAtMs,
        ).let(::readerAnnotationMap)
      }
    }

    AsyncFunction("removeReaderAnnotation") {
        sidecarRootPath: String,
        libraryRootPath: String,
        bookId: Long,
        format: String,
        id: String,
        recordedAtMs: Long ->
      componentCall {
        removeReaderAnnotation(
          sidecarRootPath,
          libraryRootPath,
          bookId,
          format,
          id,
          recordedAtMs,
        )
      }
    }

    AsyncFunction("addReadingSessionInterval") { input: ReadingSessionIntervalRecord ->
      componentCall {
        addReadingSessionInterval(
          input.sidecarRootPath,
          input.libraryRootPath,
          input.id,
          input.bookId,
          input.format,
          input.localDay,
          input.startedAtMs,
          input.durationSeconds,
          input.recordedAtMs,
        )
      }
    }

    AsyncFunction("addReadingCompletion") {
        sidecarRootPath: String,
        libraryRootPath: String,
        id: String,
        bookId: Long,
        format: String,
        localDay: String,
        completedAtMs: Long,
        recordedAtMs: Long ->
      componentCall {
        addReadingCompletion(
          sidecarRootPath,
          libraryRootPath,
          id,
          bookId,
          format,
          localDay,
          completedAtMs,
          recordedAtMs,
        )
      }
    }

    AsyncFunction("getReadingStatistics") {
        sidecarRootPath: String,
        libraryRootPath: String,
        startDay: String,
        endDay: String ->
      componentCall {
        getReadingStatistics(
          sidecarRootPath,
          libraryRootPath,
          startDay,
          endDay,
        ).let(::readingStatisticsMap)
      }
    }
  }

  private fun ModuleDefinitionBuilder.defineDownloadFunctions() {
    Function("findActiveDownloadTask") {
        libraryId: String,
        relativePath: String ->
      findActiveDownloadTask(libraryId, relativePath)?.let(::downloadTaskMap)
    }

    Function("enqueueDownloadTask") {
        id: String,
        libraryId: String,
        bookId: String?,
        format: String?,
        relativePath: String,
        label: String ->
      componentCall {
        val result = enqueueDownloadTask(
          id,
          libraryId,
          bookId,
          format,
          relativePath,
          label,
        )
        mapOf(
          "task" to downloadTaskMap(result.task),
          "inserted" to result.inserted,
        )
      }
    }

    Function("claimDownloadTasks") {
      claimDownloadTasks().map(::downloadTaskMap)
    }

    Function("claimDownloadTask") { taskId: String ->
      claimDownloadTask(taskId)?.let(::downloadTaskMap)
    }

    Function("markDownloadTaskStarted") { taskId: String ->
      markDownloadTaskStarted(taskId)?.let(::downloadTaskMap)
    }

    Function("reportDownloadTaskProgress") {
        taskId: String,
        received: Long,
        total: Long ->
      reportDownloadTaskProgress(
        taskId,
        received.coerceAtLeast(0).toULong(),
        total.coerceAtLeast(0).toULong(),
      )?.let(::downloadTaskMap)
    }

    Function("completeDownloadTask") { taskId: String ->
      completeDownloadTask(taskId)?.let(::downloadTaskMap)
    }

    Function("failDownloadTask") { taskId: String, error: String ->
      failDownloadTask(taskId, error)?.let(::downloadTaskMap)
    }

    Function("cancelDownloadTask") { taskId: String ->
      cancelDownloadTask(taskId)
    }

    Function("listDownloadTasks") {
      listDownloadTasks().map(::downloadTaskMap)
    }

    Function("releaseDownloadTask") { taskId: String ->
      releaseDownloadTask(taskId)
    }

    Function("clearFinishedDownloadTasks") {
      clearFinishedDownloadTasks()
    }
  }

  private fun ModuleDefinitionBuilder.defineSyncFunctions() {
    Function("syncContractVersion") {
      syncContractVersion().toInt()
    }

    Function("createSyncCoordinator") { coordinatorId: String ->
      createSyncCoordinator(coordinatorId)
    }

    Function("requestCoordinatedSync") {
        coordinatorId: String,
        libraryId: String,
        mode: String,
        reason: String,
        timing: String,
        nowMs: String ->
      componentCall {
        requestCoordinatedSync(
          coordinatorId,
          libraryId,
          mode,
          reason,
          timing,
          nowMs,
        )
      }
    }

    Function("flushCoordinatedSync") {
        coordinatorId: String,
        libraryId: String,
        reason: String,
        nowMs: String ->
      componentCall {
        flushCoordinatedSync(coordinatorId, libraryId, reason, nowMs)
      }
    }

    AsyncFunction("recoverCoordinatedSync") {
        coordinatorId: String,
        sidecarRootPath: String,
        libraryId: String,
        nowMs: String ->
      componentCall {
        recoverCoordinatedSync(
          coordinatorId,
          sidecarRootPath,
          libraryId,
          nowMs,
        )
      }
    }

    AsyncFunction("requestCoordinatedPull") {
        coordinatorId: String,
        sidecarRootPath: String,
        libraryId: String,
        reason: String,
        nowMs: String,
        freshnessMs: String ->
      componentCall {
        requestCoordinatedPull(
          coordinatorId,
          sidecarRootPath,
          libraryId,
          reason,
          nowMs,
          freshnessMs,
        )
      }
    }

    Function("beginCoordinatedSync") {
        coordinatorId: String,
        libraryId: String,
        generation: Long ->
      componentCall {
        beginCoordinatedSync(coordinatorId, libraryId, generation.toULong())
      }
    }

    AsyncFunction("effectiveCoordinatedSyncExecution") {
        coordinatorId: String,
        sidecarRootPath: String,
        executionJson: String,
        nowMs: String,
        freshnessMs: String ->
      componentCall {
        effectiveCoordinatedSyncExecution(
          coordinatorId,
          sidecarRootPath,
          executionJson,
          nowMs,
          freshnessMs,
        )
      }
    }

    Function("completeCoordinatedSync") {
        coordinatorId: String,
        libraryId: String,
        nowMs: String ->
      componentCall {
        completeCoordinatedSync(coordinatorId, libraryId, nowMs)
      }
    }

    AsyncFunction("failCoordinatedSync") {
        coordinatorId: String,
        sidecarRootPath: String,
        executionJson: String,
        failureKind: String,
        reason: String,
        nowMs: String,
        randomFraction: Double ->
      componentCall {
        failCoordinatedSync(
          coordinatorId,
          sidecarRootPath,
          executionJson,
          failureKind,
          reason,
          nowMs,
          randomFraction,
        )
      }
    }

    Function("setCoordinatedSyncLibraryOnline") {
        coordinatorId: String,
        libraryId: String,
        online: Boolean,
        nowMs: String ->
      componentCall {
        setCoordinatedSyncLibraryOnline(
          coordinatorId,
          libraryId,
          online,
          nowMs,
        )
      }
    }

    Function("disposeSyncCoordinator") { coordinatorId: String ->
      componentCall {
        disposeSyncCoordinator(coordinatorId)
      }
    }

    Function("readSyncTaskProgress") { taskId: String ->
      readSyncTaskProgress(taskId)?.let { progress ->
        mapOf(
          "taskId" to progress.taskId,
          "stage" to progress.stage,
          "completed" to progress.completed.toInt(),
          "total" to progress.total.toInt(),
        )
      }
    }

    Function("cancelSyncTask") { taskId: String ->
      cancelSyncTask(taskId)
    }

    Function("releaseSyncTask") { taskId: String ->
      releaseSyncTask(taskId)
    }

    AsyncFunction("syncLibrarySidecar") {
        taskId: String,
        sidecarRootPath: String,
        libraryRootPath: String,
        nowMs: String,
        mode: String,
        storageJson: String ->
      componentCall {
        val result = syncLibrarySidecar(
          taskId,
          sidecarRootPath,
          libraryRootPath,
          nowMs,
          mode,
          storageJson,
        )
        mapOf(
          "pushed" to result.pushed.toInt(),
          "pulled" to result.pulled.toInt(),
        )
      }
    }
  }
}
