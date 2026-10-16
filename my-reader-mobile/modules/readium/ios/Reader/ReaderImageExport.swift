import Foundation
import PDFKit
import ReadiumShared
import UIKit
import WebKit

enum ReaderImageExport {
  @MainActor
  static func images(publication: Publication, href: String?, position: Int, visibleHrefs: [String], render: () async throws -> [(image: UIImage, position: Int)]) async throws -> [[String: Any]] {
    if let href { return [try await resource(href, publication: publication, position: position)] }
    if !visibleHrefs.isEmpty, visibleHrefs.allSatisfy({ href in
      guard let url = AnyURL(string: href) else { return false }
      return publication.linkWithHREF(url)?.mediaType?.string.hasPrefix("image/") == true
    }) {
      var files: [[String: Any]] = []
      for href in visibleHrefs {
        files.append(try await resource(href, publication: publication, position: position))
      }
      return files
    }
    return try writePages(await render())
  }

  @MainActor
  static func renderedPages(view: UIView, start: Int, end: Int, columns: Int, rtl: Bool) throws -> [(image: UIImage, position: Int)] {
    guard view.bounds.width > 0, view.bounds.height > 0 else { throw NSError(domain: "ReadiumImage", code: 3) }
    return (0..<columns).map { index in
      let width = view.bounds.width / CGFloat(columns)
      let x = CGFloat(rtl ? columns - index - 1 : index) * width
      let image = UIGraphicsImageRenderer(size: CGSize(width: width, height: view.bounds.height)).image { context in
        context.cgContext.translateBy(x: -x, y: 0)
        view.drawHierarchy(in: view.bounds, afterScreenUpdates: true)
      }
      return (image, min(end, start + (end - start + 1) * index / columns))
    }
  }

  @MainActor
  static func pdfPages(view: PDFView) throws -> [(image: UIImage, position: Int)] {
    guard let document = view.document else { throw NSError(domain: "ReadiumImage", code: 5) }
    return view.visiblePages.sorted { document.index(for: $0) < document.index(for: $1) }.map { page in
      let bounds = page.bounds(for: .cropBox)
      let scale = max(1, min(3, (view.window?.screen.scale ?? 2) * view.scaleFactor))
      return (page.thumbnail(of: CGSize(width: bounds.width * scale, height: bounds.height * scale), for: .cropBox), document.index(for: page) + 1)
    }
  }

  static func writePages(_ pages: [(image: UIImage, position: Int)]) throws -> [[String: Any]] {
    try pages.map { page in
      guard let data = page.image.pngData() else { throw NSError(domain: "ReadiumImage", code: 4) }
      return try write(data, name: "page.png", mimeType: "image/png", position: page.position)
    }
  }

  static func imageLink(in publication: Publication, source: String) -> ReadiumShared.Link? {
    guard let sourceURL = URL(string: source) else { return nil }
    let path = sourceURL.path
    return (publication.readingOrder + publication.resources).first { link in
      guard link.mediaType?.string.hasPrefix("image/") == true,
            let url = URL(string: link.href) else { return false }
      return path == url.path || path.hasSuffix("/" + url.path.trimmingCharacters(in: CharacterSet(charactersIn: "/")))
    }
  }

  static func resource(_ href: String, publication: Publication, position: Int) async throws -> [String: Any] {
    guard let url = AnyURL(string: href),
          let link = publication.linkWithHREF(url),
          link.mediaType?.string.hasPrefix("image/") == true,
          let resource = publication.get(link) else {
      throw NSError(domain: "ReadiumImage", code: 1, userInfo: [NSLocalizedDescriptionKey: "Image resource unavailable"])
    }
    let bytes = try await resource.read().get()
    let page = publication.readingOrder.firstIndex { $0.href == href }.map { $0 + 1 } ?? position
    return try write(bytes, name: URL(string: href)?.lastPathComponent ?? "image", mimeType: link.mediaType?.string ?? "application/octet-stream", position: page)
  }

  static func write(_ bytes: Data, name: String, mimeType: String, position: Int) throws -> [String: Any] {
    let root = FileManager.default.temporaryDirectory.appendingPathComponent("reader-images", isDirectory: true)
    try FileManager.default.createDirectory(at: root, withIntermediateDirectories: true)
    for url in (try? FileManager.default.contentsOfDirectory(at: root, includingPropertiesForKeys: [.contentModificationDateKey])) ?? [] {
      if let date = try? url.resourceValues(forKeys: [.contentModificationDateKey]).contentModificationDate,
         Date().timeIntervalSince(date) > 86400 { try? FileManager.default.removeItem(at: url) }
    }
    let directory = root.appendingPathComponent(UUID().uuidString, isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    let file = directory.appendingPathComponent((name as NSString).lastPathComponent)
    try bytes.write(to: file, options: .atomic)
    return ["uri": file.absoluteString, "name": file.lastPathComponent, "mimeType": mimeType, "position": position]
  }
}

final class ReaderImageMessageHandler: NSObject, WKScriptMessageHandler {
  private let onImage: (String) -> Void
  init(onImage: @escaping (String) -> Void) { self.onImage = onImage }
  func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
    guard let body = message.body as? [String: String], let source = body["src"] else { return }
    onImage(source)
  }
}
