import AVFoundation
import Foundation
import ReadiumNavigator
import ReadiumShared

struct RemoteTtsSynthesisRequest {
  let requestId: String
  let key: RemoteTtsSpeechKey
  let profileId: String
  let voiceId: String
  let speed: Double
  let pitch: Double

  var dictionary: [String: Any] {
    [
      "requestId": requestId,
      "text": key.text,
      "language": key.language,
      "profileId": profileId,
      "voiceId": voiceId,
      "speed": speed,
      "pitch": pitch,
    ]
  }
}

@MainActor
final class RemoteTTSEngine: NSObject, @preconcurrency TTSEngine, @preconcurrency AVAudioPlayerDelegate {
  private final class CacheEntry {
    let id = UUID().uuidString
    let key: RemoteTtsSpeechKey
    var completion: TtsSynthesisCompletionRecord?

    init(key: RemoteTtsSpeechKey) {
      self.key = key
    }
  }

  private final class ActivePlayback {
    let key: RemoteTtsSpeechKey
    let text: String
    let onSpeakRange: (Range<String.Index>) -> Void
    var continuation: CheckedContinuation<Result<Void, TTSError>, Never>?
    var player: AVAudioPlayer?
    var rangeTasks: [Task<Void, Never>] = []

    init(
      key: RemoteTtsSpeechKey,
      text: String,
      onSpeakRange: @escaping (Range<String.Index>) -> Void
    ) {
      self.key = key
      self.text = text
      self.onSpeakRange = onSpeakRange
    }
  }

