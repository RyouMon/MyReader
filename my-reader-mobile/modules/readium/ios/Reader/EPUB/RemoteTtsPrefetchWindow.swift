import Foundation
import ReadiumNavigator
import ReadiumShared

struct RemoteTtsSpeechKey: Hashable {
  let text: String
  let language: String
}

struct RemoteTtsPrefetchUtterance {
  let key: RemoteTtsSpeechKey
  let locator: Locator
}

func remoteTtsPrefetchWindow(
  candidates: [RemoteTtsPrefetchUtterance],
  anchor: Locator?,
  limit: Int
) -> [RemoteTtsPrefetchUtterance] {
  precondition(limit > 0)
  let startIndex: Int
  if let anchor {
    guard let index = candidates.firstIndex(where: { $0.locator == anchor }) else {
      return []
    }
    startIndex = index
  } else {
    startIndex = 0
  }
  return Array(candidates.dropFirst(startIndex).prefix(limit))
}

@MainActor
enum RemoteTtsPrefetchWindow {
  private static let windowSize = 3
  private static let maxScannedUtterances = 128

  static func load(
    publication: Publication,
    start: Locator?,
    anchor: Locator?,
    defaultLanguage: Language?
  ) async -> [RemoteTtsPrefetchUtterance] {
    guard let loader = Loader(
      publication: publication,
      start: start,
      defaultLanguage: defaultLanguage
    ) else { return [] }

    var candidates: [RemoteTtsPrefetchUtterance] = []
    while candidates.count < maxScannedUtterances, !Task.isCancelled {
      guard let utterance = await loader.nextUtterance() else { break }
      candidates.append(utterance)
      let window = remoteTtsPrefetchWindow(
        candidates: candidates,
        anchor: anchor,
        limit: windowSize
      )
      if window.count == windowSize { return window }
    }
    guard !Task.isCancelled else { return [] }
    return remoteTtsPrefetchWindow(
      candidates: candidates,
      anchor: anchor,
      limit: windowSize
    )
  }

  private final class Loader {
    private let publication: Publication
    private let defaultLanguage: Language?
    private let iterator: ContentIterator
    private let tokenizer: ContentTokenizer
    private var buffered: [RemoteTtsPrefetchUtterance] = []

    init?(publication: Publication, start: Locator?, defaultLanguage: Language?) {
      guard let iterator = publication.content(from: start)?.iterator() else {
        return nil
      }
      self.publication = publication
      self.defaultLanguage = defaultLanguage
      self.iterator = iterator
      tokenizer = PublicationSpeechSynthesizer.defaultTokenizerFactory(
        defaultLanguage ?? publication.metadata.language
      )
    }

    func nextUtterance() async -> RemoteTtsPrefetchUtterance? {
      while buffered.isEmpty, !Task.isCancelled {
        do {
          guard let element = try await iterator.next() else { return nil }
          buffered = try tokenizer(element).flatMap(utterances)
        } catch {
          return nil
        }
      }
      guard !Task.isCancelled, !buffered.isEmpty else { return nil }
      return buffered.removeFirst()
    }

    private func utterances(for element: ContentElement) -> [RemoteTtsPrefetchUtterance] {
      func utterance(
        text: String,
        locator: Locator,
        authoredLanguage: Language? = nil
      ) -> RemoteTtsPrefetchUtterance? {
        guard text.contains(where: { $0.isLetter || $0.isNumber }) else {
          return nil
        }
        let specificLanguage = authoredLanguage == publication.metadata.language
          ? nil
          : authoredLanguage
        let language = specificLanguage
          ?? defaultLanguage
          ?? publication.metadata.language
          ?? Language.current
        return RemoteTtsPrefetchUtterance(
          key: RemoteTtsSpeechKey(text: text, language: language.code.bcp47),
          locator: locator
        )
      }

      switch element {
      case let element as TextContentElement:
        return element.segments.compactMap { segment in
          utterance(
            text: segment.text,
            locator: segment.locator,
            authoredLanguage: segment.language
          )
        }

      case let element as TextualContentElement:
        guard let text = element.text, !text.isEmpty,
              let value = utterance(text: text, locator: element.locator) else {
          return []
        }
        return [value]

      default:
        return []
      }
    }
  }
}
