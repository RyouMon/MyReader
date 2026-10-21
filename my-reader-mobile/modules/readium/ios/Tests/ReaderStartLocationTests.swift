import Foundation
import ReadiumNavigator
import ReadiumShared
import Testing
import UIKit
import XCTest
@testable import Readium

@Suite(.serialized)
@MainActor
struct ReaderStartLocationTests {
  private let positions = [
    Locator(href: AnyURL(string: "chapter-1.xhtml")!, mediaType: .xhtml,
            locations: .init(progression: 0, totalProgression: 0, position: 1)),
    Locator(href: AnyURL(string: "chapter-2.xhtml")!, mediaType: .xhtml,
            locations: .init(progression: 0, totalProgression: 0.5, position: 2)),
  ]

  private func publication(positions: [Locator]) -> Publication {
    Publication(
      manifest: Manifest(readingOrder: positions.map {
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
