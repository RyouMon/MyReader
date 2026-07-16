import Foundation
import ReadiumShared

/// id+handle registry for opened `Publication` objects (REP-003/004).
///
/// The id is the `bookId` (= file URL) emitted in `onPublicationReady`. JS
/// holds that id and calls module-level `getPublicationSnapshot`/`getContent`/
/// `search` through it. This avoids Expo SharedObject while keeping the object
/// graph explicit and reachable for TTS content iteration and services.
final class PublicationStore {
  static let shared = PublicationStore()

  private var publications: [String: Publication] = [:]
  private let queue = DispatchQueue(label: "my-reader.readium.publication-store")

  private init() {}

  func set(_ id: String, _ publication: Publication) {
    queue.sync {
      if let previous = publications[id], previous !== publication {
        SearchSessionStore.shared.cancel(publicationId: id)
      }
      publications[id] = publication
    }
  }

  func get(_ id: String) -> Publication? {
    queue.sync { publications[id] }
  }

  func remove(_ id: String, ifSameAs publication: Publication? = nil) {
    queue.sync {
      guard publication == nil || publications[id] === publication else {
        return
      }
      if publications.removeValue(forKey: id) != nil {
        SearchSessionStore.shared.cancel(publicationId: id)
      }
    }
  }
}
