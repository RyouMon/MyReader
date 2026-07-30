package com.myreader.rustcomponents

import com.myreader.rustcomponents.uniffi.RustComponentsException
import com.myreader.rustcomponents.uniffi.NativeBookCoverThumbnailCache
import com.myreader.rustcomponents.uniffi.NativeBookCoverThumbnailCachePatch
import com.myreader.rustcomponents.uniffi.NativeDownloadTask
import com.myreader.rustcomponents.uniffi.NativeDownloadedFile
import com.myreader.rustcomponents.uniffi.NativeFileState
import com.myreader.rustcomponents.uniffi.NativeFileStateUpdate
import com.myreader.rustcomponents.uniffi.NativeReaderAnnotation
import com.myreader.rustcomponents.uniffi.NativeReaderBookmark
import com.myreader.rustcomponents.uniffi.NativeReadingPosition
import com.myreader.rustcomponents.uniffi.NativeReadingPositionCandidate
import com.myreader.rustcomponents.uniffi.NativeReadingStatistics
import com.myreader.rustcomponents.uniffi.addReadingCompletion
import com.myreader.rustcomponents.uniffi.addReadingSessionInterval
import com.myreader.rustcomponents.uniffi.beginCoordinatedSync
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
import com.myreader.rustcomponents.uniffi.createSyncCoordinator
import com.myreader.rustcomponents.uniffi.deleteBookCoverThumbnailCache
import com.myreader.rustcomponents.uniffi.deleteLibraryFileState
import com.myreader.rustcomponents.uniffi.disposeSyncCoordinator
import com.myreader.rustcomponents.uniffi.effectiveCoordinatedSyncExecution
import com.myreader.rustcomponents.uniffi.failCoordinatedSync
import com.myreader.rustcomponents.uniffi.failDownloadTask
import com.myreader.rustcomponents.uniffi.findActiveDownloadTask
import com.myreader.rustcomponents.uniffi.flushCoordinatedSync
import com.myreader.rustcomponents.uniffi.getLibraryFileState
import com.myreader.rustcomponents.uniffi.getReadingStatistics
import com.myreader.rustcomponents.uniffi.finalizeDownloadedFile
import com.myreader.rustcomponents.uniffi.getReadingPosition
import com.myreader.rustcomponents.uniffi.invokeCoreAsync
import com.myreader.rustcomponents.uniffi.invokeCoreSync
import com.myreader.rustcomponents.uniffi.listBookCoverThumbnailCache
import com.myreader.rustcomponents.uniffi.listBookReadingFormats
import com.myreader.rustcomponents.uniffi.listFavoriteBookIds
import com.myreader.rustcomponents.uniffi.listDownloadTasks
import com.myreader.rustcomponents.uniffi.listLibraryFileStates
import com.myreader.rustcomponents.uniffi.markLibraryFileRemoteOnly
import com.myreader.rustcomponents.uniffi.markDownloadTaskStarted
import com.myreader.rustcomponents.uniffi.listReadingPositionCandidates
import com.myreader.rustcomponents.uniffi.listReadingPositions
import com.myreader.rustcomponents.uniffi.listReaderBookmarks
import com.myreader.rustcomponents.uniffi.listReaderAnnotations
import com.myreader.rustcomponents.uniffi.migrateLibraryDatabase
import com.myreader.rustcomponents.uniffi.removeReaderBookmark
import com.myreader.rustcomponents.uniffi.removeReaderAnnotation
import com.myreader.rustcomponents.uniffi.readSyncTaskProgress
import com.myreader.rustcomponents.uniffi.recoverCoordinatedSync
import com.myreader.rustcomponents.uniffi.releaseSyncTask
import com.myreader.rustcomponents.uniffi.releaseDownloadTask
import com.myreader.rustcomponents.uniffi.reportDownloadTaskProgress
import com.myreader.rustcomponents.uniffi.requestCoordinatedPull
import com.myreader.rustcomponents.uniffi.requestCoordinatedSync
import com.myreader.rustcomponents.uniffi.setCoordinatedSyncLibraryOnline
import com.myreader.rustcomponents.uniffi.syncContractVersion
import com.myreader.rustcomponents.uniffi.syncLibrarySidecar
import com.myreader.rustcomponents.uniffi.coreContractVersion
import com.myreader.rustcomponents.uniffi.setBookReadingFormat
import com.myreader.rustcomponents.uniffi.setFavoriteBook
import com.myreader.rustcomponents.uniffi.setReadingPosition
import com.myreader.rustcomponents.uniffi.selectReadingPositionCandidate
import com.myreader.rustcomponents.uniffi.upsertBookCoverThumbnailCache
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

class MyReaderRustComponentsModule : Module() {
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
    defineTransportFunctions()
    defineDatabaseFunctions()
    defineContentFunctions()
    defineFileFunctions()
    defineFavoriteFunctions()
    defineReadingPositionFunctions()
    defineAnnotationFunctions()
    defineDownloadFunctions()
    defineSyncFunctions()
  }

  private fun ModuleDefinitionBuilder.defineTransportFunctions() {
    Function("coreContractVersion") {
      coreContractVersion()
    }
    Function("invokeCoreSync") { requestJson: String ->
      componentCall {
        invokeCoreSync(requestJson)
      }
    }
    AsyncFunction("invokeCoreAsync") { requestJson: String ->
      componentCall {
        invokeCoreAsync(requestJson)
      }
    }
  }

  private fun ModuleDefinitionBuilder.defineDatabaseFunctions() {
    AsyncFunction("migrateLibraryDatabase") { databasePath: String ->
      componentCall {
        migrateLibraryDatabase(databasePath)
      }
    }
  }

  private fun ModuleDefinitionBuilder.defineContentFunctions() {
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
