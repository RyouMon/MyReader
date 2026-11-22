import Foundation
import WebKit

/// The book never enters the host page. Core supplies an origin scoped to one conversion.
@MainActor
final class FormatParser: NSObject, WKScriptMessageHandler, WKNavigationDelegate {
  private let view: WKWebView
  private let entry: URL
  private var continuation: CheckedContinuation<Void, Error>?
  private var timeout: Task<Void, Never>?

  init(entry: URL) {
    self.entry = entry
    let config = WKWebViewConfiguration()
    config.websiteDataStore = .nonPersistent()
    view = WKWebView(frame: .zero, configuration: config)
    super.init()
  }

  static func run(_ address: String) async throws {
    guard let url = URL(string: address), url.scheme == "http", url.host == "127.0.0.1", url.port != nil else {
      throw URLError(.badURL)
    }
    let parser = FormatParser(entry: url)
    try await parser.start()
  }

  private func start() async throws {
    try await withCheckedThrowingContinuation { (result: CheckedContinuation<Void, Error>) in
      continuation = result
      view.navigationDelegate = self
      view.configuration.userContentController.add(self, name: "readerFormat")
      timeout = Task { [weak self] in
        do { try await Task.sleep(nanoseconds: 180_000_000_000) } catch { return }
        self?.finish(.failure(URLError(.timedOut)))
      }
      view.load(URLRequest(url: entry))
    }
  }

  func userContentController(_ controller: WKUserContentController, didReceive message: WKScriptMessage) {
    guard message.frameInfo.isMainFrame, message.frameInfo.request.url == entry, let value = message.body as? String else { return }
    finish(value == "ok" ? .success(()) : .failure(NSError(domain: "Publication", code: 1, userInfo: [NSLocalizedDescriptionKey: value])))
  }

  func webView(_ webView: WKWebView, didFailProvisionalNavigation navigation: WKNavigation!, withError error: Error) { finish(.failure(error)) }
  func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) { finish(.failure(error)) }
  func webViewWebContentProcessDidTerminate(_ webView: WKWebView) { finish(.failure(URLError(.networkConnectionLost))) }

  private func finish(_ result: Result<Void,Error>) {
    timeout?.cancel()
    view.configuration.userContentController.removeScriptMessageHandler(forName: "readerFormat")
    view.navigationDelegate = nil
    view.stopLoading()
    continuation?.resume(with: result)
    continuation = nil
  }
}
