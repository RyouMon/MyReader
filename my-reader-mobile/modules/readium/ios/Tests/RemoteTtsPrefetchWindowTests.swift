import ReadiumShared
import Testing
@testable import Readium

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
    ]) == .start(1)
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
