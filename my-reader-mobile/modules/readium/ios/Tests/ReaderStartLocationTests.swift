import Foundation
import ReadiumNavigator
import ReadiumShared
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
    func restoresSyncedTextAnchorInFreshNavigator(delayedFirstFrame: Bool) async throws {
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
      let stored = Locator(
        href: href, mediaType: .xhtml,
        locations: .init(progression: 1.0 / 3, otherLocations: [
          "cssSelector": .string("html > body > p:nth-of-type(2)"),
        ]),
        text: .init(after: "atest narration second page, whe", highlight: "L")
      )
      let preferences = PreferencesRecord()
      preferences.fontSize = 18.0 / 16
      preferences.lineHeight = 1.85
      preferences.pageMargins = 0.8
      preferences.scroll = false
      preferences.publisherStyles = false
      preferences.columnCount = "1"
      let controller = try #require(await ReaderModule(delegate: nil).getViewController(
        for: publication, bookId: "fresh-resume", locator: stored, preferences: preferences,
        selectionActions: nil, fontFamilyDeclarations: []
      ) as? EPUBViewController)
      // WebKit can finish loading before its first animation frame when the app
      // opens a reader during a navigation transition. Keep the real Readium
      // locator path, while delaying that first pagination frame deterministically.
      let delegate = DelayedPaginationDelegate()
      if delayedFirstFrame { controller.epubNavigator.delegate = delegate }
      let window = UIWindow(frame: CGRect(x: 0, y: 0, width: 820, height: 1180))
      window.rootViewController = controller
      window.makeKeyAndVisible()
      defer { window.isHidden = true }
      for _ in 0..<100 {
        try #require(window.isKeyWindow, "Another native test took the reader window")
        if controller.epubNavigator.viewport?.resources.isEmpty == false { break }
        try await Task.sleep(nanoseconds: 50_000_000)
      }
      try #require(controller.epubNavigator.viewport?.resources.isEmpty == false)
      if delayedFirstFrame { try #require(delegate.configured) }
      let visible = await controller.epubNavigator.evaluateJavaScript("""
        (() => {
          const rect = document.querySelector('body > p:nth-of-type(2)').getBoundingClientRect();
          const previous = document.querySelector('body > p:first-of-type').getBoundingClientRect();
          return rect.right > 0 && rect.left < window.innerWidth && rect.bottom > 0 && rect.top < window.innerHeight && previous.right <= 0;
        })()
        """)
      #expect(try visible.get() as? Bool == true)
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
private final class DelayedPaginationDelegate: NSObject, EPUBNavigatorDelegate {
  var configured = false
  func navigator(_ navigator: Navigator, presentError error: NavigatorError) {
    Issue.record("Readium navigation failed: \(error)")
  }

  func navigator(_ navigator: EPUBNavigatorViewController, setupUserScripts controller: WKUserContentController) {
    configured = true
    controller.addUserScript(WKUserScript(source: """
      const Observer = window.ResizeObserver;
      window.ResizeObserver = class extends Observer {
        constructor(callback) {
          super((entries, observer) => setTimeout(() => callback(entries, observer), 1000));
        }
      };
      """, injectionTime: .atDocumentStart, forMainFrameOnly: false))
  }
}
