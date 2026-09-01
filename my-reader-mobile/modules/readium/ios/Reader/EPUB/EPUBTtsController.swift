import AVFoundation
import Foundation
import ReadiumNavigator
import ReadiumShared
import UIKit

private final class SystemTtsUtteranceDelegate: AVTTSEngineDelegate {
  let speed: Double
  let pitch: Double

  init(speed: Double, pitch: Double) {
    self.speed = speed
    self.pitch = pitch
  }

  func avTTSEngine(_ engine: AVTTSEngine, didCreateUtterance utterance: AVSpeechUtterance) {
    let rate = Double(AVSpeechUtteranceDefaultSpeechRate) * speed
    utterance.rate = Float(
      min(max(rate, Double(AVSpeechUtteranceMinimumSpeechRate)),
          Double(AVSpeechUtteranceMaximumSpeechRate))
    )
    utterance.pitchMultiplier = Float(min(max(pitch, 0.5), 2))
  }
}

func ttsUtteranceStartIndex(
  target: Locator.Text,
  candidates: [Locator.Text]
) -> Int? {
  guard let targetContext = normalizedTtsLocatorContext(target) else {
    return nil
  }
  return candidates.firstIndex { candidate in
    guard let candidateContext = normalizedTtsLocatorContext(candidate) else {
      return false
    }
    let targetInsideCandidate = targetContext
      .occurrences(in: candidateContext.characters)
      .contains {
        let targetHighlight = (
          $0 + targetContext.highlight.lowerBound
        ) ..< (
          $0 + targetContext.highlight.upperBound
        )
        return targetHighlight.overlaps(candidateContext.highlight)
      }
    if targetInsideCandidate { return true }

    return candidateContext.occurrences(in: targetContext.characters).contains {
      let candidateHighlight = (
        $0 + candidateContext.highlight.lowerBound
      ) ..< (
        $0 + candidateContext.highlight.upperBound
      )
      return candidateHighlight.overlaps(targetContext.highlight)
    }
  }
}

private struct NormalizedTtsLocatorContext {
  let characters: [Character]
  let highlight: Range<Int>

  func occurrences(in value: [Character]) -> [Int] {
    guard !characters.isEmpty, characters.count <= value.count else { return [] }
    return (0 ... value.count - characters.count).filter { start in
      value[start ..< start + characters.count].elementsEqual(characters)
    }
  }
}

private func normalizedTtsLocatorContext(
  _ text: Locator.Text
) -> NormalizedTtsLocatorContext? {
  guard let highlight = text.highlight, !highlight.isEmpty else { return nil }
  let startMarker: Character = "\u{E000}"
  let endMarker: Character = "\u{E001}"
  let marked = [
    text.before ?? "",
    String(startMarker),
    highlight,
    String(endMarker),
    text.after ?? "",
  ].joined()
  let normalized = marked
    .split(whereSeparator: { $0.isWhitespace })
    .joined(separator: " ")
  let markedCharacters = Array(normalized)
  guard let start = markedCharacters.firstIndex(of: startMarker),
        let end = markedCharacters.firstIndex(of: endMarker),
        start < end else { return nil }

  return NormalizedTtsLocatorContext(
    characters: markedCharacters.filter {
      $0 != startMarker && $0 != endMarker
    },
    highlight: start ..< end - 1
  )
}

enum TtsStartLocatorMatch: Equatable {
  case passthrough
  case skip
  case start(Int)
}

final class TtsStartLocatorMatcher {
  private var target: Locator.Text?

  func reset(target: Locator.Text?) {
    self.target = target?.highlight?.isEmpty == false ? target : nil
  }

  func match(in candidates: [Locator.Text]) -> TtsStartLocatorMatch {
    guard let target else { return .passthrough }
    guard let index = ttsUtteranceStartIndex(
      target: target,
      candidates: candidates
    ) else { return .skip }
    self.target = nil
    return .start(index)
  }
}

private final class StartLocatorContentTokenizer {
  private let startLocatorMatcher = TtsStartLocatorMatcher()

  func reset(target: Locator.Text?) {
    startLocatorMatcher.reset(target: target)
  }