  private struct PlaybackError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
  }

  let availableVoices: [TTSVoice] = []

  private let profileId: String
  private let voiceId: String
  private let speed: Double
  private let pitch: Double
  private let onRequest: (RemoteTtsSynthesisRequest) -> Void
  private let onCancel: ([String]) -> Void
  private let onBuffering: (RemoteTtsSpeechKey, Bool) -> Void
  private var entries: [RemoteTtsSpeechKey: CacheEntry] = [:]
  private var keysByRequestId: [String: RemoteTtsSpeechKey] = [:]
  private var desiredKeys: Set<RemoteTtsSpeechKey> = []
  private var active: ActivePlayback?

  init(
    profileId: String,
    voiceId: String,
    speed: Double,
    pitch: Double,
    onRequest: @escaping (RemoteTtsSynthesisRequest) -> Void,
    onCancel: @escaping ([String]) -> Void,
    onBuffering: @escaping (RemoteTtsSpeechKey, Bool) -> Void
  ) {
    self.profileId = profileId
    self.voiceId = voiceId
    self.speed = speed
    self.pitch = pitch
    self.onRequest = onRequest
    self.onCancel = onCancel
    self.onBuffering = onBuffering
  }

  func setPrefetchWindow(_ utterances: [RemoteTtsPrefetchUtterance]) {
    var nextKeys = Set(utterances.map(\.key))
    if let active { nextKeys.insert(active.key) }
    desiredKeys = nextKeys

    var cancelled: [String] = []
    let stale = entries.filter { !nextKeys.contains($0.key) }
    for (key, entry) in stale {
      if entry.completion == nil { cancelled.append(entry.id) }
      entries.removeValue(forKey: key)
      keysByRequestId.removeValue(forKey: entry.id)
    }
    utterances.forEach { _ = ensureEntry(for: $0.key) }
    if !cancelled.isEmpty { onCancel(cancelled) }
  }

  func speak(
    _ utterance: TTSUtterance,
    onSpeakRange: @escaping (Range<String.Index>) -> Void
  ) async -> Result<Void, TTSError> {
    let key = RemoteTtsSpeechKey(
      text: utterance.text,
      language: utterance.language.code.bcp47
    )
    let playback = ActivePlayback(
      key: key,
      text: utterance.text,
      onSpeakRange: onSpeakRange
    )

    return await withTaskCancellationHandler {
      await withCheckedContinuation { continuation in
        if let previous = active {
          previous.player?.stop()
          finish(previous, result: .success(()))
        }
        active = playback
        playback.continuation = continuation
        let entry = ensureEntry(for: key)
        if let completion = entry.completion {
          startPlayback(playback, completion: completion)
        } else {
          onBuffering(key, true)
        }
      }
    } onCancel: {
      Task { @MainActor [weak self] in
        self?.cancel(playback)
      }
    }
  }

  func complete(_ completion: TtsSynthesisCompletionRecord) {
    guard let key = keysByRequestId[completion.requestId],
          let entry = entries[key],
          entry.id == completion.requestId else { return }
    entry.completion = completion
    if let active, active.key == key {
      startPlayback(active, completion: completion)
    }
  }

  func cancelAll() {
    let cancelled = entries.values.compactMap { entry in
      entry.completion == nil ? entry.id : nil
    }
    if let active {
      active.player?.stop()
      active.rangeTasks.forEach { $0.cancel() }
      active.continuation?.resume(returning: .success(()))
      active.continuation = nil
      self.active = nil
    }
    entries.removeAll()
    keysByRequestId.removeAll()
    desiredKeys.removeAll()
    if !cancelled.isEmpty { onCancel(cancelled) }
  }

  func audioPlayerDidFinishPlaying(_ player: AVAudioPlayer, successfully flag: Bool) {
    guard let playback = active, playback.player === player else { return }
    if flag {
      finish(playback, result: .success(()))
    } else {
      fail(
        playback,
        error: .other(PlaybackError(message: "Synthesized audio playback failed."))
      )
    }
  }

  func audioPlayerDecodeErrorDidOccur(_ player: AVAudioPlayer, error: Error?) {
    guard let playback = active, playback.player === player else { return }
    fail(
      playback,
      error: .other(error ?? PlaybackError(message: "Unable to decode synthesized audio."))
    )
  }

  private func ensureEntry(for key: RemoteTtsSpeechKey) -> CacheEntry {
    if let entry = entries[key] { return entry }
    let entry = CacheEntry(key: key)
    entries[key] = entry
    keysByRequestId[entry.id] = key
    onRequest(
      RemoteTtsSynthesisRequest(
        requestId: entry.id,
        key: key,
        profileId: profileId,
        voiceId: voiceId,
        speed: speed,
        pitch: pitch
      )
    )
    return entry
  }

  private func startPlayback(
    _ playback: ActivePlayback,
    completion: TtsSynthesisCompletionRecord
  ) {
    guard active === playback, playback.player == nil else { return }
    if let error = completion.error, !error.isEmpty {
      fail(playback, error: .other(PlaybackError(message: error)))
      return
    }
    guard let path = completion.path, !path.isEmpty else {
      fail(
        playback,
        error: .other(PlaybackError(message: "TTS provider returned no audio path."))
      )
      return
    }

    do {
      let url = path.hasPrefix("file://")
        ? URL(string: path)!
        : URL(fileURLWithPath: path)
      let player = try AVAudioPlayer(contentsOf: url)
      player.delegate = self
      if let rate = completion.playbackRate {
        player.enableRate = true
        player.rate = Float(rate)
      }
      guard player.prepareToPlay(), player.play() else {
        throw PlaybackError(message: "Unable to start synthesized audio playback.")
      }
      playback.player = player
      onBuffering(playback.key, false)
      scheduleTimings(completion.timings ?? [], for: playback)
    } catch {
      fail(playback, error: .other(error))
    }
  }

  private func cancel(_ playback: ActivePlayback) {
    guard active === playback else { return }
    playback.player?.stop()
    finish(playback, result: .success(()))
  }

  private func finish(
    _ playback: ActivePlayback,
    result: Result<Void, TTSError>
  ) {
    guard active === playback else { return }
    playback.rangeTasks.forEach { $0.cancel() }
    playback.rangeTasks.removeAll()
    playback.player?.delegate = nil
    playback.player = nil
    active = nil
    playback.continuation?.resume(returning: result)
    playback.continuation = nil
    if !desiredKeys.contains(playback.key) {
      removeEntry(for: playback.key)
    }
  }

  private func fail(_ playback: ActivePlayback, error: TTSError) {
    finish(playback, result: .failure(error))
    removeEntry(for: playback.key)
  }

  private func removeEntry(for key: RemoteTtsSpeechKey) {
    guard let entry = entries.removeValue(forKey: key) else { return }
    keysByRequestId.removeValue(forKey: entry.id)
    if entry.completion == nil { onCancel([entry.id]) }
  }

  private func scheduleTimings(
    _ timings: [TtsTimingRecord],
    for playback: ActivePlayback
  ) {
    playback.rangeTasks = timings.compactMap { timing in
      guard let range = stringRange(
        in: playback.text,
        startUtf16: timing.startUtf16,
        endUtf16: timing.endUtf16
      ) else { return nil }

      return Task { @MainActor [weak self, weak playback] in
        let delay = max(timing.startMs, 0)
        if delay > 0 {
          try? await Task.sleep(nanoseconds: UInt64(delay * 1_000_000))
        }
        guard !Task.isCancelled,
              let self,
              let playback,
              self.active === playback else { return }
        playback.onSpeakRange(range)
      }
    }
  }

  private func stringRange(
    in text: String,
    startUtf16: Int,
    endUtf16: Int
  ) -> Range<String.Index>? {
    guard startUtf16 >= 0,
          endUtf16 >= startUtf16,
          endUtf16 <= text.utf16.count else { return nil }
    let lowerUtf16 = text.utf16.index(text.utf16.startIndex, offsetBy: startUtf16)
    let upperUtf16 = text.utf16.index(text.utf16.startIndex, offsetBy: endUtf16)
    guard let lower = String.Index(lowerUtf16, within: text),
          let upper = String.Index(upperUtf16, within: text) else { return nil }
    return lower ..< upper
  }
}
