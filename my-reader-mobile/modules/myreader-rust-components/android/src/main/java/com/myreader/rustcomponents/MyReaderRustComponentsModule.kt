package com.myreader.rustcomponents

import com.myreader.rustcomponents.uniffi.RustComponentsException
import com.myreader.rustcomponents.uniffi.NativeDownloadTask
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

class MyReaderRustComponentsModule : Module() {
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
        legacyRegistryJson: String? ->
      componentCall {
        initializeDeviceRegistry(registryPath, legacyRegistryJson)
      }
    }

    AsyncFunction("upsertDeviceDataSource") {
        registryPath: String,
        sourceJson: String ->
      componentCall {
        upsertDeviceDataSource(registryPath, sourceJson)
      }
    }

    AsyncFunction("prepareDeviceDataSource") { sourceJson: String ->
      componentCall {
        prepareDeviceDataSource(sourceJson)
      }
    }

    AsyncFunction("validateDeviceDataSource") {
        registryPath: String,
        sourceJson: String ->
      componentCall {
        validateDeviceDataSource(registryPath, sourceJson)
      }
    }

    AsyncFunction("removeDeviceDataSource") {
        registryPath: String,
        dataSourceId: String ->
      componentCall {
        removeDeviceDataSource(registryPath, dataSourceId)
      }
    }

    AsyncFunction("registerDeviceLibrary") {
        registryPath: String,
        libraryJson: String ->
      componentCall {
        registerDeviceLibrary(registryPath, libraryJson)
      }
    }

    AsyncFunction("replaceDeviceLibrary") {
        registryPath: String,
        libraryJson: String ->
      componentCall {
        replaceDeviceLibrary(registryPath, libraryJson)
      }
    }

    AsyncFunction("removeDeviceLibrary") {
        registryPath: String,
        libraryId: String ->
      componentCall {
        removeDeviceLibrary(registryPath, libraryId)
      }
    }

    AsyncFunction("switchDeviceLibrary") {
        registryPath: String,
        libraryId: String ->
      componentCall {
        switchDeviceLibrary(registryPath, libraryId)
      }
    }

    AsyncFunction("addLocalLibrary") {
        registryPath: String,
        requestJson: String ->
      componentCall {
        addLocalLibrary(registryPath, requestJson)
      }
    }

    AsyncFunction("testRemoteDataSource") {
        sourceJson: String,
        credentialJson: String ->
      componentCall {
        testRemoteDataSource(sourceJson, credentialJson)
      }
    }

    AsyncFunction("listRemoteDirectories") {
        registryPath: String,
        dataSourceId: String,
        path: String,
        credentialJson: String ->
      componentCall {
        listRemoteDirectories(
          registryPath,
          dataSourceId,
          path,
          credentialJson,
        )
      }
    }

    AsyncFunction("addRemoteLibrary") {
        registryPath: String,
        requestJson: String,
        credentialJson: String ->
      componentCall {
        addRemoteLibrary(registryPath, requestJson, credentialJson)
      }
    }

    AsyncFunction("refreshRemoteLibrary") {
        registryPath: String,
        libraryId: String,
        localRootPath: String,
        credentialJson: String ->
      componentCall {
        refreshRemoteLibrary(
          registryPath,
          libraryId,
          localRootPath,
          credentialJson,
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
        listCalibreBooks(libraryRootPath)
      }
    }

    AsyncFunction("listCalibreBooksPage") {
        libraryRootPath: String,
        offset: Long,
        limit: Long,
        sortBy: String?,
        search: String? ->
      componentCall {
        listCalibreBooksPage(
          libraryRootPath,
          offset.toULong(),
          limit.toULong(),
          sortBy,
          search,
        )
      }
    }

    AsyncFunction("listCalibreBooksPageByLastRead") {
        libraryRootPath: String,
        sidecarRootPath: String,
        offset: Long,
        limit: Long,
        search: String? ->
      componentCall {
        listCalibreBooksPageByLastRead(
          libraryRootPath,
          sidecarRootPath,
          offset.toULong(),
          limit.toULong(),
          search,
        )
      }
    }

    AsyncFunction("getCalibreBookDetail") {
        libraryRootPath: String,
        bookId: Long ->
      componentCall {
        getCalibreBookDetail(libraryRootPath, bookId)
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
        )
      }
    }

    AsyncFunction("getCalibreLibraryUuid") { libraryRootPath: String ->
      componentCall {
        getCalibreLibraryUuid(libraryRootPath)
      }
    }

    AsyncFunction("listCalibreBookSummaries") { libraryRootPath: String ->
      componentCall {
        listCalibreBookSummaries(libraryRootPath)
      }
    }

    AsyncFunction("listCalibreBookFormats") {
        libraryRootPath: String,
        bookId: Long ->
      componentCall {
        listCalibreBookFormats(libraryRootPath, bookId)
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
        getLibraryFileState(sidecarRootPath, path)
      }
    }

    AsyncFunction("listLibraryFileStates") { sidecarRootPath: String ->
      componentCall {
        listLibraryFileStates(sidecarRootPath)
      }
    }

    AsyncFunction("upsertLibraryFileState") {
        sidecarRootPath: String,
        path: String,
        updateJson: String ->
      componentCall {
        upsertLibraryFileState(sidecarRootPath, path, updateJson)
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
        finalizeDownloadedFile(sidecarRootPath, relativePath, localPath)
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
        )
      }
    }

    AsyncFunction("upsertBookCoverThumbnailCache") {
        sidecarRootPath: String,
        patchJson: String ->
      componentCall {
        upsertBookCoverThumbnailCache(sidecarRootPath, patchJson)
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
        getReadingPosition(sidecarRootPath, bookId, format)
      }
    }

    AsyncFunction("listReadingPositions") { sidecarRootPath: String ->
      componentCall {
        listReadingPositions(sidecarRootPath)
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
        )
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
        listReaderBookmarks(sidecarRootPath, bookId, format)
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
        )
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
        listReaderAnnotations(sidecarRootPath, bookId, format)
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
        )
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
        )
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
        getReadingStatistics(sidecarRootPath, libraryRootPath, startDay, endDay)
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
