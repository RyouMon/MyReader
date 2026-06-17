package com.myreader.readium.Streamer

import org.readium.r2.shared.publication.Publication
import java.util.concurrent.ConcurrentHashMap

/**
 * id+handle registry for stateful `Publication` objects (REP-003).
 *
 * JS holds a `publicationId` (the file URL) received from `onPublicationReady`
 * and passes it to module functions (`getPublicationSnapshot`, `getContent`,
 * `search`). Native resolves the id back to the live `Publication` here.
 */
object PublicationStore {
  private val store = ConcurrentHashMap<String, Publication>()

  fun set(id: String, publication: Publication) {
    store[id] = publication
  }

  fun get(id: String): Publication? = store[id]

  fun remove(id: String) {
    store.remove(id)
  }
}
