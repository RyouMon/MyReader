import AVFoundation
import Foundation
import Testing
@testable import Readium

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
  let engine = RemoteTTSEngine(profileId: "narration", voiceId: "narration", speed: 1.5, pitch: 1,
    onRequest: { requestID = $0.requestId }, onCancel: { _ in }, onBuffering: { _, _ in })
  let playback = Task { await engine.speak(text: text, language: "en-US", onSpeakRange: { ranges.append(String(text[$0])) }) }
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
  if case let .failure(error) = await playback.value { Issue.record("Mixed playback failed: \(error)") }
  #expect(ranges.contains("Hi"))
  #expect(ranges.contains("Hello."))
  engine.cancelAll()
}
