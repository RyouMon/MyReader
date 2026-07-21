import ExpoModulesCore
import ReadiumShared
import UIKit

/// Native `Readium` Expo Module.
///
/// Exposes the `ReadiumView` (props + events) and the open-architecture
/// extension points (REP-003~009): view-tag-based imperative navigation,
/// Streamer/opener configuration, custom format registration, Publication
/// handle operations (snapshot + content iteration), and the Search API. See
/// `src/ReadiumModule.ts` for the JS contract.
public final class ReadiumModule: Module {
  public func definition() -> ModuleDefinition {
    Name("Readium")

    View(ReadiumView.self) {
      Events(
        "onLocationChange",
        "onPublicationReady",
        "onDecorationActivated",
        "onSelectionChange",
        "onSelectionAction",
        "onTap"
      )

      Prop("file") { (view: ReadiumView, file: ReadiumFileRecord?) in
        view.file = file
      }
      Prop("preferences") { (view: ReadiumView, preferences: PreferencesRecord?) in
        view.preferences = preferences
      }
      Prop("fontFamilyDeclarations") { (view: ReadiumView, declarations: [FontFamilyDeclarationRecord]?) in
        view.fontFamilyDeclarations = declarations
      }
      Prop("decorations") { (view: ReadiumView, groups: [DecorationGroupRecord]?) in
        view.decorations = groups
      }
      Prop("selectionActions") { (view: ReadiumView, actions: [SelectionActionRecord]?) in
        view.selectionActions = actions
      }
      Prop("selectionMenu") { (view: ReadiumView, menu: SelectionMenuRecord?) in
        view.selectionMenu = menu
      }
      Prop("customSelectionMenu") { (view: ReadiumView, enabled: Bool) in
        view.customSelectionMenu = enabled
      }
    }

    // MARK: - Imperative navigation (view-tag based)

    AsyncFunction("goTo") { (tag: Int, locator: LocatorRecord) in
      ReadiumView.registry[tag]?.goTo(locator: locator)
    }
    AsyncFunction("goForward") { (tag: Int) in
      ReadiumView.registry[tag]?.goForward()
    }
    AsyncFunction("goBackward") { (tag: Int) in
      ReadiumView.registry[tag]?.goBackward()
    }
    AsyncFunction("clearSelection") { (tag: Int) in
      ReadiumView.registry[tag]?.clearSelection()
    }
    AsyncFunction("getBookmarkLocator") { (tag: Int, promise: Promise) in
      Task { @MainActor in
        promise.resolve(await ReadiumView.registry[tag]?.getBookmarkLocator())
      }
    }
    AsyncFunction("isBookmarkVisible") { (tag: Int, locator: LocatorRecord, promise: Promise) in
      Task { @MainActor in
        let visible = await ReadiumView.registry[tag]?.isBookmarkVisible(locator: locator) ?? false
        promise.resolve(visible)
      }
    }

    // MARK: - Streamer / opener configuration (REP-005/006)

    AsyncFunction("configure") { (config: PublicationOpenerConfigRecord) in
      StreamerConfig.shared.apply(config)
    }
    AsyncFunction("registerFormat") { (registration: FormatRegistrationRecord) in
      StreamerConfig.shared.registerFormat(registration)
    }

    // MARK: - Publication handle operations (REP-003/004)

    AsyncFunction("getPublicationSnapshot") { (id: String, promise: Promise) in
      guard let publication = PublicationStore.shared.get(id) else {
        promise.reject("ERR_PUBLICATION_NOT_FOUND", "Publication not found for id: \(id)")
        return
      }
      Task {
        let tocResult = await publication.tableOfContents()
        let positionsResult = await publication.positions()

        let toc = (try? tocResult.get()).map { flattenLinksToDicts($0) } ?? []
        let positions = (try? positionsResult.get()).map { $0.map { locatorToDict($0) } } ?? []
        let readingOrder = flattenLinksToDicts(publication.readingOrder)
        let metadata = metadataToDict(publication.metadata)

        promise.resolve([
          "metadata": metadata,
          "tableOfContents": toc,
          "readingOrder": readingOrder,
          "positions": positions,
        ] as [String: Any])
      }
    }

    AsyncFunction("getContent") { (id: String, fromLocator: LocatorRecord?, promise: Promise) in
      guard let publication = PublicationStore.shared.get(id) else {
        promise.reject("ERR_PUBLICATION_NOT_FOUND", "Publication not found for id: \(id)")
        return
      }
      let start = fromLocator.flatMap { locatorRecordToReadium($0) }
      Task {
        let content = publication.content(from: start)
        let elements = await content?.elements() ?? []
        let language = publication.metadata.languages.first

        var utterances: [[String: Any]] = []
        for element in elements {
          guard let text = (element as? TextualContentElement)?.text,
                !text.isEmpty else {
            continue
          }
          var utterance: [String: Any] = [
            "text": text,
            "locator": locatorToDict(element.locator),
          ]
          if let language {
            utterance["language"] = language
          }
          utterances.append(utterance)
        }

        promise.resolve(["utterances": utterances] as [String: Any])
      }
    }

    // MARK: - Search (REP-007)

    AsyncFunction("getSearchCapabilities") { (publicationId: String, promise: Promise) in
      guard let publication = PublicationStore.shared.get(publicationId) else {
        promise.reject(
          "ERR_PUBLICATION_NOT_FOUND",
          "Publication not found for id: \(publicationId)"
        )
        return
      }

      let searchable = isSearchableReflowableEpub(publication)
      promise.resolve([
        "searchable": searchable,
        "options": searchable
          ? searchOptionsToDict(publication.searchOptions)
          : [:] as [String: Any],
      ] as [String: Any])
    }

    AsyncFunction("search") { (publicationId: String, query: String, options: SearchOptionsRecord?, promise: Promise) in
      guard let publication = PublicationStore.shared.get(publicationId) else {
        promise.reject(
          "ERR_PUBLICATION_NOT_FOUND",
          "Publication not found for id: \(publicationId)"
        )
        return
      }
      guard isSearchableReflowableEpub(publication) else {
        promise.reject(
          "ERR_SEARCH_NOT_SEARCHABLE",
          "Publication does not expose an EPUB search service"
        )
        return
      }

      let pending = SearchSessionStore.shared.begin(publicationId: publicationId)
      let nativeOptions = readiumSearchOptions(
        options,
        supported: publication.searchOptions
      )
      let task = Task {
        let result = await publication.search(query: query, options: nativeOptions)

        if Task.isCancelled {
          if case let .success(iterator) = result {
            iterator.close()
          }
          _ = SearchSessionStore.shared.discard(pending)
          rejectSearchCancelled(promise)
          return
        }

        switch result {
        case let .success(iterator):
          guard let session = SearchSessionStore.shared.install(iterator, for: pending) else {
            iterator.close()
            rejectSearchCancelled(promise)
            return
          }

          var response: [String: Any] = ["id": session.id]
          if let resultCount = iterator.resultCount {
            response["resultCount"] = resultCount
          }
          if !session.deliverIfActive({ promise.resolve(response) }) {
            rejectSearchCancelled(promise)
          }

        case let .failure(error):
          guard SearchSessionStore.shared.discard(pending) else {
            rejectSearchCancelled(promise)
            return
          }
          rejectSearchError(error, promise: promise)
        }
      }
      pending.attach(task: task)
    }

    AsyncFunction("searchNext") { (sessionId: String, promise: Promise) in
      guard let session = SearchSessionStore.shared.session(id: sessionId) else {
        promise.reject(
          "ERR_SEARCH_SESSION_NOT_FOUND",
          "Search session not found for id: \(sessionId)"
        )
        return
      }

      let started = session.startNext {
        defer { session.finishNext() }

        let result = await session.iterator.next()
        guard !Task.isCancelled else {
          rejectSearchCancelled(promise)
          return
        }

        switch result {
        case let .success(collection):
          var response: [String: Any] = [
            "locators": collection?.locators.map { locatorToDict($0) } ?? [],
            "done": collection == nil,
          ]
          if let resultCount = session.iterator.resultCount {
            response["resultCount"] = resultCount
          }

          let delivered: Bool
          if collection == nil {
            delivered = session.complete { promise.resolve(response) }
            SearchSessionStore.shared.remove(session)
          } else {
            delivered = session.deliverIfActive { promise.resolve(response) }
          }
          if !delivered {
            rejectSearchCancelled(promise)
          }

        case let .failure(error):
          let delivered = session.complete {
            rejectSearchError(error, promise: promise)
          }
          SearchSessionStore.shared.remove(session)
          if !delivered {
            rejectSearchCancelled(promise)
          }
        }
      }
      if !started {
        promise.reject(
          "ERR_SEARCH_IN_PROGRESS",
          "A search page request is already running or the session is closed"
        )
      }
    }

    AsyncFunction("searchCancel") { (sessionId: String) in
      SearchSessionStore.shared.cancel(sessionId: sessionId)
    }

    OnDestroy {
      SearchSessionStore.shared.cancelAll()
    }
  }
}

