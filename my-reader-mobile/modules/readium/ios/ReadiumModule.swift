import ExpoModulesCore
import ReadiumShared

/// Native `Readium` Expo Module.
///
/// Exposes the `ReadiumView` (props + events) and the open-architecture
/// extension points (REP-003~009): view-tag-based imperative navigation,
/// Streamer/opener configuration, custom format registration, Publication
/// handle operations (snapshot + content iteration), and the reserved Search
/// API. See `src/ReadiumModule.ts` for the JS contract.
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

    // MARK: - Search (REP-007, reserved — Phase 2)

    AsyncFunction("search") { (publicationId: String, query: String, options: SearchOptionsRecord?, promise: Promise) in
      promise.reject("ERR_SEARCH_NOT_IMPLEMENTED", "Search (REP-007) is reserved for Phase 2")
    }
    AsyncFunction("searchNext") { (sessionId: String, promise: Promise) in
      promise.reject("ERR_SEARCH_NOT_IMPLEMENTED", "Search (REP-007) is reserved for Phase 2")
    }
  }
}
