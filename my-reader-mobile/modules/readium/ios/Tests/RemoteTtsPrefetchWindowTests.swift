import ExpoModulesCore
import ReadiumShared
import Testing
@testable import Readium

@Test
@MainActor
func should_expose_dispatchers_for_reader_lifecycle_events() {
  let view = ReadiumView(appContext: nil)
  let dispatchers = Set(
    Mirror(reflecting: view).children.compactMap { child in
      child.value is EventDispatcher ? child.label : nil
    }
  )

  #expect(dispatchers.contains("onPublicationReady"))
  #expect(dispatchers.contains("onTtsStateChange"))
}

@Test
func should_anchor_repeated_text_to_the_readium_locator() {
  let first = utterance(position: 1, text: "Again.")
  let second = utterance(position: 2, text: "Between.")
  let repeated = utterance(position: 3, text: "Again.")
  let next = utterance(position: 4, text: "After.")

  let window = remoteTtsPrefetchWindow(
    candidates: [first, second, repeated, next],
    anchor: repeated.locator,
    limit: 3
  )

  #expect(window.map(\.locator) == [repeated.locator, next.locator])
}

@Test
func should_reject_a_projection_without_the_current_readium_locator() {
  let candidates = [
    utterance(position: 1, text: "First."),
    utterance(position: 2, text: "Second."),
  ]

  let window = remoteTtsPrefetchWindow(
    candidates: candidates,
    anchor: locator(position: 99, text: "Missing."),
    limit: 3
  )

  #expect(window.isEmpty)
}

@Test
func should_limit_an_unanchored_startup_projection() {
  let candidates = (1 ... 4).map {
    utterance(position: $0, text: "Sentence \($0).")
  }

  let window = remoteTtsPrefetchWindow(
    candidates: candidates,
    anchor: nil,
    limit: 3
  )

  #expect(window.map(\.locator) == candidates.prefix(3).map(\.locator))
}

@Test
func should_start_with_the_sentence_containing_the_selected_locator_context() {
  let target = Locator.Text(
    after: "econd sentence to move the highlight",
    before: "first sentence aloud. Tap this ",
    highlight: "s"
  )
  let sentences = [
    Locator.Text(
      after: " Tap this second sentence to move",
      highlight: "MyReader reads this first sentence aloud."
    ),
    Locator.Text(
      after: " This third sentence proves that",
      before: "MyReader reads this first sentence aloud. ",
      highlight: "Tap this second sentence to move the highlight immediately."
    ),
    Locator.Text(
      before: "sentence to move the highlight immediately. ",
      highlight: "This third sentence proves that narration follows the tapped text."
    ),
  ]

  #expect(ttsUtteranceStartIndex(target: target, candidates: sentences) == 1)
  let matcher = TtsStartLocatorMatcher()
  matcher.reset(target: target)
  #expect(
    matcher.match(in: sentences) == .start(index: 1, characterOffset: 9)
  )
}

@Test
func should_clip_a_sentence_to_the_viewport_start() {
  let target = Locator.Text(
    after: "ontinues here. Next complete",
    before: "the previous page and ",
    highlight: "c"
  )
  let matcher = TtsStartLocatorMatcher()
  matcher.reset(target: target)

  #expect(
    matcher.match(in: [
      Locator.Text(
        after: " Next complete sentence.",
        highlight: "A sentence begins on the previous page and continues here."
      ),
      Locator.Text(
        before: "continues here. ",
        highlight: "Next complete sentence."
      ),
    ]) == .start(index: 0, characterOffset: 43)
  )
}

