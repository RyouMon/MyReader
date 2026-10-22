import Foundation
import ExpoModulesCore
import ReadiumNavigator
import ReadiumShared
import ReadiumZIPFoundation
import Testing
import UIKit
import XCTest
import WebKit
@testable import Readium

// UIKit and WebKit tests share the app foreground window. Serializing each
// child suite separately still lets those suites replace one another's window.
@Suite(.serialized)
struct ReaderWindowTests {}

extension ReaderWindowTests {
  @Suite
  @MainActor
  struct ReaderStartLocationTests {
    private let positions = [
      Locator(href: AnyURL(string: "chapter-1.xhtml")!, mediaType: .xhtml,
              locations: .init(progression: 0, totalProgression: 0, position: 1)),
      Locator(href: AnyURL(string: "chapter-2.xhtml")!, mediaType: .xhtml,
              locations: .init(progression: 0, totalProgression: 0.5, position: 2)),
    ]

    private func publication(positions: [Locator], metadata: Metadata = Metadata()) -> Publication {
      Publication(
        manifest: Manifest(metadata: metadata, readingOrder: positions.map {
          Link(href: $0.href.string, mediaType: $0.mediaType)
        }),
        servicesBuilder: .init(positions: InMemoryPositionsService.makeFactory(
          positionsByReadingOrder: positions.map { [$0] }
        ))
      )
    }