private func searchOptionsToDict(
  _ options: ReadiumShared.SearchOptions
) -> [String: Any] {
  var result: [String: Any] = [:]
  if let value = options.caseSensitive { result["caseSensitive"] = value }
  if let value = options.diacriticSensitive { result["diacriticSensitive"] = value }
  if let value = options.wholeWord { result["wholeWord"] = value }
  if let value = options.exact { result["exact"] = value }
  if let value = options.language { result["language"] = value.code.bcp47 }
  if let value = options.regularExpression { result["regularExpression"] = value }
  return result
}

private func isSearchableReflowableEpub(_ publication: Publication) -> Bool {
  publication.conforms(to: .epub)
    && publication.metadata.layout != .fixed
    && publication.isSearchable
}

private func readiumSearchOptions(
  _ requested: SearchOptionsRecord?,
  supported: ReadiumShared.SearchOptions
) -> ReadiumShared.SearchOptions? {
  guard let requested else { return nil }

  return ReadiumShared.SearchOptions(
    caseSensitive: supported.caseSensitive == nil ? nil : requested.caseSensitive,
    diacriticSensitive: supported.diacriticSensitive == nil
      ? nil
      : requested.diacriticSensitive,
    wholeWord: supported.wholeWord == nil ? nil : requested.wholeWord,
    exact: supported.exact == nil ? nil : requested.exact,
    language: supported.language == nil
      ? nil
      : requested.language.map { Language(code: .bcp47($0)) },
    regularExpression: supported.regularExpression == nil
      ? nil
      : requested.regularExpression
  )
}

private func rejectSearchCancelled(_ promise: Promise) {
  promise.reject("ERR_SEARCH_CANCELLED", "Search was cancelled")
}

private func rejectSearchError(_ error: SearchError, promise: Promise) {
  switch error {
  case .publicationNotSearchable:
    promise.reject(
      "ERR_SEARCH_NOT_SEARCHABLE",
      "Publication does not expose a search service"
    )
  case let .badQuery(cause):
    promise.reject("ERR_SEARCH_BAD_QUERY", "Invalid search query: \(cause)")
  case let .reading(cause):
    promise.reject("ERR_SEARCH_READING", "Failed to read publication content: \(cause)")
  }
}