@Test
func should_speak_and_locate_only_the_visible_sentence_suffix() {
  let targetText = Locator.Text(
    after: "ontinues here. Next complete",
    before: "the previous page and ",
    highlight: "c"
  )
  var target = locator(position: 2, text: "c")
  target.locations.progression = nil
  target.locations.otherLocations["cssSelector"] = .string("p")
  target.locations.otherLocations["domRange"] = [
    "start": ["cssSelector": "p", "textNodeIndex": 0, "charOffset": 43],
  ]
  target.text = targetText

  let sentence = "A sentence begins on the previous page and continues here."
  var sentenceLocator = locator(position: 1, text: sentence)
  sentenceLocator.text.after = " Next complete sentence."
  let segment = TextContentElement.Segment(
    locator: sentenceLocator,
    text: sentence
  )
  let tokenizer = StartLocatorContentTokenizer()
  tokenizer.reset(target: target)

  let elements = tokenizer.trimToStartLocator([
    TextContentElement(
      locator: segment.locator,
      role: .body,
      segments: [segment]
    ),
  ])
  let clipped = (elements.first as? TextContentElement)?.segments.first

  #expect(clipped?.text == "continues here.")
  #expect(clipped?.locator.locations.position == 2)
  #expect(clipped?.locator.locations.otherLocations["domRange"] == nil)
  #expect(clipped?.locator.text.highlight == "continues here.")
}

@Test
func should_keep_a_complete_sentence_at_the_viewport_start() {
  let target = Locator.Text(
    after: "ext complete sentence.",
    before: "continues here. ",
    highlight: "N"
  )
  let matcher = TtsStartLocatorMatcher()
  matcher.reset(target: target)

  #expect(
    matcher.match(in: [
      Locator.Text(highlight: "A sentence continues here."),
      Locator.Text(
        before: "continues here. ",
        highlight: "Next complete sentence."
      ),
    ]) == .start(index: 1, characterOffset: 0)
  )
}

@Test
func should_keep_looking_after_an_earlier_content_block_misses_the_start_locator() {
  let target = Locator.Text(
    after: " this second sentence",
    before: "first sentence aloud. ",
    highlight: "Tap"
  )
  let matcher = TtsStartLocatorMatcher()
  matcher.reset(target: target)

  #expect(matcher.match(in: [Locator.Text(highlight: "TTS verification")]) == .skip)
  #expect(
    matcher.match(in: [
      Locator.Text(highlight: "MyReader reads this first sentence aloud."),
      Locator.Text(
        before: "MyReader reads this first sentence aloud. ",
        highlight: "Tap this second sentence to move the highlight immediately."
      ),
    ]) == .start(index: 1, characterOffset: 0)
  )
  #expect(matcher.match(in: [Locator.Text(highlight: "After.")]) == .passthrough)
}

@Test
func should_match_a_selection_whose_context_crosses_a_content_block_boundary() {
  let target = Locator.Text(
    after: " reads this first sentence aloud. Tap this second sentence to move the highlight immediately.",
    before: "TTS verification\n    ",
    highlight: "MyReader"
  )
  let sentences = [
    Locator.Text(highlight: "TTS verification"),
    Locator.Text(
      after: " Tap this second sentence to move the highlight immediately.",
      highlight: "MyReader reads this first sentence aloud."
    ),
  ]

  #expect(ttsUtteranceStartIndex(target: target, candidates: sentences) == 1)
}

@Test
func should_not_select_the_previous_sentence_when_selection_begins_at_a_sentence_boundary() {
  let target = Locator.Text(
    after: "ap this second sentence to move",
    before: "reads this first sentence aloud. ",
    highlight: "T"
  )
  let sentences = [
    Locator.Text(
      after: " Tap this second sentence to move the highlight immediately.",
      highlight: "MyReader reads this first sentence aloud."
    ),
    Locator.Text(
      after: " This third sentence proves that",
      before: "MyReader reads this first sentence aloud. ",
      highlight: "Tap this second sentence to move the highlight immediately."
    ),
  ]

  #expect(ttsUtteranceStartIndex(target: target, candidates: sentences) == 1)
}

private func utterance(
  position: Int,
  text: String
) -> RemoteTtsPrefetchUtterance {
  RemoteTtsPrefetchUtterance(
    key: RemoteTtsSpeechKey(text: text, language: "en"),
    locator: locator(position: position, text: text)
  )
}

private func locator(position: Int, text: String) -> Locator {
  Locator(
    href: AnyURL(path: "chapter.xhtml")!,
    mediaType: .xhtml,
    locations: .init(position: position),
    text: .init(highlight: text)
  )
}
