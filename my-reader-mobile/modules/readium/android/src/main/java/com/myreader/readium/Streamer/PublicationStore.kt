package com.myreader.readium.Streamer

import com.myreader.readium.Search.SearchSessionStore
import org.readium.r2.shared.publication.Publication

/**
 * id+handle registry for stateful `Publication` objects (REP-003).
 *
 * JS holds a `publicationId` (the file URL) received from `onPublicationReady`
 * and passes it to module functions (`getPublicationSnapshot`, `getContent`,
 * `search`). Native resolves the id back to the live `Publication` here.
 */
object PublicationStore {
  private val lock = Any()
  private val store = mutableMapOf<String, Publication>()

  fun set(id: String, publication: Publication) {
    synchronized(lock) {
      val previous = store[id]
      if (previous != null && previous !== publication) {
        SearchSessionStore.cancelPublication(id)
      }
      store[id] = publication
    }
  }

  fun get(id: String): Publication? = synchronized(lock) { store[id] }

  fun remove(id: String, ifSameAs: Publication? = null) {
    synchronized(lock) {
      val current = store[id]
      if (current != null && (ifSameAs == null || current === ifSameAs)) {
        store.remove(id)
        SearchSessionStore.cancelPublication(id)
      }
    }
  }
}