    private func reader(_ stored: Locator?, publication: Publication) async throws -> ReaderViewController {
      try #require(await ReaderModule(delegate: nil).getViewController(
        for: publication, bookId: "resume", locator: stored, preferences: nil,
        selectionActions: nil, fontFamilyDeclarations: []
      ))
    }

    @Test(arguments: [
      "chapter-2.xhtml",
      "/chapter-2.xhtml",
      "file:///desktop/book/chapter-2.xhtml",
    ])
    func resolvesSyncedEPUBResourceBeforeCreatingNavigator(href: String) async throws {
      let stored = positions[1].copy(
        href: AnyURL(string: href)!,
        locations: {
          $0.progression = 0.42
          $0.otherLocations["cssSelector"] = "#saved-paragraph"
        },
        text: { $0.highlight = "Saved text" }
      )
      let reader = try await reader(stored, publication: publication(positions: positions))

      #expect(reader.navigator.currentLocation == stored.copy(href: positions[1].href))
      #expect(!reader.isViewLoaded)
    }

    @Test
    func keepsFragmentAnchorsWhenNormalizingResourcePaths() async throws {
      let stored = positions[1].copy(href: AnyURL(string: "/chapter-2.xhtml#saved-paragraph")!)
      let reader = try await reader(stored, publication: publication(positions: positions))
      #expect(reader.navigator.currentLocation?.href == positions[1].href)
      #expect(reader.navigator.currentLocation?.locations.fragments == ["saved-paragraph"])
    }

    @Test
    func latePublicationLanguageDoesNotReplaceThePendingResumeAnchor() async throws {
      let reader = try await reader(positions[1], publication: publication(
        positions: positions, metadata: Metadata(languages: ["en"])
      ))
      let navigator = try #require(reader.navigator as? EPUBNavigatorViewController)
      let transitions: [(String?, String?, Bool)] = [
        (nil, "en", false), ("en", nil, false), (nil, "fr", true), ("fr", "en", true),
      ]
      for (before, after, changesLayout) in transitions {
        let previous = PreferencesRecord()
        previous.language = before
        let next = PreferencesRecord()
        next.language = after
        #expect(ReadiumView.preferencesRequireViewportPreservation(
          from: previous, to: next, navigator: navigator
        ) == changesLayout)
      }
    }

    @Test
    func explicitLanguageCanChangeTheEffectiveReadingDirection() async throws {
      let reader = try await reader(positions[1], publication: publication(
        positions: positions, metadata: Metadata(languages: ["en"], readingProgression: .rtl)
      ))
      let next = PreferencesRecord()
      next.language = "en"
      #expect(ReadiumView.preferencesRequireViewportPreservation(
        from: PreferencesRecord(), to: next,
        navigator: reader.navigator as? EPUBNavigatorViewController
      ))
    }

    @Test(arguments: [false, true])
    func keepsSyncedAnchorDuringInitialLayout(busyWebKit: Bool) async throws {
      let fixtures = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().appendingPathComponent("e2e/fixtures/tts-book")
      let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
      let contents = temporary.appendingPathComponent("contents")
      let book = temporary.appendingPathComponent("book.epub")
      try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
      defer { try? FileManager.default.removeItem(at: temporary) }
      try FileManager.default.copyItem(at: fixtures, to: contents)
      if busyWebKit {
        let page = contents.appendingPathComponent("EPUB/playback-position.xhtml")
        let html = try String(contentsOf: page, encoding: .utf8)
        let script = """
          <script><![CDATA[
            window.addEventListener('load', () => setTimeout(() => {
              const deadline = performance.now() + 1200;
              while (performance.now() < deadline) {}
              window.readerTestBusyFinished = true;
            }, 100));
          ]]></script>
          """
        try html.replacingOccurrences(of: "</head>", with: script + "</head>")
          .write(to: page, atomically: true, encoding: .utf8)
      }
      try Data("application/epub+zip".utf8).write(to: contents.appendingPathComponent("mimetype"))
      try await FileManager.default.zipItem(at: contents, to: book, shouldKeepParent: false)

      let window = try #require(UIApplication.shared.delegate?.window ?? nil)
      let previousRoot = window.rootViewController
      let host = UIViewController()
      window.rootViewController = host
      window.makeKeyAndVisible()
      let view = ReadiumView(appContext: AppContext())
      view.frame = CGRect(x: 0, y: 0, width: 402, height: 840)
      host.view.addSubview(view)
      defer {
        view.cleanup()
        view.removeFromSuperview()
        window.rootViewController = previousRoot
      }
      let selector = "html > body > p:nth-of-type(2)"
      let locations = LocatorLocationsRecord()
      locations.cssSelector = selector
      locations.domRange = ["start": ["cssSelector": selector, "textNodeIndex": 0, "charOffset": 375]]
      locations.position = 3
      locations.progression = 1.0 / 3
      locations.totalProgression = 0.3888888888888889
      let text = LocatorTextRecord()
      text.before = "when to continue the journey, ke"
      text.highlight = "e"
      text.after = "ping this entire description tog"
      let stored = LocatorRecord()
      stored.href = "EPUB/playback-position.xhtml"
      stored.type = "application/xhtml+xml"
      stored.locations = locations
      stored.text = text
      let file = ReadiumFileRecord()
      file.url = book.absoluteString
      file.initialLocation = stored
      view.file = file
      let preferences = PreferencesRecord()
      preferences.theme = "sepia"
      preferences.fontSize = 18.0 / 16
      preferences.lineHeight = 1.85
      preferences.pageMargins = 0.8
      preferences.scroll = false
      preferences.publisherStyles = false
      view.preferences = preferences
      view.selectionActions = []
      view.customSelectionMenu = false
      view.fontFamilyDeclarations = []
      for _ in 0..<200 {
        if host.children.first is EPUBViewController { break }
        try await Task.sleep(nanoseconds: 25_000_000)
      }
      let reader = try #require(host.children.first as? EPUBViewController)
      let viewportReady = XCTestExpectation(description: "Readium published its initial viewport")
      let onViewportChange = reader.onViewportChange
      var receivedViewport = reader.epubNavigator.viewport?.resources.isEmpty == false
      if receivedViewport { viewportReady.fulfill() }
      reader.onViewportChange = { viewport in
        onViewportChange?(viewport)
        guard !receivedViewport, viewport?.resources.isEmpty == false else { return }
        receivedViewport = true
        viewportReady.fulfill()
      }
      defer { reader.onViewportChange = onViewportChange }
      var reportedProgressions: [Double] = []
      let subscription = reader.publisher.sink { locator in
        if let progression = locator.locations.progression {
          reportedProgressions.append(progression)
        }
      }
      defer { subscription.cancel() }
      let localized = PreferencesRecord()
      localized.theme = "sepia"
      localized.fontSize = 18.0 / 16
      localized.lineHeight = 1.85
      localized.pageMargins = 0.8
      localized.scroll = false
      localized.publisherStyles = false
      localized.language = "en"
      view.preferences = localized
      let result = await XCTWaiter.fulfillment(of: [viewportReady], timeout: 15)
      try #require(result == .completed)
      try #require(reader.epubNavigator.viewport?.resources.isEmpty == false)
      let visible = await reader.epubNavigator.evaluateJavaScript("""
        (() => {
          const rect = document.querySelector('\(selector)').getBoundingClientRect();
          const previous = document.querySelector('body > p:first-of-type').getBoundingClientRect();
          return rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 0 && rect.top < window.innerHeight && previous.right <= 0;
        })()
        """)
      #expect(try visible.get() as? Bool == true)
      if busyWebKit {
        let busyFinished = await reader.epubNavigator.evaluateJavaScript("window.readerTestBusyFinished === true")
        try #require(try busyFinished.get() as? Bool == true)
      }
      #expect(!reportedProgressions.isEmpty)
      #expect(reportedProgressions.allSatisfy { $0 > 0 }, "Startup must not persist the first page before restoring the saved anchor: \(reportedProgressions)")
    }

    @Test(arguments: [false, true], [
      ("1", false), ("2", false), ("1", true), ("2", true),
    ])
    func restoresSyncedTextAnchorInFreshNavigator(
      delayedFirstFrame: Bool, layout: (columnCount: String, resizesDuringLoad: Bool)
    ) async throws {
      let (columnCount, resizesDuringLoad) = layout
      let fixture = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent()
        .appendingPathComponent("e2e/fixtures/tts-book/EPUB/playback-position.xhtml")
      let href = AnyURL(string: "EPUB/playback-position.xhtml")!
      let html = try Data(contentsOf: fixture)
      let publication = Publication(
        manifest: Manifest(metadata: Metadata(languages: ["en"]), readingOrder: [Link(href: href.string, mediaType: .xhtml)]),
        container: SingleResourceContainer(resource: DataResource(data: html), at: href)
      )
      let selector = columnCount == "1" ? "html > body > p:nth-of-type(2)" : "html > body > section > h2"
      let stored = Locator(
        href: href, mediaType: .xhtml,
        locations: .init(progression: columnCount == "1" ? 1.0 / 3 : 0.5, otherLocations: [
          "cssSelector": .string(selector),
          "domRange": ["start": ["cssSelector": .string(selector), "textNodeIndex": 0, "charOffset": 0]],
        ]),
        text: columnCount == "1"
          ? .init(after: "atest narration second page, whe", highlight: "L")
          : .init(after: "ser viewport third page heading.", highlight: "U")
      )
      let preferences = PreferencesRecord()
      preferences.fontSize = 18.0 / 16
      preferences.lineHeight = 1.85
      preferences.pageMargins = 0.8
      preferences.scroll = false
      preferences.publisherStyles = false
      preferences.columnCount = columnCount
      let controller = try #require(await ReaderModule(delegate: nil).getViewController(
        for: publication, bookId: "fresh-resume", locator: stored, preferences: preferences,
        selectionActions: nil, fontFamilyDeclarations: []
      ) as? EPUBViewController)
      // Navigation can resize the reader after the document loads but before
      // ResizeObserver updates pagination. Restore through the real Readium
      // locator path while controlling that initial layout transition.
      let delegate = DelayedPaginationDelegate()
      delegate.delayResize = delayedFirstFrame
      let viewportReady = XCTestExpectation(description: "Readium published its initial viewport")
      delegate.onViewportReady = { viewportReady.fulfill() }
      controller.epubNavigator.delegate = delegate
      let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 1032, height: 1376))
      delegate.onLoad = { [weak window, weak controller] in
        guard resizesDuringLoad, let window, let controller else { return }
        window.frame = CGRect(x: 0, y: 0, width: 402, height: 786)
        controller.view.frame = window.bounds
        controller.view.layoutIfNeeded()
      }
      window.rootViewController = controller
      window.makeKeyAndVisible()
      defer { window.isHidden = true }
      let result = await XCTWaiter.fulfillment(of: [viewportReady], timeout: 15)
      try #require(result == .completed)
      var paginationReady = !delayedFirstFrame
      for _ in 0..<100 {
        try #require(window.isKeyWindow, "Another native test took the reader window")
        if delayedFirstFrame,
           case let .success(value) = await controller.epubNavigator.evaluateJavaScript("window.readerTestPaginationReady === true") {
          paginationReady = value as? Bool == true
        }
        if controller.epubNavigator.viewport?.resources.isEmpty == false && paginationReady { break }
        try await Task.sleep(nanoseconds: 50_000_000)
      }
      try #require(controller.epubNavigator.viewport?.resources.isEmpty == false)
      try #require(paginationReady)
      try #require(delegate.configured)
      let visible = await controller.epubNavigator.evaluateJavaScript("""
        (() => {
          const rect = document.querySelector('\(selector)').getBoundingClientRect();
          const previous = document.querySelector('body > p:first-of-type').getBoundingClientRect();
          return {
            visible: rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 0 && rect.top < window.innerHeight && previous.right <= 0,
            viewport: [window.innerWidth, window.innerHeight, window.scrollX, window.scrollY],
            target: rect.toJSON(),
            first: previous.toJSON(),
            content: [document.scrollingElement.scrollWidth, document.scrollingElement.scrollHeight]
          };
        })()
        """)
      let geometry = try #require(try visible.get() as? [String: Any])
      #expect(geometry["visible"] as? Bool == true, "Restored page geometry: \(geometry)")
    }

    @Test
    func capturesThePreservedBookmarkWhileFontReloadReplacesTheNavigator() async throws {
      let fixtures = URL(fileURLWithPath: #filePath)
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().deletingLastPathComponent()
        .deletingLastPathComponent().appendingPathComponent("e2e/fixtures/tts-book")
      let temporary = FileManager.default.temporaryDirectory.appendingPathComponent(UUID().uuidString)
      let contents = temporary.appendingPathComponent("contents")
      let book = temporary.appendingPathComponent("book.epub")
      try FileManager.default.createDirectory(at: temporary, withIntermediateDirectories: true)
      defer { try? FileManager.default.removeItem(at: temporary) }
      try FileManager.default.copyItem(at: fixtures, to: contents)
      try Data("application/epub+zip".utf8).write(to: contents.appendingPathComponent("mimetype"))
      try await FileManager.default.zipItem(at: contents, to: book, shouldKeepParent: false)

      let window = try #require(UIApplication.shared.delegate?.window ?? nil)
      let previousRoot = window.rootViewController
      let host = UIViewController()
      window.rootViewController = host
      window.makeKeyAndVisible()
      let context = AppContext()
      let view = ReadiumView(appContext: context)
      view.frame = window.bounds
      host.view.addSubview(view)
      defer {
        view.cleanup()
        view.removeFromSuperview()
        window.rootViewController = previousRoot
      }
      let preferences = PreferencesRecord()
      preferences.fontFamily = "serif"
      preferences.columnCount = "1"
      view.preferences = preferences
      view.selectionActions = []
      view.customSelectionMenu = false
      view.fontFamilyDeclarations = []
      let file = ReadiumFileRecord()
      file.url = book.absoluteString
      view.file = file
      for _ in 0..<200 {
        if let reader = host.children.first as? EPUBViewController,
           reader.epubNavigator.viewport?.resources.isEmpty == false { break }
        try await Task.sleep(nanoseconds: 25_000_000)
      }
      let reader = try #require(host.children.first as? EPUBViewController)
      let original = try #require(await view.getBookmarkLocator())
      let next = PreferencesRecord()
      next.fontFamily = "sans-serif"
      next.columnCount = "1"
      view.preferences = next
      // Observe the real replacement boundary, before the new navigator has
      // loaded its spread. Saving/closing must use the anchor already captured
      // for this transaction instead of waiting on a disposable WebView.
      for _ in 0..<200 {
        if reader.parent == nil { break }
        try await Task.sleep(nanoseconds: 5_000_000)
      }
      try #require(reader.parent == nil)
      let captured = XCTestExpectation(description: "Bookmark captured during font reload")
      var bookmark: [String: Any]?
      let capture = Task { @MainActor in
        bookmark = await view.getBookmarkLocator()
        captured.fulfill()
      }
      defer { capture.cancel() }
      let result = await XCTWaiter.fulfillment(of: [captured], timeout: 1)
      try #require(result == .completed)
      let saved = try #require(bookmark)
      #expect(saved["href"] as? String == original["href"] as? String)
      #expect(NSDictionary(dictionary: saved["locations"] as? [String: Any] ?? [:]) ==
        NSDictionary(dictionary: original["locations"] as? [String: Any] ?? [:]))
      #expect(NSDictionary(dictionary: saved["text"] as? [String: Any] ?? [:]) ==
        NSDictionary(dictionary: original["text"] as? [String: Any] ?? [:]))
    }

    @Test
    func usesStoredPositionWhenResourceNamesDifferAcrossDevices() async throws {
      let stored = positions[1].copy(
        href: AnyURL(string: "another-engine/chapter.xhtml")!,
        text: { $0.highlight = "An anchor from a different resource" }
      )
      let reader = try await reader(stored, publication: publication(positions: positions))
      #expect(reader.navigator.currentLocation == positions[1])
    }

    @Test
    func usesReadiumProgressionResolutionWhenNoPositionMatches() async throws {
      let stored = Locator(
        href: AnyURL(string: "another-engine/chapter.xhtml")!, mediaType: .xhtml,
        locations: .init(totalProgression: 0.75, position: 999)
      )
      let reader = try await reader(stored, publication: publication(positions: positions))
      #expect(reader.navigator.currentLocation?.href == positions[1].href)
      #expect(reader.navigator.currentLocation?.locations.progression == 0.5)
      #expect(reader.navigator.currentLocation?.locations.totalProgression == 0.75)
    }

    @Test
    func opensAtBeginningWithoutAUsableSavedLocation() async throws {
      let unknown = Locator(href: AnyURL(string: "missing.xhtml")!, mediaType: .xhtml)
      for stored in [nil, unknown] {
        let reader = try await reader(stored, publication: publication(positions: positions))
        #expect(reader.navigator.currentLocation == nil)
      }
    }

    @Test
    func normalizesCBZImagePathsBeforeCreatingNavigator() async throws {
      let positions = (1...3).map { (position: Int) in
        Locator(href: AnyURL(string: "images/\(position).jpg")!, mediaType: .jpeg,
                locations: .init(position: position))
      }
      let publication = Publication(
        manifest: Manifest(
          metadata: Metadata(conformsTo: [.divina], layout: .fixed),
          readingOrder: positions.map { Link(href: $0.href.string, mediaType: .jpeg) }
        ),
        servicesBuilder: .init(positions: InMemoryPositionsService.makeFactory(
          positionsByReadingOrder: positions.map { [$0] }
        ))
      )
      let stored = positions[2].copy(href: AnyURL(string: "file:///android/book/images/3.jpg")!)
      let reader = try await reader(stored, publication: publication)
      #expect(reader.navigator.currentLocation == positions[2])
    }

    @Test(arguments: [true, false])
    func opensPDFAtSavedPageWithoutCallingGoTo(usePosition: Bool) async throws {
      let file = FileManager.default.temporaryDirectory.appendingPathComponent("\(UUID().uuidString).pdf")
      defer { try? FileManager.default.removeItem(at: file) }
      try UIGraphicsPDFRenderer(bounds: CGRect(x: 0, y: 0, width: 300, height: 400))
        .writePDF(to: file) { context in
          for _ in 0..<3 { context.beginPage() }
        }
      let stored = Locator(
        href: AnyURL(string: "desktop/renamed.pdf")!, mediaType: .pdf,
        locations: .init(totalProgression: usePosition ? nil : 0.9, position: usePosition ? 3 : nil)
      )
      let service = ReaderService()
      let opened = XCTestExpectation(description: "PDF opened at its saved location")
      var controller: ReaderViewController?
      service.buildViewController(
        url: file.absoluteString, bookId: "pdf-resume", locator: stored,
        preferences: nil, selectionActions: nil, fontFamilyDeclarations: [], sender: nil
      ) {
        controller = $0
        opened.fulfill()
      }
      let result = await XCTWaiter.fulfillment(of: [opened], timeout: 15)
      try #require(result == .completed)
      let reader = try #require(controller as? PDFViewController)
      reader.view.frame = CGRect(x: 0, y: 0, width: 400, height: 600)
      reader.view.layoutIfNeeded()
      for _ in 0..<100 {
        if reader.navigator.currentLocation?.locations.position == 3 { break }
        try await Task.sleep(nanoseconds: 50_000_000)
      }
      #expect(reader.navigator.currentLocation?.locations.position == 3)
      let pdfView = try #require(reader.pdfNavigator.pdfView)
      let page = try #require(pdfView.currentPage)
      #expect(pdfView.document?.index(for: page) == 2)
    }
  }
}

