package com.myreader.readium.Search

import java.util.UUID
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.CoroutineStart
import kotlinx.coroutines.Job
import kotlinx.coroutines.launch
import org.readium.r2.shared.ExperimentalReadiumApi
import org.readium.r2.shared.publication.services.search.SearchIterator

internal class PendingSearchRequest(
  val publicationId: String,
) {
  val id: String = UUID.randomUUID().toString()

  private val lock = Any()
  private var job: Job? = null
  private var cancelled = false

  fun attach(job: Job) {
    val cancelNow = synchronized(lock) {
      if (cancelled) {
        true
      } else {
        this.job = job
        false
      }
    }
    if (cancelNow) job.cancel()
  }

  fun cancel() {
    val activeJob = synchronized(lock) {
      if (cancelled) return
      cancelled = true
      job.also { job = null }
    }
    activeJob?.cancel()
  }
}
@OptIn(ExperimentalReadiumApi::class)
internal class NativeSearchSession(
  val publicationId: String,
  val iterator: SearchIterator,
) {
  val id: String = UUID.randomUUID().toString()

  private val lock = Any()
  private var nextJob: Job? = null
  private var closed = false

  /** Starts at most one iterator request at a time. */
  fun startNext(scope: CoroutineScope, operation: suspend () -> Unit): Boolean {
    val job = synchronized(lock) {
      if (closed || nextJob != null) return false
      scope.launch(start = CoroutineStart.LAZY) { operation() }
        .also { nextJob = it }
    }
    job.start()
    return true
  }

  fun finishNext() {
    synchronized(lock) { nextJob = null }
  }

  /** Runs result delivery while cancellation is excluded by the session lock. */
  fun deliverIfActive(delivery: () -> Unit): Boolean = synchronized(lock) {
    if (closed) return false
    delivery()
    true
  }

  /** Marks the iterator exhausted while delivering its final page. */
  fun complete(delivery: () -> Unit): Boolean {
    val completed = synchronized(lock) {
      if (closed) return false
      closed = true
      delivery()
      true
    }
    if (completed) iterator.close()
    return completed
  }

  fun cancel() {
    val activeJob = synchronized(lock) {
      if (closed) return
      closed = true
      nextJob.also { nextJob = null }
    }
    activeJob?.cancel()
    iterator.close()
  }
}

@OptIn(ExperimentalReadiumApi::class)
internal object SearchSessionStore {
  private val lock = Any()
  private val pendingByPublication = mutableMapOf<String, PendingSearchRequest>()
  private val sessionsById = mutableMapOf<String, NativeSearchSession>()

  /** Starting a new query invalidates every older query for the publication. */
  fun begin(publicationId: String): PendingSearchRequest = synchronized(lock) {
    pendingByPublication.remove(publicationId)?.cancel()

    val staleIds = sessionsById.values
      .filter { it.publicationId == publicationId }
      .map { it.id }
    staleIds.forEach { id -> sessionsById.remove(id)?.cancel() }

    PendingSearchRequest(publicationId).also {
      pendingByPublication[publicationId] = it
    }
  }

  fun install(
    iterator: SearchIterator,
    pending: PendingSearchRequest,
  ): NativeSearchSession? = synchronized(lock) {
    if (pendingByPublication[pending.publicationId] !== pending) return null
    pendingByPublication.remove(pending.publicationId)

    NativeSearchSession(pending.publicationId, iterator).also {
      sessionsById[it.id] = it
    }
  }

  /** Removes a pending request only when it is still the current query. */
  fun discard(pending: PendingSearchRequest): Boolean = synchronized(lock) {
    if (pendingByPublication[pending.publicationId] !== pending) return false
    pendingByPublication.remove(pending.publicationId)
    true
  }

  fun session(id: String): NativeSearchSession? = synchronized(lock) {
    sessionsById[id]
  }

  fun remove(session: NativeSearchSession) {
    synchronized(lock) {
      if (sessionsById[session.id] === session) {
        sessionsById.remove(session.id)
      }
    }
  }

  /** Idempotent cancellation by the opaque JavaScript session id. */
  fun cancel(sessionId: String) {
    synchronized(lock) { sessionsById.remove(sessionId)?.cancel() }
  }

  fun cancelPublication(publicationId: String) {
    synchronized(lock) {
      pendingByPublication.remove(publicationId)?.cancel()

      val staleIds = sessionsById.values
        .filter { it.publicationId == publicationId }
        .map { it.id }
      staleIds.forEach { id -> sessionsById.remove(id)?.cancel() }
    }
  }

  fun cancelAll() {
    synchronized(lock) {
      pendingByPublication.values.forEach { it.cancel() }
      sessionsById.values.forEach { it.cancel() }
      pendingByPublication.clear()
      sessionsById.clear()
    }
  }
}
