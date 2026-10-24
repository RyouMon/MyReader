package com.myreader.readium.reader

import android.media.MediaPlayer
import android.media.PlaybackParams
import org.robolectric.annotation.Implements
import org.robolectric.annotation.Implementation
import android.speech.tts.TextToSpeech
import org.robolectric.shadows.ShadowTextToSpeech
import com.myreader.readium.Types.TtsTimingRecord
import android.os.Looper
import com.myreader.readium.Types.TtsPlaybackSegmentRecord
import com.myreader.readium.Types.TtsSynthesisCompletionRecord
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.readium.navigator.media.tts.TtsEngine
import org.readium.r2.shared.ExperimentalReadiumApi
import org.robolectric.RobolectricTestRunner
import org.robolectric.RuntimeEnvironment
import org.robolectric.Shadows.shadowOf
import org.robolectric.annotation.Config
import org.robolectric.annotation.LooperMode
import org.robolectric.shadows.ShadowMediaPlayer
import org.robolectric.shadows.util.DataSource

@OptIn(ExperimentalReadiumApi::class)
@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35], shadows = [NarrationMediaPlayerShadow::class])
@LooperMode(LooperMode.Mode.PAUSED)
class NarrationPlaybackTest {
  private class Events : TtsEngine.Listener<RemoteTtsError> {
    val events = mutableListOf<String>()
    val ranges = mutableListOf<IntRange>()
    override fun onStart(requestId: TtsEngine.RequestId) { events += "start" }
    override fun onRange(requestId: TtsEngine.RequestId, range: IntRange) { ranges += range }
    override fun onInterrupted(requestId: TtsEngine.RequestId) { events += "interrupted" }
    override fun onFlushed(requestId: TtsEngine.RequestId) { events += "flushed" }
    override fun onDone(requestId: TtsEngine.RequestId) { events += "done" }
    override fun onError(requestId: TtsEngine.RequestId, error: RemoteTtsError) { events += error.message }
  }

  @Test
  fun advances_the_source_only_after_all_voice_segments_and_offsets_ranges() {
    val players = mutableListOf<MediaPlayer>()
    ShadowMediaPlayer.setCreateListener { player, _ -> players += player }
    ShadowMediaPlayer.addMediaInfo(DataSource.toDataSource("/fixture.wav"), ShadowMediaPlayer.MediaInfo(1000, 0))
    val requests = mutableListOf<RemoteTtsSynthesisRequest>()
    val events = Events()
    val engine = engine(requests)
    engine.setListener(events)
    engine.speak(TtsEngine.RequestId("source"), "她说：你好😀", null)
    engine.complete(TtsSynthesisCompletionRecord(requestId = requests.single().requestId, segments = listOf(segment("她说：", 0, 3), segment("你好😀", 3, 7))))
    shadowOf(Looper.getMainLooper()).idle()
    assertEquals(listOf("start"), events.events)
    shadowOf(players[0]).invokeCompletionListener()
    shadowOf(Looper.getMainLooper()).idle()
    assertEquals(2, players.size)
    assertEquals(listOf("start"), events.events)
    shadowOf(players[1]).invokeCompletionListener()
    assertEquals(listOf("start", "done"), events.events)
    assertEquals(listOf(0 until 3, 3 until 7), events.ranges)
    engine.close()
  }

  @Test
  fun stop_cancels_pending_analysis_and_ignores_late_audio() {
    val requests = mutableListOf<RemoteTtsSynthesisRequest>()
    val cancelled = mutableListOf<String>()
    val events = Events()
    val engine = engine(requests, cancelled)
    engine.setListener(events)
    engine.speak(TtsEngine.RequestId("source"), "hello", null)
    engine.cancelAll()
    engine.complete(TtsSynthesisCompletionRecord(requestId = requests.single().requestId, path = "/missing.wav"))
    assertEquals(listOf(requests.single().requestId), cancelled)
    assertEquals(listOf("flushed"), events.events)
    assertTrue(events.ranges.isEmpty())
    engine.close()
  }