  func make(defaultLanguage: Language?) -> ContentTokenizer {
    let tokenize = PublicationSpeechSynthesizer.defaultTokenizerFactory(
      defaultLanguage
    )
    return { [weak self] element in
      let elements = try tokenize(element)
      return self?.trimToStartLocator(elements) ?? elements
    }
  }

  private func trimToStartLocator(
    _ elements: [ContentElement]
  ) -> [ContentElement] {
    guard startLocatorMatcher.match(in: []) != .passthrough else {
      return elements
    }
    for index in elements.indices {
      guard var textElement = elements[index] as? TextContentElement,
            !textElement.segments.isEmpty else { continue }
      switch startLocatorMatcher.match(
        in: textElement.segments.map(\.locator.text)
      ) {
      case .passthrough:
        return elements
      case .skip:
        continue
      case let .start(startIndex):
        textElement.segments = Array(textElement.segments[startIndex...])
        var result = Array(elements[index...])
        result[0] = textElement
        return result
      }
    }
    return []
  }
}

@MainActor
final class EPUBTtsController: NSObject, PublicationSpeechSynthesizerDelegate {
  private static let decorationGroup = "tts"

  private let navigator: EPUBNavigatorViewController
  private let publication: Publication
  private let config: TtsEngineConfigRecord
  private let synthesizer: PublicationSpeechSynthesizer
  private let remoteEngine: RemoteTTSEngine?
  private let systemDelegate: SystemTtsUtteranceDelegate?
  private let startLocatorTokenizer: StartLocatorContentTokenizer
  private let onStateChange: ([String: Any]) -> Void
  private let onSynthesisCancel: ([String: Any]) -> Void
  private let shouldFollowText: () -> Bool
  private let onFollowTextNavigation: (UUID, Locator, Bool) -> Void
  private var stopRequested = false
  private var emitStoppedState = true
  private var highlightedUtterance: PublicationSpeechSynthesizer.Utterance?
  private var followedUtterance: PublicationSpeechSynthesizer.Utterance?
  private var currentUtterance: PublicationSpeechSynthesizer.Utterance?
  private var currentLocator: Locator?
  private var remoteBufferingKey: RemoteTtsSpeechKey?
  private var paused = false
  private var followTextTask: Task<Void, Never>?
  private var remotePrefetchTask: Task<Void, Never>?
  private var remotePrefetchAnchor: Locator?
  private var remotePrefetchRevision = 0

  init?(
    publication: Publication,
    navigator: EPUBNavigatorViewController,
    config: TtsEngineConfigRecord,
    onStateChange: @escaping ([String: Any]) -> Void,
    onSynthesisRequest: @escaping ([String: Any]) -> Void,
    onSynthesisCancel: @escaping ([String: Any]) -> Void,
    shouldFollowText: @escaping () -> Bool,
    onFollowTextNavigation: @escaping (UUID, Locator, Bool) -> Void
  ) {
    self.navigator = navigator
    self.publication = publication
    self.config = config
    self.onStateChange = onStateChange
    self.onSynthesisCancel = onSynthesisCancel
    self.shouldFollowText = shouldFollowText
    self.onFollowTextNavigation = onFollowTextNavigation
    let startLocatorTokenizer = StartLocatorContentTokenizer()
    self.startLocatorTokenizer = startLocatorTokenizer

    let engineFactory: PublicationSpeechSynthesizer.EngineFactory
    var bufferingHandler: ((RemoteTtsSpeechKey, Bool) -> Void)?
    if config.kind == "provider" {
      guard let profileId = config.profileId, !profileId.isEmpty,
            let voiceId = config.voiceId, !voiceId.isEmpty else { return nil }
      let engine = RemoteTTSEngine(
        profileId: profileId,
        voiceId: voiceId,
        speed: config.speed,
        pitch: config.pitch,
        onRequest: { request in
          onSynthesisRequest(request.dictionary)
        },
        onCancel: { requestIds in
          onSynthesisCancel(["requestIds": requestIds])
        },
        onBuffering: { key, buffering in bufferingHandler?(key, buffering) }
      )
      remoteEngine = engine
      systemDelegate = nil
      engineFactory = { engine }
    } else {
      let delegate = SystemTtsUtteranceDelegate(
        speed: config.speed,
        pitch: config.pitch
      )
      systemDelegate = delegate
      remoteEngine = nil
      engineFactory = { AVTTSEngine(delegate: delegate) }
    }

    let speechConfig = PublicationSpeechSynthesizer.Configuration(
      defaultLanguage: config.language.map { Language(code: .bcp47($0)) },
      voiceIdentifier: config.kind == "system" ? config.voiceId : nil
    )
    guard let synthesizer = PublicationSpeechSynthesizer(
      publication: publication,
      config: speechConfig,
      engineFactory: engineFactory,
      tokenizerFactory: { defaultLanguage in
        startLocatorTokenizer.make(defaultLanguage: defaultLanguage)
      }
    ) else { return nil }
    self.synthesizer = synthesizer
    super.init()
    synthesizer.delegate = self
    bufferingHandler = { [weak self] key, buffering in
      self?.remoteBufferingChanged(key: key, buffering: buffering)
    }
  }

