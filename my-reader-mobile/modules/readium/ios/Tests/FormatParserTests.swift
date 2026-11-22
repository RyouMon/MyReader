import Foundation
import Network
import Testing
@testable import Readium

/// Exercise WebKit's real script message and origin, including a parser-reported failure.
@Test @MainActor
func parserReceivesOnlyItsLocalSessionResult() async throws {
  let listener = try NWListener(using: .tcp, on: .any)
  defer { listener.cancel() }
  let queue = DispatchQueue(label: "FormatParserTests")
  listener.newConnectionHandler = { connection in
    connection.start(queue: queue)
    connection.receive(minimumIncompleteLength: 1, maximumLength: 4096) { data, _, _, _ in
      let failure = String(decoding: data ?? Data(), as: UTF8.self).hasPrefix("GET /failure ")
      let message = failure ? "Invalid book" : "ok"
      let page = "<script>webkit.messageHandlers.readerFormat.postMessage('\(message)')</script>"
      let response = "HTTP/1.1 200 OK\r\nContent-Type: text/html\r\nContent-Length: \(page.utf8.count)\r\nConnection: close\r\n\r\n\(page)"
      connection.send(content: Data(response.utf8), completion: .contentProcessed { _ in connection.cancel() })
    }
  }
  let port: UInt16 = try await withCheckedThrowingContinuation { continuation in
    listener.stateUpdateHandler = { state in
      switch state {
      case .ready:
        listener.stateUpdateHandler = nil
        continuation.resume(returning: listener.port!.rawValue)
      case .failed(let error):
        listener.stateUpdateHandler = nil
        continuation.resume(throwing: error)
      default: break
      }
    }
    listener.start(queue: queue)
  }
  let origin = "http://127.0.0.1:\(port)"
  try await FormatParser.run(origin + "/ready")
  do {
    try await FormatParser.run(origin + "/failure")
    Issue.record("A parser error must reach the caller")
  } catch {
    #expect(error.localizedDescription == "Invalid book")
  }
  await #expect(throws: URLError.self) { try await FormatParser.run("file:///book") }
}