  @Test
  fun rejects_a_segment_that_rewrites_original_text() {
    val requests = mutableListOf<RemoteTtsSynthesisRequest>()
    val events = Events()
    val engine = engine(requests)
    engine.setListener(events)
    engine.speak(TtsEngine.RequestId("source"), "hello", null)
    engine.complete(TtsSynthesisCompletionRecord(requestId = requests.single().requestId, segments = listOf(segment("edited", 0, 5))))
    assertEquals(listOf("NARRATION_PLAN_INVALID"), events.events)
    assertTrue(events.ranges.isEmpty())
    engine.close()
  }

  @Test
  fun system_voice_and_provider_audio_share_one_source_completion() {
    val players = mutableListOf<MediaPlayer>()
    ShadowMediaPlayer.setCreateListener { player, _ -> players += player }
    ShadowMediaPlayer.addMediaInfo(DataSource.toDataSource("/fixture.wav"), ShadowMediaPlayer.MediaInfo(1000, 0))
    val requests = mutableListOf<RemoteTtsSynthesisRequest>()
    val events = Events()
    val engine = engine(requests)
    engine.setListener(events)
    engine.speak(TtsEngine.RequestId("source"), "Hi there", null)
    engine.complete(TtsSynthesisCompletionRecord(requestId = requests.single().requestId, segments = listOf(
      TtsPlaybackSegmentRecord(text = "Hi ", startUtf16 = 0, endUtf16 = 3, systemVoiceId = ""),
      TtsPlaybackSegmentRecord(text = "there", startUtf16 = 3, endUtf16 = 8, path = "/fixture.wav", playbackRate = 1.5, timings = listOf(TtsTimingRecord(startUtf16 = 0, endUtf16 = 2, startMs = 0.0, endMs = 20.0)))
    )))
    val speech = ShadowTextToSpeech.getLastTextToSpeechInstance()
    val shadow = shadowOf(speech)
    shadow.onInitListener.onInit(TextToSpeech.SUCCESS)
    shadowOf(Looper.getMainLooper()).idle()
    assertEquals("Hi ", shadow.lastSpokenText)
    assertEquals(listOf("start"), events.events)
    assertEquals(1, players.size)
    assertTrue(events.ranges.contains(3 until 5))
    assertEquals(1.5f, players.single().playbackParams.speed, 0.0f)
    shadowOf(players.single()).invokeCompletionListener()
    assertEquals(listOf("start", "done"), events.events)
    engine.close()
    assertTrue(shadow.isShutdown)
  }

  @Test
  fun unavailable_system_voice_reports_failure_and_stop_still_flushes() {
    val requests = mutableListOf<RemoteTtsSynthesisRequest>()
    val events = Events()
    val engine = engine(requests)
    engine.setListener(events)
    engine.speak(TtsEngine.RequestId("source"), "Hi", null)
    engine.complete(TtsSynthesisCompletionRecord(requestId = requests.single().requestId, segments = listOf(TtsPlaybackSegmentRecord(text = "Hi", endUtf16 = 2, systemVoiceId = ""))))
    shadowOf(ShadowTextToSpeech.getLastTextToSpeechInstance()).onInitListener.onInit(TextToSpeech.ERROR)
    shadowOf(Looper.getMainLooper()).idle()
    assertEquals(listOf("TTS_SYSTEM_UNAVAILABLE"), events.events)
    engine.close()
  }

  private fun engine(requests: MutableList<RemoteTtsSynthesisRequest>, cancelled: MutableList<String> = mutableListOf()) =
    RemoteTtsEngine(RuntimeEnvironment.getApplication(), "narration", "narration", RemoteTtsPreferences(),
      onRequest = { requests += it }, onCancel = { cancelled += it }, onBuffering = { _, _ -> })

  private fun segment(text: String, start: Int, end: Int) = TtsPlaybackSegmentRecord(text = text, startUtf16 = start, endUtf16 = end, path = "/fixture.wav")
}

// Robolectric does not implement MediaPlayer's playback parameters.
@Implements(MediaPlayer::class)
class NarrationMediaPlayerShadow : ShadowMediaPlayer() {
  private var params = PlaybackParams().allowDefaults()
  @Implementation
  protected fun getPlaybackParams(): PlaybackParams = params
  @Implementation
  protected fun setPlaybackParams(value: PlaybackParams) { params = value }
}
