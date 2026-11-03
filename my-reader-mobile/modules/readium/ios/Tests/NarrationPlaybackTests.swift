import AVFoundation
import Foundation
@testable import ReadiumNavigator
import ReadiumShared
import Testing
import XCTest
@testable import Readium

@Test
@MainActor
func narration_marks_preserve_style_and_escape_character_names() throws {
  let style = try #require(StyleData(type: "myreader-narration", tint: "#C4622D", isActive: nil).toDecorationStyle())
  #expect(style.id == readerNarrationStyleId)
  let color = try #require(style.config as? ReaderNoteMarkerStyleConfig)
  #expect(color.tint.cssHex.uppercased() == "#C4622D")
  let locator = Locator(href: AnyURL(string: "chapter.xhtml")!, mediaType: .xhtml)
  let decoration = Decoration(id: "plan-1", locator: locator, style: style,
    userInfo: ["characterName": "<script>alert(\"角色\")</script> & 旁白"])
  let html = readerNarrationTemplate().element(decoration)

  #expect(html.contains("&lt;script&gt;alert(&quot;角色&quot;)&lt;/script&gt; &amp; 旁白"))
  #expect(!html.contains("<script>"))
  #expect(html.contains("data-myreader-overlay=\"true\""))
}

@Test
@MainActor
func narration_accepts_single_audio_completion_without_requesting_sentence_prefetch() async throws {
  let url = try narrationAudioFixture()
  defer { try? FileManager.default.removeItem(at: url) }
  let player = try NarrationTestAudioPlayer(contentsOf: url)
  var requests: [RemoteTtsSynthesisRequest] = []
  var ranges: [String] = []
  let text = "Hello."
  let engine = RemoteTTSEngine(profileId: "narration", voiceId: "narration", speed: 1, pitch: 1,
    onRequest: { requests.append($0) }, onCancel: { _ in }, onBuffering: { _, _ in }, makeAudioPlayer: { _ in player })
  defer { engine.cancelAll() }
  engine.setPrefetchWindow([RemoteTtsPrefetchUtterance(key: .init(text: "Next speaker.", language: "en"),
    locator: Locator(href: AnyURL(string: "chapter.xhtml")!, mediaType: .xhtml))])
  #expect(requests.isEmpty)
  let playback = Task { await engine.speak(text: text, language: "en", onSpeakRange: { ranges.append(String(text[$0])) }) }
  while requests.isEmpty { await Task.yield() }
  let completion = TtsSynthesisCompletionRecord()
  completion.requestId = requests[0].requestId
  completion.path = url.path
  engine.complete(completion)
  #expect(ranges == [text])
  player.delegate?.audioPlayerDidFinishPlaying?(player, successfully: true)
  if case let .failure(error) = await playback.value { Issue.record("Playback failed: \(error)") }
  #expect(requests.count == 1)
}

@Test
@MainActor
func narration_plays_all_segments_before_completing_the_source_utterance() async throws {
  let url = try narrationAudioFixture()
  defer { try? FileManager.default.removeItem(at: url) }
  var requestID: String?
  let engine = RemoteTTSEngine(profileId: "narration", voiceId: "narration", speed: 1, pitch: 1,
    onRequest: { requestID = $0.requestId }, onCancel: { _ in }, onBuffering: { _, _ in })
  let text = "她说：你好😀"
  var ranges: [String] = []
  let playback = Task { await engine.speak(text: text, language: "zh", onSpeakRange: { ranges.append(String(text[$0])) }) }
  while requestID == nil { await Task.yield() }
  var first = TtsPlaybackSegmentRecord()
  first.text = "她说："; first.startUtf16 = 0; first.endUtf16 = 3; first.path = url.path
  var second = TtsPlaybackSegmentRecord()
  second.text = "你好😀"; second.startUtf16 = 3; second.endUtf16 = 7; second.path = url.path
  var completion = TtsSynthesisCompletionRecord()
  completion.requestId = requestID!; completion.segments = [first, second]
  engine.complete(completion)
  let result = await playback.value
  if case let .failure(error) = result { Issue.record("Playback failed: \(error)") }
  #expect(ranges == ["她说：", "你好😀"])
  engine.cancelAll()
}

@Test
@MainActor
func narration_cancellation_discards_a_late_completion() async {
  var requestID: String?
  var cancelled: [String] = []
  var spoken: [String] = []
  let engine = RemoteTTSEngine(profileId: "narration", voiceId: "narration", speed: 1, pitch: 1,
    onRequest: { requestID = $0.requestId }, onCancel: { cancelled += $0 }, onBuffering: { _, _ in })
  let playback = Task { await engine.speak(text: "hello", language: "en", onSpeakRange: { _ in spoken.append("late") }) }
  while requestID == nil { await Task.yield() }
  engine.cancelAll()
  _ = await playback.value
  var completion = TtsSynthesisCompletionRecord()
  completion.requestId = requestID!; completion.path = "/missing.wav"
  engine.complete(completion)
  #expect(cancelled == [requestID!])
  #expect(spoken.isEmpty)
}