@MainActor
private final class DelayedPaginationDelegate: NSObject, EPUBNavigatorDelegate, WKScriptMessageHandler {
  var configured = false
  var delayResize = true
  var onLoad: (() -> Void)?
  var onViewportReady: (() -> Void)?

  func navigator(_ navigator: any ViewportObservingNavigator, viewportDidChange viewport: NavigatorViewport?) {
    guard viewport?.resources.isEmpty == false else { return }
    onViewportReady?()
    onViewportReady = nil
  }

  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    onLoad?()
  }
  func navigator(_ navigator: Navigator, presentError error: NavigatorError) {
    Issue.record("Readium navigation failed: \(error)")
  }

  func navigator(_ navigator: EPUBNavigatorViewController, setupUserScripts controller: WKUserContentController) {
    configured = true
    controller.add(self, name: "readerTestLoaded")
    controller.addUserScript(WKUserScript(source: """
      window.addEventListener('load', () => window.webkit.messageHandlers.readerTestLoaded.postMessage({}));
      """, injectionTime: .atDocumentStart, forMainFrameOnly: false))
    guard delayResize else { return }
    controller.addUserScript(WKUserScript(source: """
      const Observer = window.ResizeObserver;
      window.ResizeObserver = class extends Observer {
        constructor(callback) {
          super((entries, observer) => setTimeout(() => {
            callback(entries, observer);
            if (entries.some(entry => entry.target === document.body)) {
              requestAnimationFrame(() => { window.readerTestPaginationReady = true; });
            }
          }, 1000));
        }
      };
      """, injectionTime: .atDocumentStart, forMainFrameOnly: false))
  }
}
