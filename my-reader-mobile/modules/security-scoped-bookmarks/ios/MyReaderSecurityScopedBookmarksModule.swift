import ExpoModulesCore

public class MyReaderSecurityScopedBookmarksModule: Module {
  private var activeScopedResources = [String: URL]()

  public func definition() -> ModuleDefinition {
    Name("MyReaderSecurityScopedBookmarks")

    AsyncFunction("createBookmarkForDirectoryAsync") { (uriString: String) -> [String: Any] in
      guard let url = URL(string: uriString) else {
        throw InvalidUriException(uriString)
      }

      let bookmarkData = try url.bookmarkData(
        options: .minimalBookmark,
        includingResourceValuesForKeys: nil,
        relativeTo: nil
      )

      return [
        "bookmarkBase64": bookmarkData.base64EncodedString(),
        "resolvedUri": url.absoluteString,
        "stale": false
      ]
    }

    AsyncFunction("startAccessingBookmarkAsync") { (bookmarkBase64: String) -> [String: Any] in
      let resolved = try self.resolveBookmark(bookmarkBase64: bookmarkBase64)
      let didAccess = resolved.url.startAccessingSecurityScopedResource()

      guard didAccess else {
        throw SecurityScopeAccessException()
      }

      self.activeScopedResources[resolved.url.absoluteString] = resolved.url

      return [
        "uri": resolved.url.absoluteString,
        "stale": resolved.stale
      ]
    }

    Function("stopAccessingBookmark") { (uriString: String) in
      guard let url = self.activeScopedResources.removeValue(forKey: uriString) else {
        return
      }

      url.stopAccessingSecurityScopedResource()
    }

    OnDestroy {
      for (_, url) in self.activeScopedResources {
        url.stopAccessingSecurityScopedResource()
      }
      self.activeScopedResources.removeAll()
    }
  }

  private func resolveBookmark(bookmarkBase64: String) throws -> (url: URL, stale: Bool) {
    guard let data = Data(base64Encoded: bookmarkBase64) else {
      throw InvalidBookmarkException()
    }

    var isStale = false
    let url = try URL(
      resolvingBookmarkData: data,
      relativeTo: nil,
      bookmarkDataIsStale: &isStale
    )

    return (url, isStale)
  }
}

internal final class InvalidUriException: GenericException<String>, @unchecked Sendable {
  override var reason: String {
    "Invalid URI: \(param)"
  }
}

internal final class InvalidBookmarkException: Exception, @unchecked Sendable {
  override var reason: String {
    "Invalid security-scoped bookmark data"
  }
}

internal final class SecurityScopeAccessException: Exception, @unchecked Sendable {
  override var reason: String {
    "Unable to start accessing security-scoped resource"
  }
}