@Test
@MainActor
func narration_rejects_a_segment_that_does_not_match_the_source() async {
  var requestID: String?
  let engine = RemoteTTSEngine(profileId: "narration", voiceId: "narration", speed: 1, pitch: 1,
    onRequest: { requestID = $0.requestId }, onCancel: { _ in }, onBuffering: { _, _ in })
  let playback = Task { await engine.speak(text: "hello", language: "en", onSpeakRange: { _ in Issue.record("Invalid source was highlighted") }) }
  while requestID == nil { await Task.yield() }
  var segment = TtsPlaybackSegmentRecord()
  segment.text = "edited"; segment.startUtf16 = 0; segment.endUtf16 = 5
  var completion = TtsSynthesisCompletionRecord()
  completion.requestId = requestID!; completion.segments = [segment]
  engine.complete(completion)
  if case .success = await playback.value { Issue.record("Invalid source was accepted") }
}

@Test
@MainActor
func adaptive_audio_waits_for_more_segments_without_replaying_or_finishing_early() async throws {
  let url = try narrationAudioFixture()
  defer { try? FileManager.default.removeItem(at: url) }
  var requests: [RemoteTtsSynthesisRequest] = []
  var players: [NarrationTestAudioPlayer] = []
  var buffering: [Bool] = []
  var ranges: [String] = []
  var completed = false
  let text = "One. Two. Three."
  let engine = RemoteTTSEngine(profileId: "provider", voiceId: "voice", speed: 1, pitch: 1,
    onRequest: { requests.append($0) }, onCancel: { _ in }, onBuffering: { _, value in buffering.append(value) },
    makeAudioPlayer: { url in
      let player = try NarrationTestAudioPlayer(contentsOf: url)
      players.append(player)
      return player
    })
  engine.onUtteranceCompleted = { completed = true }
  defer { engine.cancelAll() }
  let playback = Task { await engine.speak(text: text, language: "en", onSpeakRange: { ranges.append(String(text[$0])) }) }
  while requests.isEmpty { await Task.yield() }
  func segment(_ text: String, _ start: Int) -> TtsPlaybackSegmentRecord {
    var result = TtsPlaybackSegmentRecord()
    result.text = text; result.startUtf16 = start; result.endUtf16 = start + text.utf16.count; result.path = url.path
    return result
  }
  var completion = TtsSynthesisCompletionRecord()
  completion.requestId = requests[0].requestId
  completion.segments = [segment("One. ", 0)]
  completion.isFinal = false
  engine.complete(completion)
  #expect(players.count == 1)
  players[0].delegate?.audioPlayerDidFinishPlaying?(players[0], successfully: true)
  #expect(!completed)
  #expect(buffering.last == true)
  completion.segments?.append(segment("Two. ", 5))
  engine.complete(completion)
  #expect(players.count == 2)
  completion.segments?.append(segment("Three.", 10))
  completion.isFinal = true
  engine.complete(completion)
  #expect(players.count == 2)
  players[1].delegate?.audioPlayerDidFinishPlaying?(players[1], successfully: true)
  #expect(players.count == 3)
  #expect(!completed)
  players[2].delegate?.audioPlayerDidFinishPlaying?(players[2], successfully: true)
  if case let .failure(error) = await playback.value { Issue.record("Playback failed: \(error)") }
  #expect(completed)
  #expect(ranges == ["One. ", "Two. ", "Three."])
}

@Test
@MainActor
func cancelling_partial_audio_cancels_the_remaining_synthesis() async throws {
  let url = try narrationAudioFixture()
  defer { try? FileManager.default.removeItem(at: url) }
  let player = try NarrationTestAudioPlayer(contentsOf: url)
  var requests: [RemoteTtsSynthesisRequest] = []
  var cancelled: [String] = []
  let engine = RemoteTTSEngine(profileId: "provider", voiceId: "voice", speed: 1, pitch: 1,
    onRequest: { requests.append($0) }, onCancel: { cancelled += $0 }, onBuffering: { _, _ in }, makeAudioPlayer: { _ in player })
  let playback = Task { await engine.speak(text: "One. Two.", language: "en", onSpeakRange: { _ in }) }
  while requests.isEmpty { await Task.yield() }
  var segment = TtsPlaybackSegmentRecord()
  segment.text = "One. "; segment.endUtf16 = 5; segment.path = url.path
  var completion = TtsSynthesisCompletionRecord()
  completion.requestId = requests[0].requestId; completion.segments = [segment]; completion.isFinal = false
  engine.complete(completion)
  engine.cancelAll()
  _ = await playback.value
  #expect(cancelled == [completion.requestId])
  engine.complete(completion)
  #expect(player.delegate == nil)
}

private func narrationAudioFixture() throws -> URL {
  let url = FileManager.default.temporaryDirectory.appendingPathComponent("narration-\(UUID().uuidString).wav")
  let format = AVAudioFormat(standardFormatWithSampleRate: 44100, channels: 1)!
  let buffer = AVAudioPCMBuffer(pcmFormat: format, frameCapacity: 4410)!
  buffer.frameLength = 4410
  buffer.floatChannelData![0].initialize(repeating: 0, count: 4410)
  let file = try AVAudioFile(forWriting: url, settings: format.settings)
  try file.write(from: buffer)
  return url
}