  func start(from locator: Locator?) async {
    stopRequested = false
    onStateChange(["state": "loading"])
    let startLocator: Locator?
    if let locator {
      startLocator = locator
    } else {
      startLocator = await navigator.firstVisibleElementLocator()
    }
    invalidateRemotePrefetch()
    remoteEngine?.cancelAll()
    startLocatorTokenizer.reset(target: startLocator?.text)
    synthesizer.start(from: startLocator)
  }

  func play() {
    switch synthesizer.state {
    case .stopped:
      Task { @MainActor [weak self] in await self?.start(from: nil) }
    case .paused:
      synthesizer.resume()
    case .playing:
      break
    }
  }

  func pause() {
    synthesizer.pause()
  }

  func prepareForUserNavigation() {
    invalidateFollowTextNavigation()
  }

  func stop(emitState: Bool = true) {
    stopRequested = true
    emitStoppedState = emitState
    invalidateFollowTextNavigation()
    invalidateRemotePrefetch()
    remoteEngine?.cancelAll()
    synthesizer.stop()
    clearHighlight()
  }

  func previous() {
    synthesizer.previous()
  }

  func next() {
    synthesizer.next()
  }

  func complete(_ completion: TtsSynthesisCompletionRecord) {
    remoteEngine?.complete(completion)
  }

  func publicationSpeechSynthesizer(
    _ synthesizer: PublicationSpeechSynthesizer,
    stateDidChange state: PublicationSpeechSynthesizer.State
  ) {
    switch state {
    case .stopped:
      let shouldEmitState = emitStoppedState
      let shouldClearHighlight = !stopRequested
      emitStoppedState = true
      invalidateRemotePrefetch()
      remoteEngine?.cancelAll()
      currentUtterance = nil
      currentLocator = nil
      remoteBufferingKey = nil
      paused = false
      if shouldClearHighlight { clearHighlight() }
      if shouldEmitState {
        onStateChange(["state": stopRequested ? "stopped" : "ended"])
      }

    case let .paused(utterance):
      currentUtterance = utterance
      currentLocator = utterance.locator
      paused = true
      updateHighlight(for: utterance)
      scheduleRemotePrefetch(from: utterance.locator)
      onStateChange(statePayload("paused", utterance: utterance, locator: utterance.locator))

    case let .playing(utterance, range):
      currentUtterance = utterance
      currentLocator = range ?? utterance.locator
      paused = false
      updateHighlight(for: utterance)
      scheduleRemotePrefetch(from: utterance.locator)
      let buffering = remoteBufferingKey == speechKey(for: utterance)
      if !buffering { followText(for: utterance) }
      onStateChange(
        statePayload(
          buffering ? "loading" : "playing",
          utterance: utterance,
          locator: range ?? utterance.locator
        )
      )
    }
  }

  func publicationSpeechSynthesizer(
    _ synthesizer: PublicationSpeechSynthesizer,
    utterance: PublicationSpeechSynthesizer.Utterance,
    didFailWithError error: PublicationSpeechSynthesizer.Error
  ) {
    var payload = statePayload("error", utterance: utterance, locator: utterance.locator)
    payload["error"] = String(describing: error)
    onStateChange(payload)
  }

