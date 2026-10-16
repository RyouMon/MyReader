import Foundation
import PDFKit
import ReadiumShared
import Testing
import UIKit
import WebKit
@testable import Readium

@Suite(.serialized)
struct ReaderImageExportTests {
  private let bytes = Data([0xff, 0xd8, 0, 0xfe, 0xff, 0xd9])

  private func publication() -> Publication {
    let links = ["images/1.jpg", "images/2.jpg"].map { Link(href: $0, mediaType: .jpeg) }
    return Publication(
      manifest: Manifest(readingOrder: links, resources: [Link(href: "cover.jpg", mediaType: .jpeg), Link(href: "chapter.xhtml", mediaType: .xhtml)]),
      container: CompositeContainer((links.map(\.href) + ["cover.jpg"]).map {
        SingleResourceContainer(resource: DataResource(data: bytes), at: AnyURL(string: $0)!)
      })
    )
  }

  @Test
  @MainActor
  func exportWorkflowChoosesOriginalVisibleImagesOrRenderedPages() async throws {
    let publication = publication()
    for hrefs in [["images/1.jpg"], ["images/1.jpg", "images/2.jpg"]] {
      let files = try await ReaderImageExport.images(publication: publication, href: nil, position: 1, visibleHrefs: hrefs) {
        Issue.record("CBZ sharing must preserve originals instead of rendering")
        return []
      }
      #expect(files.compactMap { $0["position"] as? Int } == Array(1...hrefs.count))
      for file in files {
        #expect(try Data(contentsOf: URL(string: file["uri"] as! String)!) == bytes)
      }
    }
    let selected = try await ReaderImageExport.images(publication: publication, href: "images/2.jpg", position: 1, visibleHrefs: ["images/1.jpg"]) {
      Issue.record("An explicit image selection must export that original")
      return []
    }
    #expect(selected.count == 1)
    #expect(selected[0]["position"] as? Int == 2)

    // EPUB chapters and PDF (no EPUB viewport hrefs) use the native renderer.
    for hrefs in [["chapter.xhtml"], []] {
      let files = try await ReaderImageExport.images(publication: publication, href: nil, position: 4, visibleHrefs: hrefs) {
        [UIColor.red, .blue].enumerated().map { index, color in
          let image = UIGraphicsImageRenderer(size: CGSize(width: 100, height: 150)).image { context in
            color.setFill()
            context.fill(CGRect(x: 0, y: 0, width: 100, height: 150))
          }
          return (image, 4 + index)
        }
      }
      #expect(files.compactMap { $0["position"] as? Int } == [4, 5])
      let colors = try files.map { file in
        pixel(try #require(UIImage(contentsOfFile: URL(string: file["uri"] as! String)!.path)))
      }
      #expect(colors == [[255, 0, 0, 255], [0, 0, 255, 255]])
    }
    await #expect(throws: (any Error).self) {
      try await ReaderImageExport.images(publication: publication, href: nil, position: 1, visibleHrefs: []) {
        throw NSError(domain: "Unavailable renderer", code: 1)
      }
    }
    await #expect(throws: (any Error).self) {
      try await ReadiumView(appContext: nil).exportImages(href: nil)
    }
  }

  @Test
  @MainActor
  func epubWebKitBridgeAcceptsOnlySelectedPublicationImages() async throws {
    let controller = try EPUBViewController(publication: publication(), locator: nil, bookId: "image-bridge-test")
    let config = WKWebViewConfiguration()
    controller.navigator(controller.epubNavigator, setupUserScripts: config.userContentController)
    try #require(config.userContentController.userScripts.count == 1)
    let webView = WKWebView(frame: CGRect(x: 0, y: 0, width: 200, height: 200), configuration: config)
    let window = UIWindow(frame: webView.bounds)
    window.rootViewController = UIViewController()
    window.rootViewController!.view = webView
    window.makeKeyAndVisible()
    defer { window.isHidden = true }
    var selections: [String] = []
    controller.onImagePress = { selections.append($0) }
    webView.loadHTMLString("<html><body><img src='images/2.jpg'></body></html>", baseURL: URL(string: "https://reader.test/book/"))
    for _ in 0..<100 {
      if !webView.isLoading { break }
      try await Task.sleep(nanoseconds: 50_000_000)
    }
    #expect(!webView.isLoading)
    try await webView.evaluateJavaScript("""
      document.querySelector('img').dispatchEvent(new PointerEvent('pointerdown', {bubbles:true,isPrimary:true,button:0}));
      window.webkit.messageHandlers.readerImage.postMessage({src:'https://reader.test/book/chapter.xhtml'});
      window.webkit.messageHandlers.readerImage.postMessage({src:'https://reader.test/foreign.jpg'});
      window.webkit.messageHandlers.readerImage.postMessage({invalid:'missing source'});
      true;
      """)
    for _ in 0..<100 {
      if !selections.isEmpty { break }
      try await Task.sleep(nanoseconds: 50_000_000)
    }
    #expect(selections == ["images/2.jpg"])
  }

  @Test
  func originalsRetainBytesFormatAndReadingOrderPosition() async throws {
    let publication = publication()
    let first = try await ReaderImageExport.resource("images/2.jpg", publication: publication, position: 99)
    let second = try await ReaderImageExport.resource("images/2.jpg", publication: publication, position: 99)
    let url = try #require(URL(string: first["uri"] as! String))
    #expect(try Data(contentsOf: url) == bytes)
    #expect(first["mimeType"] as? String == "image/jpeg")
    #expect(first["position"] as? Int == 2)
    #expect(first["uri"] as? String != second["uri"] as? String)
    let cover = try await ReaderImageExport.resource("cover.jpg", publication: publication, position: 7)
    #expect(cover["position"] as? Int == 7)
  }

  @Test
  func onlyPublicationImagesCanBeSelectedOrExported() async throws {
    let publication = publication()
    #expect(ReaderImageExport.imageLink(in: publication, source: "https://reader.test/book/images/2.jpg")?.href == "images/2.jpg")
    #expect(ReaderImageExport.imageLink(in: publication, source: "https://reader.test/book/chapter.xhtml") == nil)
    #expect(ReaderImageExport.imageLink(in: publication, source: "https://reader.test/foreign.jpg") == nil)
    for href in ["missing.jpg", "chapter.xhtml"] {
      await #expect(throws: (any Error).self) {
        try await ReaderImageExport.resource(href, publication: publication, position: 1)
      }
    }
  }

  @Test
  func cacheCleanupPreservesRecentExportsAndPreventsPathEscape() throws {
    let old = try ReaderImageExport.write(bytes, name: "old.jpg", mimeType: "image/jpeg", position: 1)
    let oldURL = URL(string: old["uri"] as! String)!
    try FileManager.default.setAttributes([.modificationDate: Date(timeIntervalSinceNow: -90000)], ofItemAtPath: oldURL.deletingLastPathComponent().path)
    let recent = try ReaderImageExport.write(bytes, name: "../../recent.jpg", mimeType: "image/jpeg", position: 2)
    let recentURL = URL(string: recent["uri"] as! String)!
    #expect(!FileManager.default.fileExists(atPath: oldURL.path))
    #expect(recentURL.lastPathComponent == "recent.jpg")
    #expect(recentURL.deletingLastPathComponent().deletingLastPathComponent().lastPathComponent == "reader-images")
    #expect(try Data(contentsOf: recentURL) == bytes)
  }

  @Test
  @MainActor
  func renderedSpreadsKeepBothPagesTheirPositionsAndReadingDirection() async throws {
    let view = UIView(frame: CGRect(x: 0, y: 0, width: 200, height: 100))
    for (index, color) in [UIColor.red, .blue].enumerated() {
      let page = UIView(frame: CGRect(x: index * 100, y: 0, width: 100, height: 100))
      page.backgroundColor = color
      view.addSubview(page)
    }
    let window = UIWindow(frame: view.bounds)
    let controller = UIViewController()
    controller.view = view
    window.rootViewController = controller
    window.makeKeyAndVisible()
    defer { window.isHidden = true }
    window.layoutIfNeeded()
    try await Task.sleep(nanoseconds: 100_000_000)
    for rtl in [false, true] {
      let pages = try ReaderImageExport.renderedPages(view: view, start: 4, end: 5, columns: 2, rtl: rtl)
      #expect(pages.map(\.position) == [4, 5])
      #expect(pages.allSatisfy { $0.image.size == CGSize(width: 100, height: 100) })
      let colors = pages.map { pixel($0.image) }
      #expect(colors == (rtl ? [[0, 0, 255, 255], [255, 0, 0, 255]] : [[255, 0, 0, 255], [0, 0, 255, 255]]))
      let files = try ReaderImageExport.writePages(pages)
      #expect(files.count == 2)
      for (index, file) in files.enumerated() {
        let exported = try #require(UIImage(contentsOfFile: URL(string: file["uri"] as! String)!.path))
        #expect(pixel(exported) == colors[index])
      }
    }
    let single = try ReaderImageExport.renderedPages(view: view, start: 1, end: 1, columns: 1, rtl: false)
    #expect(single.count == 1)
    #expect(single[0].image.size == view.bounds.size)
    #expect(throws: (any Error).self) {
      try ReaderImageExport.renderedPages(view: UIView(), start: 1, end: 1, columns: 1, rtl: false)
    }
  }

  @Test
  @MainActor
  func pdfExportsOnlyVisiblePagesInDocumentOrder() throws {
    let document = PDFDocument()
    for color in [UIColor.red, .green, .blue] {
      let image = UIGraphicsImageRenderer(size: CGSize(width: 100, height: 150)).image { context in
        color.setFill()
        context.fill(CGRect(x: 0, y: 0, width: 100, height: 150))
      }
      document.insert(PDFPage(image: image)!, at: document.pageCount)
    }
    let view = PDFView(frame: CGRect(x: 0, y: 0, width: 400, height: 300))
    view.document = document
    view.displayMode = .singlePage
    view.autoScales = true
    view.layoutIfNeeded()
    view.go(to: document.page(at: 0)!)
    let single = try ReaderImageExport.pdfPages(view: view)
    #expect(single.map(\.position) == [1])
    #expect(near(pixel(try #require(single.first).image), [255, 0, 0, 255]))
    view.displayMode = .twoUp
    view.displaysAsBook = true
    view.go(to: document.page(at: 1)!)
    view.layoutIfNeeded()
    let spread = try ReaderImageExport.pdfPages(view: view)
    #expect(spread.map(\.position) == [2, 3])
    #expect(zip(spread, [[0, 255, 0, 255], [0, 0, 255, 255]]).allSatisfy { near(pixel($0.image), $1) })
    #expect(throws: (any Error).self) { try ReaderImageExport.pdfPages(view: PDFView()) }
  }

  private func pixel(_ image: UIImage) -> [UInt8] {
    var rgba = [UInt8](repeating: 0, count: 4)
    rgba.withUnsafeMutableBytes { bytes in
      let context = CGContext(data: bytes.baseAddress, width: 1, height: 1, bitsPerComponent: 8, bytesPerRow: 4, space: CGColorSpaceCreateDeviceRGB(), bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue)!
      context.draw(image.cgImage!, in: CGRect(x: 0, y: 0, width: 1, height: 1))
    }
    return rgba
  }

  private func near(_ actual: [UInt8], _ expected: [UInt8]) -> Bool {
    // PDFKit may JPEG-compress PDFPage(image:); allow its 1-2 level rounding.
    zip(actual, expected).allSatisfy { abs(Int($0) - Int($1)) <= 2 }
  }
}