@Test(.timeLimit(.minutes(1)))
@MainActor
func narration_system_voice_follows_audio_without_advancing_the_source_early() async throws {
  let url = try narrationAudioFixture()
  defer { try? FileManager.default.removeItem(at: url) }
  var requestID: String?
  var ranges: [String] = []
  let text = "Hi. Hello."
  let player = try NarrationTestAudioPlayer(contentsOf: url)
  let wordHighlighted = XCTestExpectation(description: "Audio word highlighted before completion")
  var completed = false
  let engine = RemoteTTSEngine(profileId: "narration", voiceId: "narration", speed: 1.5, pitch: 1,
    onRequest: { requestID = $0.requestId }, onCancel: { _ in }, onBuffering: { _, _ in }, makeAudioPlayer: { _ in player })
  engine.onUtteranceCompleted = { completed = true }
  defer { engine.cancelAll() }
  let playback = Task { await engine.speak(text: text, language: "en-US", onSpeakRange: {
    let spoken = String(text[$0])
    ranges.append(spoken)
    if spoken == "Hi" { wordHighlighted.fulfill() }
  }) }
  while requestID == nil { await Task.yield() }
  var first = TtsPlaybackSegmentRecord()
  first.text = "Hi. "; first.endUtf16 = 4; first.path = url.absoluteString; first.playbackRate = 1.2
  var timing = TtsTimingRecord()
  timing.startUtf16 = 0; timing.endUtf16 = 2; timing.startMs = 1; timing.endMs = 20
  first.timings = [timing]
  var second = TtsPlaybackSegmentRecord()
  second.text = "Hello."; second.startUtf16 = 4; second.endUtf16 = 10; second.systemVoiceId = ""
  var completion = TtsSynthesisCompletionRecord()
  completion.requestId = requestID!; completion.segments = [first, second]
  engine.complete(completion)
  let highlighted = await XCTWaiter.fulfillment(of: [wordHighlighted], timeout: 5)
  try #require(highlighted == .completed)
  #expect(ranges == ["Hi. ", "Hi"])
  #expect(!completed)
  player.delegate?.audioPlayerDidFinishPlaying?(player, successfully: true)
  if case let .failure(error) = await playback.value { Issue.record("Mixed playback failed: \(error)") }
  #expect(ranges.contains("Hi"))
  #expect(ranges.contains("Hello."))
  #expect(completed)
}

private final class NarrationTestAudioPlayer: AVAudioPlayer {
  override func prepareToPlay() -> Bool { true }
  override func play() -> Bool { true }
  override func stop() {}
}

extension ReaderWindowTests {
  @Test
  @MainActor
  func narration_reader_requests_the_current_locator_without_prefetching_future_speech() async throws {
    let href = AnyURL(string: "chapter.xhtml")!
    let start = Locator(href: href, mediaType: .xhtml,
      locations: .init(progression: 0, totalProgression: 0, position: 1))
    let html = Data("<html xmlns=\"http://www.w3.org/1999/xhtml\"><body><p>First speaker. Second speaker.</p></body></html>".utf8)
    let publication = Publication(
      manifest: Manifest(metadata: Metadata(languages: ["en"]), readingOrder: [Link(href: href.string, mediaType: .xhtml)]),
      container: SingleResourceContainer(resource: DataResource(data: html), at: href),
      servicesBuilder: .init(
        content: DefaultContentService.makeFactory(resourceContentIteratorFactories: [HTMLResourceContentIterator.Factory()]),
        positions: InMemoryPositionsService.makeFactory(positionsByReadingOrder: [[start]])
      )
    )
    let reader = try EPUBViewController(publication: publication, locator: start, bookId: "narration-test")
    let config = TtsEngineConfigRecord()
    config.kind = "provider"; config.profileId = "narration"; config.voiceId = "narration"; config.language = "en"
    let requested = XCTestExpectation(description: "Current sentence requested")
    var requests: [[String: Any]] = []
    var cancelled: [String] = []
    let controller = try #require(EPUBTtsController(
      publication: publication, navigator: reader.epubNavigator, config: config,
      onStateChange: { _ in },
      onSynthesisRequest: { payload in
        requests.append(payload)
        if requests.count == 1 { requested.fulfill() }
      },
      onSynthesisCancel: { cancelled += $0["requestIds"] as? [String] ?? [] },
      shouldFollowText: { false }, onFollowTextNavigation: { _, _, _ in }
    ))
    defer { controller.stop() }
    await controller.start(from: start)
    let result = await XCTWaiter.fulfillment(of: [requested], timeout: 15)
    try #require(result == .completed)
    let request = try #require(requests.first)
    let locator = try #require(request["locator"] as? [String: Any])
    let text = try #require(request["text"] as? String)
    #expect(locator["href"] as? String == href.string)
    #expect((locator["text"] as? [String: Any])?["highlight"] as? String == text)
    #expect(text.contains("First speaker."))
    #expect(!text.contains("Second speaker."))
    #expect(requests.count == 1)
    controller.stop()
    #expect(cancelled.contains(try #require(request["requestId"] as? String)))
  }
}