  private func statePayload(
    _ state: String,
    utterance: PublicationSpeechSynthesizer.Utterance,
    locator: Locator
  ) -> [String: Any] {
    [
      "state": state,
      "utterance": utterance.text,
      "locator": locatorToDict(locator),
      "canGoPrevious": true,
      "canGoNext": true,
    ]
  }

  private func updateHighlight(for utterance: PublicationSpeechSynthesizer.Utterance) {
    guard highlightedUtterance != utterance else { return }
    highlightedUtterance = utterance
    let tint = config.highlightColor.flatMap(UIColor.fromCSS)
      ?? UIColor(red: 0.96, green: 0.78, blue: 0.67, alpha: 0.72)
    navigator.apply(
      decorations: [
        Decoration(
          id: "tts-current-sentence",
          locator: utterance.locator,
          style: .highlight(tint: tint)
        ),
      ],
      in: Self.decorationGroup
    )
  }

  private func followText(for utterance: PublicationSpeechSynthesizer.Utterance) {
    guard shouldFollowText(), followedUtterance != utterance else { return }
    followTextTask?.cancel()
    followedUtterance = utterance
    followTextTask = Task { @MainActor [weak self] in
      guard let self, !Task.isCancelled, self.shouldFollowText() else { return }
      let navigationId = UUID()
      self.onFollowTextNavigation(navigationId, utterance.locator, true)
      defer {
        self.onFollowTextNavigation(navigationId, utterance.locator, false)
      }
      guard !Task.isCancelled, self.shouldFollowText() else { return }
      _ = await self.navigator.go(
        to: utterance.locator,
        options: NavigatorGoOptions(animated: false)
      )
    }
  }

  private func remoteBufferingChanged(
    key: RemoteTtsSpeechKey,
    buffering: Bool
  ) {
    if buffering {
      remoteBufferingKey = key
    } else if remoteBufferingKey == key {
      remoteBufferingKey = nil
    }
    guard let utterance = currentUtterance,
          let locator = currentLocator,
          speechKey(for: utterance) == key else { return }
    if !buffering { followText(for: utterance) }
    onStateChange(
      statePayload(
        buffering ? "loading" : (paused ? "paused" : "playing"),
        utterance: utterance,
        locator: locator
      )
    )
  }

  private var configuredLanguage: Language? {
    config.language.map { Language(code: .bcp47($0)) }
  }

  private func speechKey(
    for utterance: PublicationSpeechSynthesizer.Utterance
  ) -> RemoteTtsSpeechKey {
    let language = utterance.language
      ?? configuredLanguage
      ?? publication.metadata.language
      ?? Language.current
    return RemoteTtsSpeechKey(text: utterance.text, language: language.code.bcp47)
  }

  private func scheduleRemotePrefetch(from anchor: Locator) {
    guard let remoteEngine else { return }
    guard remotePrefetchAnchor != anchor else { return }
    remotePrefetchAnchor = anchor
    remotePrefetchRevision += 1
    let revision = remotePrefetchRevision
    remotePrefetchTask?.cancel()
    remotePrefetchTask = Task { @MainActor [weak self, weak remoteEngine] in
      guard let self, let remoteEngine else { return }
      let window = await RemoteTtsPrefetchWindow.load(
        publication: self.publication,
        start: anchor,
        anchor: anchor,
        defaultLanguage: self.configuredLanguage
      )
      guard !Task.isCancelled,
            revision == self.remotePrefetchRevision,
            self.remoteEngine === remoteEngine else { return }
      remoteEngine.setPrefetchWindow(window)
      self.remotePrefetchTask = nil
    }
  }

  private func invalidateRemotePrefetch() {
    remotePrefetchRevision += 1
    remotePrefetchTask?.cancel()
    remotePrefetchTask = nil
    remotePrefetchAnchor = nil
  }

  private func invalidateFollowTextNavigation() {
    followTextTask?.cancel()
    followTextTask = nil
    followedUtterance = nil
  }

  private func clearHighlight() {
    highlightedUtterance = nil
    invalidateFollowTextNavigation()
    navigator.apply(decorations: [], in: Self.decorationGroup)
  }
}
