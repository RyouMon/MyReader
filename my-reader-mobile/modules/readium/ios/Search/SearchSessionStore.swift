import Foundation
import ReadiumShared

/// Pending creation of a native search iterator.
final class PendingSearchRequest: @unchecked Sendable {
  let id = UUID().uuidString
  let publicationId: String

  private let lock = NSLock()
  private var task: Task<Void, Never>?
  private var cancelled = false

  init(publicationId: String) {
    self.publicationId = publicationId
  }

  func attach(task: Task<Void, Never>) {
    lock.lock()
    if cancelled {
      lock.unlock()
      task.cancel()
      return
    }
    self.task = task
    lock.unlock()
  }

  func cancel() {
    lock.lock()
    guard !cancelled else {
      lock.unlock()
      return
    }
    cancelled = true
    let task = task
    self.task = nil
    lock.unlock()

    task?.cancel()
  }
}

/// One stateful REP-007 iterator exposed to JavaScript by an opaque id.
final class NativeSearchSession: @unchecked Sendable {
  let id = UUID().uuidString
  let publicationId: String
  let iterator: any SearchIterator

  private let lock = NSLock()
  private var nextTask: Task<Void, Never>?
  private var closed = false

  init(publicationId: String, iterator: any SearchIterator) {
    self.publicationId = publicationId
    self.iterator = iterator
  }

  /// Starts at most one `next()` call at a time for this iterator.
  func startNext(_ operation: @escaping @Sendable () async -> Void) -> Bool {
    lock.lock()
    guard !closed, nextTask == nil else {
      lock.unlock()
      return false
    }
    nextTask = Task { await operation() }
    lock.unlock()
    return true
  }

  func finishNext() {
    lock.lock()
    nextTask = nil
    lock.unlock()
  }

  /// Runs the delivery while cancellation is excluded by the session lock.
  func deliverIfActive(_ delivery: () -> Void) -> Bool {
    lock.lock()
    guard !closed else {
      lock.unlock()
      return false
    }
    delivery()
    lock.unlock()
    return true
  }

  /// Marks the iterator exhausted while delivering its final page.
  func complete(_ delivery: () -> Void) -> Bool {
    lock.lock()
    guard !closed else {
      lock.unlock()
      return false
    }
    closed = true
    delivery()
    lock.unlock()

    iterator.close()
    return true
  }

  func cancel() {
    lock.lock()
    guard !closed else {
      lock.unlock()
      return
    }
    closed = true
    let task = nextTask
    nextTask = nil
    lock.unlock()

    task?.cancel()
    iterator.close()
  }
}

/// Thread-safe ownership and lifecycle for pending and active searches.
final class SearchSessionStore: @unchecked Sendable {
  static let shared = SearchSessionStore()

  private let queue = DispatchQueue(label: "my-reader.readium.search-session-store")
  private var pendingByPublication: [String: PendingSearchRequest] = [:]
  private var sessionsById: [String: NativeSearchSession] = [:]

  private init() {}

  /// Starting a new query invalidates every older query for the publication.
  func begin(publicationId: String) -> PendingSearchRequest {
    queue.sync {
      pendingByPublication.removeValue(forKey: publicationId)?.cancel()

      let staleIds = sessionsById.values
        .filter { $0.publicationId == publicationId }
        .map(\.id)
      for id in staleIds {
        sessionsById.removeValue(forKey: id)?.cancel()
      }

      let pending = PendingSearchRequest(publicationId: publicationId)
      pendingByPublication[publicationId] = pending
      return pending
    }
  }

  func install(
    _ iterator: any SearchIterator,
    for pending: PendingSearchRequest
  ) -> NativeSearchSession? {
    queue.sync {
      guard pendingByPublication[pending.publicationId] === pending else {
        return nil
      }
      pendingByPublication.removeValue(forKey: pending.publicationId)

      let session = NativeSearchSession(
        publicationId: pending.publicationId,
        iterator: iterator
      )
      sessionsById[session.id] = session
      return session
    }
  }

  /// Removes a pending request only when it is still the current query.
  @discardableResult
  func discard(_ pending: PendingSearchRequest) -> Bool {
    queue.sync {
      guard pendingByPublication[pending.publicationId] === pending else {
        return false
      }
      pendingByPublication.removeValue(forKey: pending.publicationId)
      return true
    }
  }

  func session(id: String) -> NativeSearchSession? {
    queue.sync { sessionsById[id] }
  }

  func remove(_ session: NativeSearchSession) {
    queue.sync {
      guard sessionsById[session.id] === session else { return }
      sessionsById.removeValue(forKey: session.id)
    }
  }

  /// Idempotent cancellation by the opaque JavaScript session id.
  func cancel(sessionId: String) {
    queue.sync {
      sessionsById.removeValue(forKey: sessionId)?.cancel()
    }
  }

  func cancel(publicationId: String) {
    queue.sync {
      pendingByPublication.removeValue(forKey: publicationId)?.cancel()

      let staleIds = sessionsById.values
        .filter { $0.publicationId == publicationId }
        .map(\.id)
      for id in staleIds {
        sessionsById.removeValue(forKey: id)?.cancel()
      }
    }
  }

  func cancelAll() {
    queue.sync {
      pendingByPublication.values.forEach { $0.cancel() }
      sessionsById.values.forEach { $0.cancel() }
      pendingByPublication.removeAll()
      sessionsById.removeAll()
    }
  }
}
